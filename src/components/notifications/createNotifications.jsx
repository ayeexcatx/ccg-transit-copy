import { base44 } from '@/api/base44Client';
import { format, parseISO } from 'date-fns';

function formatStartTimeToAmPm(startTime) {
  if (!startTime) return '';

  const time = String(startTime).trim();
  if (!time) return '';

  const amPmMatch = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])$/);
  if (amPmMatch) {
    const [, hourRaw, minute, periodRaw] = amPmMatch;
    let hour = Number(hourRaw);
    if (!Number.isFinite(hour) || hour < 1) hour = 12;
    if (hour > 12) hour = hour % 12 || 12;
    return `${hour}:${minute} ${periodRaw.toUpperCase()}`;
  }

  const hhMmMatch = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!hhMmMatch) return '';

  let hour24 = Number(hhMmMatch[1]);
  const minute = hhMmMatch[2];
  if (!Number.isFinite(hour24) || hour24 < 0 || hour24 > 23) return '';

  const period = hour24 >= 12 ? 'PM' : 'AM';
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return `${hour12}:${minute} ${period}`;
}

const statusLabels = {
  Scheduled: 'Scheduled (details to follow)',
  Dispatch: 'Dispatch',
  Amended: 'Amended',
  Cancelled: 'Cancelled',
};

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

  const dateText = format(parseISO(dispatch.date), 'EEE MM-dd-yyyy').toUpperCase();
  const timeText = formatStartTimeToAmPm(dispatch.start_time);
  const isScheduledDetails = statusText === 'Scheduled (details to follow)' || statusText === 'Confirmed (details to follow)';
  const dateTimeText = (!isScheduledDetails && timeText) ? `${dateText} at ${timeText}` : dateText;

  const secondLineParts = [
    dispatch.shift_time,
    statusText,
    truckSummary,
  ].filter(Boolean);

  return `${dateTimeText}\n${secondLineParts.join(' • ')}`;
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
      const dedupKey = `${dispatch.id}:${newStatus}:${ac.id}`;

      // Check for existing notification with this dedup key for this recipient
      const existing = await base44.entities.Notification.filter({
        recipient_access_code_id: ac.id,
        dispatch_status_key: dedupKey,
      }, '-created_date', 1);

      if (existing && existing.length > 0) continue;

      const relevantTrucks = getRelevantTrucks(dispatch, ac);
      const message = buildOwnerDispatchMessage(dispatch, statusText, relevantTrucks);

      await base44.entities.Notification.create({
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

    await Promise.all(affectedOwnerCodes.map(ac =>
      base44.entities.Notification.create({
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
      })
    ));
  } catch (err) {
    console.error('Error creating informational dispatch update notifications:', err);
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

    const statusSet = new Set();
    ownerNotifications.forEach(n => {
      const parts = String(n.dispatch_status_key || '').split(':');
      if (parts.length >= 2 && parts[1]) statusSet.add(parts[1]);
    });

    const confirmationsByStatus = {};
    await Promise.all([...statusSet].map(async (status) => {
      confirmationsByStatus[status] = await base44.entities.Confirmation.filter({
        dispatch_id: dispatch.id,
        confirmation_type: status,
      }, '-confirmed_at', 500);
    }));

    for (const notification of ownerNotifications) {
      if (notification.notification_category === 'dispatch_update_info') continue;

      const status = String(notification.dispatch_status_key || '').split(':')[1];
      if (!status) continue;

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

    const confirmedTrucksForStatus = confirmations
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

/**
 * Create notification when truck confirms receipt (admin notification).
 */
export async function notifyTruckConfirmation(dispatch, truckNumber, companyName) {
  try {
    const statusText = statusLabels[dispatch.status] || dispatch.status;
    const dateText = format(parseISO(dispatch.date), 'EEE MM-dd-yyyy').toUpperCase();
    const timeText = formatStartTimeToAmPm(dispatch.start_time);
    const isScheduledDetails = statusText === 'Scheduled (details to follow)' || statusText === 'Confirmed (details to follow)';
    const dateTimeText = (!isScheduledDetails && timeText) ? `${dateText} at ${timeText}` : dateText;

    await base44.entities.Notification.create({
      recipient_type: 'Admin',
      title: `Truck ${truckNumber} Confirmed`,
      message: `${dateTimeText} · ${dispatch.shift_time} · ${statusText}${companyName ? ` | ${companyName}` : ''}${dispatch.client_name ? ` | ${dispatch.client_name}` : ''}`,
      related_dispatch_id: dispatch.id,
      read_flag: false,
      // Group key so all truck confirmations for the same dispatch+status can be bulk-resolved
      admin_group_key: `${dispatch.id}:${dispatch.status}`,
      confirmation_type: dispatch.status,
    });
  } catch (err) {
    console.error('Error creating confirmation notification:', err);
  }
}
