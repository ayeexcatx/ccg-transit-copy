import { base44 } from '@/api/base44Client'; 
import { format, parseISO } from 'date-fns';
import { formatDispatchDateTimeLine } from '@/components/notifications/dispatchDateTimeFormat';
import { sendNotificationSmsIfEligible } from '@/components/notifications/notificationSmsDelivery';

const statusLabels = {
  Scheduled: 'Scheduled (details to follow)',
  Dispatch: 'Dispatch',
  Amended: 'Amended',
  Cancelled: 'Cancelled',
};

const NON_CONFIRMATION_CATEGORIES = new Set(['dispatch_update_info', 'driver_dispatch_confirmed']);

const DRIVER_NOTIFICATION_CATEGORY = 'driver_dispatch_update';
const DRIVER_CONFIRMED_NOTIFICATION_CATEGORY = 'driver_dispatch_confirmed';

function isDispatchCanceledStatus(status) {
  const normalized = String(status || '').toLowerCase();
  return normalized === 'cancelled' || normalized === 'canceled';
}

function getUniqueDriverIds(assignments = []) {
  return [...new Set((assignments || [])
    .filter((assignment) => assignment?.active_flag !== false)
    .map((assignment) => assignment?.driver_id)
    .filter(Boolean))];
}

async function buildDriverAccessCodeMap(driverIds = []) {
  const uniqueIds = [...new Set((driverIds || []).filter(Boolean))];
  if (!uniqueIds.length) return new Map();

  const results = await Promise.all(uniqueIds.map((driverId) =>
    base44.entities.Driver.filter({ id: driverId }, '-created_date', 1)
  ));

  return new Map(results
    .map((entries) => entries?.[0])
    .filter(Boolean)
    .map((driver) => [driver.id, driver.access_code_id])
    .filter(([, accessCodeId]) => Boolean(accessCodeId)));
}

async function createDriverDispatchNotification({
  dispatch,
  driverAccessCodeId,
  title,
  message,
}) {
  if (!dispatch?.id || !driverAccessCodeId || !title || !message) return;

  const notification = await base44.entities.Notification.create({
    recipient_type: 'AccessCode',
    recipient_access_code_id: driverAccessCodeId,
    recipient_id: driverAccessCodeId,
    recipient_company_id: dispatch.company_id,
    title,
    message: `${message}\n${formatDispatchDateTimeLine(dispatch)}`,
    related_dispatch_id: dispatch.id,
    read_flag: false,
    notification_category: DRIVER_NOTIFICATION_CATEGORY,
  });

  console.log('Notification created before SMS delivery (createDriverDispatchNotification)', {
    notificationId: notification?.id,
    recipientType: notification?.recipient_type,
    recipientAccessCodeId: notification?.recipient_access_code_id || null,
    recipientId: notification?.recipient_id || null,
    relatedDispatchId: notification?.related_dispatch_id || null,
  });

  await sendNotificationSmsIfEligible(notification);
}


export async function notifyOwnerDriverConfirmed({
  dispatch,
  assignments = [],
  driverName,
}) {
  try {
    if (!dispatch?.id || !dispatch?.company_id) return;

    const confirmedTrucks = [...new Set((assignments || [])
      .filter((assignment) => assignment?.active_flag !== false)
      .map((assignment) => assignment?.truck_number)
      .filter(Boolean))];
    if (!confirmedTrucks.length) return;

    const ownerCodes = await base44.entities.AccessCode.filter({
      company_id: dispatch.company_id,
      active_flag: true,
      code_type: 'CompanyOwner',
    }, '-created_date', 200);

    const jobTag = dispatch.reference_tag || dispatch.job_number || dispatch.id;
    const statusText = statusLabels[dispatch.status] || dispatch.status || 'Dispatch';
    const actorLabel = String(driverName || 'Driver').trim() || 'Driver';
    const title = `${actorLabel} confirmed the dispatch`;

    await Promise.all((ownerCodes || []).map(async (ownerCode) => {
      const relevantTrucks = confirmedTrucks.filter((truck) => (ownerCode.allowed_trucks || []).includes(truck));
      if (!relevantTrucks.length) return;

      const lineTwo = [
        dispatch.shift_time,
        statusText,
        jobTag,
        relevantTrucks.length <= 3 ? `Trucks: ${relevantTrucks.join(', ')}` : `${relevantTrucks.length} trucks confirmed`,
      ].filter(Boolean).join(' • ');

      await base44.entities.Notification.create({
        recipient_type: 'AccessCode',
        recipient_access_code_id: ownerCode.id,
        recipient_id: ownerCode.id,
        recipient_company_id: dispatch.company_id,
        title,
        message: `${formatDispatchDateTimeLine(dispatch)}
${lineTwo}`,
        related_dispatch_id: dispatch.id,
        read_flag: false,
        notification_category: DRIVER_CONFIRMED_NOTIFICATION_CATEGORY,
      });
    }));
  } catch (error) {
    console.error('Error creating driver confirmed notifications for company owners:', error);
  }
}

