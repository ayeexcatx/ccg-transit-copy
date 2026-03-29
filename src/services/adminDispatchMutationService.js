import { base44 } from '@/api/base44Client';
import {
  expandCurrentStatusRequiredTrucks,
  notifyDispatchChange,
  notifyDispatchInformationalUpdate,
  notifyDriversForDispatchEdit,
  reconcileOwnerNotificationsForDispatch
} from '@/components/notifications/createNotifications';
import { clearRemovedTruckDriverAssignments } from '@/services/driverAssignmentMutationService';

const getNormalizedTrucks = (value) => (Array.isArray(value) ? value : []).filter(Boolean);

const shouldResetReceiptConfirmationForStatusChange = (previousStatus, nextStatus) => (
  previousStatus !== nextStatus && (nextStatus === 'Amended' || nextStatus === 'Cancelled')
);

/**
 * Preserves existing owner notification fanout flow for admin create/update writes.
 */
export async function runAdminDispatchOwnerNotificationFlow({
  previousDispatch,
  savedDispatch,
  customUpdateMessage,
  companies,
  accessCodes
}) {
  const oldStatus = previousDispatch && !previousDispatch._isCopy ? previousDispatch.status : null;
  const newStatus = savedDispatch?.status;
  const statusChanged = oldStatus !== newStatus;

  const previousTrucks = previousDispatch && !previousDispatch._isCopy
    ? getNormalizedTrucks(previousDispatch.trucks_assigned)
    : [];
  const nextTrucks = getNormalizedTrucks(savedDispatch?.trucks_assigned);
  const addedTrucks = !statusChanged
    ? nextTrucks.filter((truck) => !previousTrucks.includes(truck))
    : [];

  if (statusChanged) {
    await notifyDispatchChange(savedDispatch, oldStatus, newStatus, companies, accessCodes);
  } else {
    if (addedTrucks.length > 0) {
      await expandCurrentStatusRequiredTrucks(savedDispatch, addedTrucks, accessCodes);
    }

    if (previousDispatch && !previousDispatch._isCopy && String(customUpdateMessage || '').trim()) {
      await notifyDispatchInformationalUpdate(savedDispatch, customUpdateMessage, companies, accessCodes);
    }
  }

  await reconcileOwnerNotificationsForDispatch(savedDispatch, accessCodes);
}

/**
 * Preserves existing admin dispatch create/update/status-change orchestration and side-effect ordering.
 */
export async function runAdminDispatchMutation({
  editing,
  data,
  customUpdateMessage,
  session,
  accessCodes,
  companies,
  appendAdminActivityLog,
  buildDispatchUpdateActivityEntries,
  createAdminActivityEntry,
  getAdminDisplayName,
  syncDispatchRecordHtml,
  notifyDriveSyncWarning
}) {
  if (editing && !editing._isCopy) {
    const nextEntries = buildDispatchUpdateActivityEntries(editing, data, session);

    await base44.entities.Dispatch.update(editing.id, {
      ...data,
      admin_activity_log: appendAdminActivityLog(editing.admin_activity_log, nextEntries),
      edit_locked: false,
      edit_locked_by_session_id: null,
      edit_locked_by_name: null,
      edit_locked_at: null
    });

    const previousActiveDriverAssignments = await base44.entities.DriverDispatch.filter({
      dispatch_id: editing.id,
      active_flag: true
    }, '-created_date', 500);

    const savedDispatch = await base44.entities.Dispatch.filter({ id: editing.id }, '-created_date', 1).then((r) => r[0]);
    if (!savedDispatch) return savedDispatch;

    const removedTrucks = getNormalizedTrucks(editing?.trucks_assigned)
      .filter((truck) => !getNormalizedTrucks(savedDispatch.trucks_assigned).includes(truck));

    await clearRemovedTruckDriverAssignments({
      dispatch: savedDispatch,
      removedTrucks,
      session,
    });

    if (shouldResetReceiptConfirmationForStatusChange(editing?.status, savedDispatch.status)) {
      const activeDriverAssignmentsForReset = await base44.entities.DriverDispatch.filter({
        dispatch_id: savedDispatch.id,
        active_flag: true
      }, '-created_date', 500);

      await Promise.all((activeDriverAssignmentsForReset || [])
        .filter((assignment) => assignment?.id && assignment?.is_visible_to_driver === true)
        .map((assignment) => base44.entities.DriverDispatch.update(assignment.id, {
          delivery_status: 'sent',
          last_seen_at: null,
          last_opened_at: null
        })));
    }

    await reconcileOwnerNotificationsForDispatch(savedDispatch, accessCodes);

    const activeDriverAssignments = await base44.entities.DriverDispatch.filter({
      dispatch_id: savedDispatch.id,
      active_flag: true
    }, '-created_date', 500);

    await notifyDriversForDispatchEdit({
      previousDispatch: editing,
      nextDispatch: savedDispatch,
      previousDriverAssignments: previousActiveDriverAssignments,
      driverAssignments: activeDriverAssignments
    });

    try {
      await syncDispatchRecordHtml({
        dispatch: savedDispatch,
        previousDispatch: editing,
        companies
      });
    } catch (error) {
      await base44.entities.Dispatch.update(savedDispatch.id, {
        dispatch_html_drive_last_sync_status: 'failed',
        dispatch_html_drive_last_sync_error: String(error?.message || error || 'Drive sync failed')
      });
      notifyDriveSyncWarning('Dispatch saved, but Google Drive sync failed.');
    }

    await runAdminDispatchOwnerNotificationFlow({
      previousDispatch: editing,
      savedDispatch,
      customUpdateMessage,
      companies,
      accessCodes
    });

    return savedDispatch;
  }

  const adminName = getAdminDisplayName(session);
  const createdDispatch = await base44.entities.Dispatch.create({
    ...data,
    admin_activity_log: appendAdminActivityLog(
      data.admin_activity_log,
      createAdminActivityEntry(session, 'created_dispatch', `${adminName} created this dispatch`)
    ),
    edit_locked: false,
    edit_locked_by_session_id: null,
    edit_locked_by_name: null,
    edit_locked_at: null
  });

  try {
    await syncDispatchRecordHtml({
      dispatch: createdDispatch,
      previousDispatch: null,
      companies
    });
  } catch (error) {
    await base44.entities.Dispatch.update(createdDispatch.id, {
      dispatch_html_drive_last_sync_status: 'failed',
      dispatch_html_drive_last_sync_error: String(error?.message || error || 'Drive sync failed')
    });
    notifyDriveSyncWarning('Dispatch created, but Google Drive sync failed.');
  }

  await runAdminDispatchOwnerNotificationFlow({
    previousDispatch: editing,
    savedDispatch: createdDispatch,
    customUpdateMessage,
    companies,
    accessCodes
  });

  return createdDispatch;
}