export async function notifyDriverAssignmentChanges(dispatch, previousAssignments = [], nextAssignments = []) {
  try {
    if (!dispatch?.id) return;

    const previousDriverIds = getUniqueDriverIds(previousAssignments);
    const nextDriverIds = getUniqueDriverIds(nextAssignments);

    const removedDriverIds = previousDriverIds.filter((id) => !nextDriverIds.includes(id));
    const addedDriverIds = nextDriverIds.filter((id) => !previousDriverIds.includes(id));
    const impactedDriverIds = [...new Set([...removedDriverIds, ...addedDriverIds])];
    if (!impactedDriverIds.length) return;

    const driverAccessCodeMap = await buildDriverAccessCodeMap(impactedDriverIds);

    await Promise.all([
      ...removedDriverIds.map((driverId) => createDriverDispatchNotification({
        dispatch,
        driverAccessCodeId: driverAccessCodeMap.get(driverId),
        title: 'Dispatch Canceled',
        message: 'Your dispatch has been canceled',
      })),
      ...addedDriverIds.map((driverId) => createDriverDispatchNotification({
        dispatch,
        driverAccessCodeId: driverAccessCodeMap.get(driverId),
        title: 'New Dispatch',
        message: 'You have received a new dispatch',
      })),
    ]);
  } catch (error) {
    console.error('Error creating driver assignment notifications:', error);
  }
}

export async function notifyDriversForDispatchUpdate(dispatch, driverAssignments = []) {
  try {
    if (!dispatch?.id) return;

    const assignedDriverIds = getUniqueDriverIds(driverAssignments);
    if (!assignedDriverIds.length) return;

    const driverAccessCodeMap = await buildDriverAccessCodeMap(assignedDriverIds);

    await Promise.all(assignedDriverIds.map((driverId) => createDriverDispatchNotification({
      dispatch,
      driverAccessCodeId: driverAccessCodeMap.get(driverId),
      title: isDispatchCanceledStatus(dispatch.status) ? 'Dispatch Canceled' : 'Dispatch Updated',
      message: isDispatchCanceledStatus(dispatch.status)
        ? 'Your dispatch has been canceled'
        : 'Your dispatch has been updated',
    })));
  } catch (error) {
    console.error('Error creating driver dispatch update notifications:', error);
  }
}

export async function notifyDriversForDispatchEdit({
  previousDispatch,
  nextDispatch,
  driverAssignments = [],
}) {
  try {
    if (!nextDispatch?.id) return;

    const assignedDriverIds = getUniqueDriverIds(driverAssignments);
    if (!assignedDriverIds.length) return;

    const driverAccessCodeMap = await buildDriverAccessCodeMap(assignedDriverIds);
    const cancelledNow = !isDispatchCanceledStatus(previousDispatch?.status) && isDispatchCanceledStatus(nextDispatch?.status);

    await Promise.all(assignedDriverIds.map((driverId) => createDriverDispatchNotification({
      dispatch: nextDispatch,
      driverAccessCodeId: driverAccessCodeMap.get(driverId),
      title: cancelledNow ? 'Dispatch Canceled' : 'Dispatch Updated',
      message: cancelledNow
        ? 'Your dispatch has been canceled'
        : 'Your dispatch has been updated',
    })));
  } catch (error) {
    console.error('Error creating driver dispatch edit notifications:', error);
  }
}

function getRelevantTrucks(dispatch, accessCode) {
  return (dispatch?.trucks_assigned || []).filter(t =>
    (accessCode?.allowed_trucks || []).includes(t)
  );
}

function reconcileExistingRequiredTrucks(notification, dispatch, accessCode) {
  const originalRequired = Array.isArray(notification?.required_trucks)
    ? notification.required_trucks
    : [];
  const currentDispatchTrucks = new Set(dispatch?.trucks_assigned || []);
  const allowedTrucks = new Set(accessCode?.allowed_trucks || []);

  return originalRequired.filter(truck =>
    currentDispatchTrucks.has(truck) && allowedTrucks.has(truck)
  );
}

function buildOwnerDispatchMessage(dispatch, statusText, relevantTrucks) {
  const truckSummary = relevantTrucks.length <= 3
    ? `Trucks: ${relevantTrucks.join(', ')}`
    : `${relevantTrucks.length} trucks assigned`;

  const dateText = formatDispatchDateTimeLine(dispatch);
  const isScheduledDetails = statusText === 'Scheduled (details to follow)' || statusText === 'Confirmed (details to follow)';
  const dateTimeText = isScheduledDetails ? dateText.split(' at ')[0] : dateText;

  const secondLineParts = [
    dispatch.shift_time,
    statusText,
    truckSummary,
  ].filter(Boolean);

  return `${dateTimeText}\n${secondLineParts.join(' • ')}`;
}

function parseStatusFromDedupKey(notification) {
  const parts = String(notification?.dispatch_status_key || '').split(':');
  return parts.length >= 2 ? parts[1] : '';
}

async function resolveStaleOwnerStatusNotifications(dispatchId, ownerAccessCodeId, currentStatus) {
  const ownerNotifications = await base44.entities.Notification.filter({
    recipient_type: 'AccessCode',
    related_dispatch_id: dispatchId,
  }, '-created_date', 500);

  const staleNotifications = (ownerNotifications || []).filter((notification) => {
    if (notification.read_flag) return false;
    if (NON_CONFIRMATION_CATEGORIES.has(notification.notification_category)) return false;

    const recipientId = notification.recipient_access_code_id || notification.recipient_id;
    if (recipientId !== ownerAccessCodeId) return false;

    const notificationStatus = parseStatusFromDedupKey(notification);
    if (!notificationStatus) return false;
    return notificationStatus !== currentStatus;
  });

  await Promise.all(staleNotifications.map((notification) =>
    base44.entities.Notification.update(notification.id, { read_flag: true })
  ));
}

/**
 * Create (or deduplicate) owner notifications for a dispatch status change.
 * One notification per CompanyOwner code per (dispatch, status).
 * Stores required_trucks so we can compute pending count later.
 */
export async function notifyDispatchChange(dispatch, oldStatus, newStatus, companies, accessCodes) {
  try {
    if (!dispatch?.id) return;

    // Fetch company if not provided
    let company = companies ? companies.find(c => c.id === dispatch.company_id) : null;
    if (!company) {
      const fetched = await base44.entities.Company.filter({ id: dispatch.company_id }, '-created_date', 1);
      company = fetched?.[0];
    }
    if (!company) return;

    // Fetch CompanyOwner access codes if not provided
    let ownerCodes = accessCodes
      ? accessCodes.filter(ac => ac.active_flag && ac.code_type === 'CompanyOwner' && ac.company_id === company.id)
      : null;
    if (!ownerCodes || ownerCodes.length === 0) {
      ownerCodes = await base44.entities.AccessCode.filter({
        company_id: dispatch.company_id,
        active_flag: true,
        code_type: 'CompanyOwner',
      });
    }

    // CompanyOwner codes whose allowed_trucks intersect dispatch
    const affectedOwnerCodes = ownerCodes.filter(ac => {
      if (!ac.active_flag) return false;
      if (ac.code_type !== 'CompanyOwner') return false;
      if (ac.company_id !== company.id) return false;
      const intersection = (dispatch.trucks_assigned || []).filter(t =>
        (ac.allowed_trucks || []).includes(t)
      );
      return intersection.length > 0;
    });

    if (!affectedOwnerCodes || affectedOwnerCodes.length === 0) return;

    const statusText = statusLabels[newStatus] || newStatus;
    const titlePrefix = `Status: ${statusText}`;

    for (const ac of affectedOwnerCodes) {
      await resolveStaleOwnerStatusNotifications(dispatch.id, ac.id, newStatus);

      const dedupKey = `${dispatch.id}:${newStatus}:${ac.id}`;

      // Check for existing notification with this dedup key for this recipient
      const existing = await base44.entities.Notification.filter({
        recipient_access_code_id: ac.id,
        dispatch_status_key: dedupKey,
      }, '-created_date', 1);

      if (existing && existing.length > 0) continue;

      const relevantTrucks = getRelevantTrucks(dispatch, ac);
      const message = buildOwnerDispatchMessage(dispatch, statusText, relevantTrucks);

      const notification = await base44.entities.Notification.create({
        recipient_type: 'AccessCode',
        recipient_access_code_id: ac.id,
        recipient_id: ac.id,
        recipient_company_id: company.id,
        title: titlePrefix,
        message,
        related_dispatch_id: dispatch.id,
        read_flag: false,
        dispatch_status_key: dedupKey,
        required_trucks: relevantTrucks,
      });

      console.log('Notification created before SMS delivery (notifyDispatchChange)', {
        notificationId: notification?.id,
        recipientType: notification?.recipient_type,
        recipientAccessCodeId: notification?.recipient_access_code_id || null,
        recipientId: notification?.recipient_id || null,
        relatedDispatchId: notification?.related_dispatch_id || null,
      });
      await sendNotificationSmsIfEligible(notification);
    }
  } catch (err) {
    console.error('Error creating dispatch notifications:', err);
  }
}

/**
 * Create informational (non-confirmation) update notifications for company owners.
 * Used when a dispatch is edited without changing status and admin opts in with a short custom message.
 */
export async function notifyDispatchInformationalUpdate(dispatch, customMessage, companies, accessCodes) {
  try {
    if (!dispatch?.id) return;

    const messageText = String(customMessage || '').trim();
    if (!messageText) return;

    // Fetch company if not provided
    let company = companies ? companies.find(c => c.id === dispatch.company_id) : null;
    if (!company) {
      const fetched = await base44.entities.Company.filter({ id: dispatch.company_id }, '-created_date', 1);
      company = fetched?.[0];
    }
    if (!company) return;

    // Fetch CompanyOwner access codes if not provided
    let ownerCodes = accessCodes
      ? accessCodes.filter(ac => ac.active_flag && ac.code_type === 'CompanyOwner' && ac.company_id === company.id)
      : null;
    if (!ownerCodes || ownerCodes.length === 0) {
      ownerCodes = await base44.entities.AccessCode.filter({
        company_id: dispatch.company_id,
        active_flag: true,
        code_type: 'CompanyOwner',
      });
    }

    const affectedOwnerCodes = ownerCodes.filter(ac => {
      const intersection = (dispatch.trucks_assigned || []).filter(t =>
        (ac.allowed_trucks || []).includes(t)
      );
      return intersection.length > 0;
    });

    if (!affectedOwnerCodes?.length) return;

    await Promise.all(affectedOwnerCodes.map(async (ac) => {
      const notification = await base44.entities.Notification.create({
        recipient_type: 'AccessCode',
        recipient_access_code_id: ac.id,
        recipient_id: ac.id,
        recipient_company_id: company.id,
        title: 'Dispatch Update',
        message: messageText,
        related_dispatch_id: dispatch.id,
        read_flag: false,
        notification_category: 'dispatch_update_info',
        notification_type: 'informational',
      });

      console.log('Notification created before SMS delivery (notifyDispatchInformationalUpdate)', {
        notificationId: notification?.id,
        recipientType: notification?.recipient_type,
        recipientAccessCodeId: notification?.recipient_access_code_id || null,
        recipientId: notification?.recipient_id || null,
        relatedDispatchId: notification?.related_dispatch_id || null,
      });

      await sendNotificationSmsIfEligible(notification);
    }));
  } catch (err) {
    console.error('Error creating informational dispatch update notifications:', err);
  }
}

/**
 * Expand current-status owner confirmation requirements when trucks are added
 * without a status change.
 */
export async function expandCurrentStatusRequiredTrucks(dispatch, addedTrucks = [], accessCodes) {
  try {
    if (!dispatch?.id) return;

    const normalizedAdded = [...new Set((addedTrucks || []).filter(Boolean))];
    if (!normalizedAdded.length) return;

    let ownerCodes = accessCodes
      ? accessCodes.filter(ac => ac.active_flag && ac.code_type === 'CompanyOwner' && ac.company_id === dispatch.company_id)
      : null;

    if (!ownerCodes || ownerCodes.length === 0) {
      ownerCodes = await base44.entities.AccessCode.filter({
        company_id: dispatch.company_id,
        active_flag: true,
        code_type: 'CompanyOwner',
      });
    }

    if (!ownerCodes?.length) return;

    const status = dispatch.status;
    const statusText = statusLabels[status] || status;
    const confirmations = await base44.entities.Confirmation.filter({
      dispatch_id: dispatch.id,
      confirmation_type: status,
    }, '-confirmed_at', 500);
    const confirmedTruckSet = new Set((confirmations || []).map(c => c.truck_number));

    for (const ownerCode of ownerCodes) {
      const ownerAddedTrucks = normalizedAdded.filter(truck =>
        (ownerCode.allowed_trucks || []).includes(truck)
      );
      if (!ownerAddedTrucks.length) continue;

      const dedupKey = `${dispatch.id}:${status}:${ownerCode.id}`;
      const existing = await base44.entities.Notification.filter({
        recipient_access_code_id: ownerCode.id,
        dispatch_status_key: dedupKey,
      }, '-created_date', 1);

      const existingNotification = existing?.[0];
      const existingRequired = existingNotification
        ? reconcileExistingRequiredTrucks(existingNotification, dispatch, ownerCode)
        : [];
      const nextRequired = [...new Set([...existingRequired, ...ownerAddedTrucks])];
      const newlyAddedRequired = nextRequired.filter((truck) => !existingRequired.includes(truck));
      const message = buildOwnerDispatchMessage(dispatch, statusText, nextRequired);
      const allConfirmed = nextRequired.every(truck => confirmedTruckSet.has(truck));

      if (existingNotification) {
        const updatedNotification = await base44.entities.Notification.update(existingNotification.id, {
          required_trucks: nextRequired,
          message,
          read_flag: allConfirmed,
        });

        const hasNewActionableTrucks = newlyAddedRequired.some((truck) => !confirmedTruckSet.has(truck));
        if (hasNewActionableTrucks) {
          await sendNotificationSmsIfEligible({
            ...existingNotification,
            ...updatedNotification,
            required_trucks: nextRequired,
            message,
            read_flag: allConfirmed,
          });
        }
      } else {
        const notification = await base44.entities.Notification.create({
          recipient_type: 'AccessCode',
          recipient_access_code_id: ownerCode.id,
          recipient_id: ownerCode.id,
          recipient_company_id: dispatch.company_id,
          title: `Status: ${statusText}`,
          message,
          related_dispatch_id: dispatch.id,
          read_flag: allConfirmed,
          dispatch_status_key: dedupKey,
          required_trucks: nextRequired,
        });

        console.log('Notification created before SMS delivery (expandCurrentStatusRequiredTrucks)', {
          notificationId: notification?.id,
          recipientType: notification?.recipient_type,
          recipientAccessCodeId: notification?.recipient_access_code_id || null,
          recipientId: notification?.recipient_id || null,
          relatedDispatchId: notification?.related_dispatch_id || null,
        });

        await sendNotificationSmsIfEligible(notification);
      }
    }
  } catch (error) {
    console.error('Error expanding current-status required trucks:', error);
  }
}

/**
 * Reconcile existing owner notifications for a dispatch after dispatch edits.
 * Keeps confirmation history intact while refreshing required_trucks/message/read state.
 */
export async function reconcileOwnerNotificationsForDispatch(dispatch, accessCodes) {
  try {
    if (!dispatch?.id) return;

    const ownerNotifications = await base44.entities.Notification.filter({
      recipient_type: 'AccessCode',
      related_dispatch_id: dispatch.id,
    }, '-created_date', 500);

    if (!ownerNotifications?.length) return;

    let ownerCodes = accessCodes;
    if (!ownerCodes || ownerCodes.length === 0) {
      ownerCodes = await base44.entities.AccessCode.filter({
        company_id: dispatch.company_id,
        active_flag: true,
        code_type: 'CompanyOwner',
      });
    }

    const ownerCodeMap = new Map((ownerCodes || []).map(ac => [ac.id, ac]));

    const missingOwnerIds = ownerNotifications
      .map(n => n.recipient_access_code_id || n.recipient_id)
      .filter(id => id && !ownerCodeMap.has(id));

    if (missingOwnerIds.length > 0) {
      await Promise.all([...new Set(missingOwnerIds)].map(async (id) => {
        const result = await base44.entities.AccessCode.filter({ id }, '-created_date', 1);
        if (result?.[0]) ownerCodeMap.set(id, result[0]);
      }));
    }

    const currentStatus = dispatch.status;
    const confirmationsByStatus = {
      [currentStatus]: await base44.entities.Confirmation.filter({
        dispatch_id: dispatch.id,
        confirmation_type: currentStatus,
      }, '-confirmed_at', 500),
    };

    for (const notification of ownerNotifications) {
      if (notification.notification_category === 'dispatch_update_info') continue;

      const status = parseStatusFromDedupKey(notification);
      if (!status) continue;

      if (status !== currentStatus) {
        if (!notification.read_flag) {
          await base44.entities.Notification.update(notification.id, { read_flag: true });
        }
        continue;
      }

      const ownerCode = ownerCodeMap.get(notification.recipient_access_code_id || notification.recipient_id);
      if (!ownerCode) continue;

      const relevantTrucks = reconcileExistingRequiredTrucks(notification, dispatch, ownerCode);
      const statusText = statusLabels[status] || status;
      const message = buildOwnerDispatchMessage(dispatch, statusText, relevantTrucks);
      const confirmedTrucks = (confirmationsByStatus[status] || []).map(c => c.truck_number);
      const allConfirmed = relevantTrucks.every(t => confirmedTrucks.includes(t));

      await base44.entities.Notification.update(notification.id, {
        required_trucks: relevantTrucks,
        message,
        read_flag: allConfirmed,
      });
    }
  } catch (error) {
    console.error('Error reconciling owner notifications for dispatch:', error);
  }
}

/**
 * After a truck confirms, check if all required trucks for the owner's notification
 * are now confirmed. If so, mark the notification as read (resolved).
 */
/**
 * After a truck confirms, check if all required trucks for the owner's notification
 * are now confirmed. If so, mark the notification as read (resolved).
 * ownerAccessCodeId: the session.id of the CompanyOwner who confirmed.
 */
export async function resolveOwnerNotificationIfComplete(dispatch, confirmations, ownerAccessCodeId) {
  try {
    const status = dispatch.status;
    const dedupKey = `${dispatch.id}:${status}:${ownerAccessCodeId}`;

    const ownerNotifs = await base44.entities.Notification.filter({
      recipient_access_code_id: ownerAccessCodeId,
      dispatch_status_key: dedupKey,
    }, '-created_date', 5);

    if (!ownerNotifs || ownerNotifs.length === 0) return;

    const authoritativeConfirmations = Array.isArray(confirmations) && confirmations.length > 0
      ? confirmations
      : await base44.entities.Confirmation.filter({
          dispatch_id: dispatch.id,
          confirmation_type: status,
        }, '-confirmed_at', 500);

    const confirmedTrucksForStatus = authoritativeConfirmations
      .filter(c => c.dispatch_id === dispatch.id && c.confirmation_type === status)
      .map(c => c.truck_number);

    for (const notif of ownerNotifs) {
      if (notif.read_flag) continue;

      const required = notif.required_trucks || [];
      if (required.length === 0) continue;

      const allConfirmed = required.every(t => confirmedTrucksForStatus.includes(t));
      if (allConfirmed) {
        await base44.entities.Notification.update(notif.id, { read_flag: true });
      }
    }
  } catch (error) {
    console.error('Error resolving owner notifications:', error);
  }
}

export async function notifyOwnerTruckReassignment({
  dispatch,
  actorName,
  swapDetails = null,
  changeDetails = null,
}) {
  try {
    if (!dispatch?.id) return;

    let companyName = '';
    if (dispatch.company_id) {
      const company = await base44.entities.Company.filter({ id: dispatch.company_id }, '-created_date', 1);
      companyName = company?.[0]?.name || '';
    }

    const dateText = dispatch.date ? format(parseISO(dispatch.date), 'EEE MM-dd-yyyy').toUpperCase() : '';
    const shiftText = dispatch.shift_time || '';

    const title = swapDetails
      ? `${companyName || 'Company'} swapped their trucks`
      : `${companyName || 'Company'} changed their truck`;

    const actionLine = swapDetails
      ? `${actorName} swapped ${swapDetails.fromTruck} with ${swapDetails.toTruck}`
      : `${actorName} updated ${changeDetails?.fromTruck || 'truck assignment'} to ${changeDetails?.toTruck || 'truck assignment'}`;

    const message = `${actionLine}\n${dateText}${shiftText ? ` • ${shiftText}` : ''}`;

    await base44.entities.Notification.create({
      recipient_type: 'Admin',
      title,
      message,
      related_dispatch_id: dispatch.id,
      read_flag: false,
      notification_category: 'owner_truck_reassignment',
    });
  } catch (error) {
    console.error('Error creating owner truck reassignment notification:', error);
  }
}

/**
 * Create notification when truck confirms receipt (admin notification).
 */
export async function notifyTruckConfirmation(dispatch, truckNumber, companyName) {
  try {
    const statusText = dispatch.status === 'Scheduled'
      ? 'Scheduled'
      : (statusLabels[dispatch.status] || dispatch.status);
    const dateText = format(parseISO(dispatch.date), 'EEE MM-dd-yyyy').toUpperCase();
    const shiftText = dispatch.shift_time || '';
    const companyDisplayName = companyName || (await base44.entities.Company.filter({ id: dispatch.company_id }, '-created_date', 1))?.[0]?.name || 'Company';

    const assignedTrucks = [...new Set((dispatch.trucks_assigned || []).filter(Boolean))];
    if (!assignedTrucks.length) return;

    const confirmations = await base44.entities.Confirmation.filter({
      dispatch_id: dispatch.id,
      confirmation_type: dispatch.status,
    }, '-confirmed_at', 1000);

    const confirmedTrucks = new Set((confirmations || []).map((confirmation) => confirmation.truck_number));
    if (truckNumber) confirmedTrucks.add(truckNumber);

    const allConfirmed = assignedTrucks.every((assignedTruck) => confirmedTrucks.has(assignedTruck));
    if (!allConfirmed) return;

    const existingAllConfirmed = await base44.entities.Notification.filter({
      recipient_type: 'Admin',
      notification_category: 'admin_dispatch_all_confirmed',
      related_dispatch_id: dispatch.id,
      confirmation_type: dispatch.status,
    }, '-created_date', 1);

    if (existingAllConfirmed?.length) return;

    const lineTwo = [dateText, shiftText, statusText].filter(Boolean).join(' • ');
    const jobTag = dispatch.reference_tag || dispatch.job_number || dispatch.id;
    const lineThree = [jobTag, assignedTrucks.join(', ')].filter(Boolean).join(' • ');
    const confirmationTitleByStatus = {
      Scheduled: `${companyDisplayName} has confirmed the schedule`,
      Dispatch: `${companyDisplayName} has confirmed the dispatch`,
      Amended: `${companyDisplayName} has confirmed the amendment`,
      Canceled: `${companyDisplayName} has confirmed the cancellation`,
      Cancelled: `${companyDisplayName} has confirmed the cancellation`,
    };

    await base44.entities.Notification.create({
      recipient_type: 'Admin',
      title: confirmationTitleByStatus[dispatch.status] || `${companyDisplayName} has confirmed the dispatch`,
      message: `${lineTwo}\n${lineThree}`,
      related_dispatch_id: dispatch.id,
      read_flag: false,
      admin_group_key: `${dispatch.id}:${dispatch.status}`,
      confirmation_type: dispatch.status,
      notification_category: 'admin_dispatch_all_confirmed',
    });
  } catch (err) {
    console.error('Error creating confirmation notification:', err);
  }
}
