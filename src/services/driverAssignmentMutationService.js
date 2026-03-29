import { base44 } from '@/api/base44Client';
import { createDriverDispatchNotification } from '@/components/notifications/createNotifications';

const nowIso = () => new Date().toISOString();

function isVisibleDelivery(row) {
  const status = String(row?.delivery_status || '').toLowerCase();
  return row?.active_flag !== false && row?.is_visible_to_driver === true && (status === 'sent' || status === 'seen');
}

async function markRowRemoved({ row, session, reason }) {
  if (!row?.id) return null;
  const updated = await base44.entities.DriverDispatch.update(row.id, {
    active_flag: false,
    is_visible_to_driver: false,
    delivery_status: 'removed',
    cancelled_at: nowIso(),
    cancellation_reason: reason || 'Owner removed assignment',
    updated_by_owner_id: session?.id,
  });
  return updated;
}

export async function upsertDriverAssignment({
  dispatch,
  driverAssignments = [],
  truckNumber,
  driver,
  session,
  buildActivityEntries,
  appendActivityEntries,
}) {
  const previousAssignments = [...driverAssignments];
  const existingActiveRows = driverAssignments.filter((entry) => entry.truck_number === truckNumber && entry.active_flag !== false);
  const existingPreferred = existingActiveRows.find((entry) => entry.driver_id === driver.id) || existingActiveRows[0] || null;

  for (const row of existingActiveRows) {
    if (!row?.id || row.id === existingPreferred?.id) continue;
    await base44.entities.DriverDispatch.update(row.id, {
      active_flag: false,
      is_visible_to_driver: false,
      delivery_status: isVisibleDelivery(row) ? 'removed' : 'cancelled',
      cancelled_at: nowIso(),
      cancellation_reason: 'Superseded by latest owner assignment',
      updated_by_owner_id: session?.id,
    });
  }

  const existing = existingPreferred;
  const swappingDriver = existing?.id && existing.driver_id && existing.driver_id !== driver.id;

  if (swappingDriver && isVisibleDelivery(existing)) {
    await markRowRemoved({ row: existing, session, reason: 'Owner swapped driver' });

    if (existing.driver_user_id) {
      await createDriverDispatchNotification({
        dispatch,
        driverAccessCodeId: existing.driver_user_id,
        title: 'Dispatch Removed',
        message: 'This dispatch assignment is no longer available',
        notificationType: 'driver_removed',
        requiredTrucks: [truckNumber],
      });
    }
  }

  const canUpdateExisting = existing?.id && !swappingDriver;

  const payload = {
    dispatch_id: dispatch.id,
    company_id: dispatch.company_id,
    owner_user_id: session?.id,
    driver_id: driver.id,
    driver_user_id: driver.access_code_id || null,
    driver_name: driver.driver_name,
    truck_number: truckNumber,
    delivery_status: 'staged',
    is_visible_to_driver: false,
    sent_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    last_updated_from_dispatch_at: nowIso(),
    last_opened_at: null,
    last_seen_at: null,
    created_by_owner_id: existing?.created_by_owner_id || session?.id,
    updated_by_owner_id: session?.id,
    archived_at: null,
    active_flag: true,
  };

  const savedAssignment = canUpdateExisting
    ? await base44.entities.DriverDispatch.update(existing.id, payload)
    : await base44.entities.DriverDispatch.create(payload);

  if (buildActivityEntries && appendActivityEntries) {
    const activityEntries = buildActivityEntries({
      truckNumber,
      previousAssignment: existing,
      nextAssignment: savedAssignment,
    });
    await appendActivityEntries(dispatch, activityEntries);
  }

  return { savedAssignment, previousAssignments, nextAssignments: previousAssignments };
}

export async function sendDriverAssignment({ dispatch, driverDispatch, session }) {
  if (!driverDispatch?.id) return null;
  const alreadyVisible = isVisibleDelivery(driverDispatch);
  const sentAt = driverDispatch?.sent_at || nowIso();
  const saved = await base44.entities.DriverDispatch.update(driverDispatch.id, {
    delivery_status: driverDispatch?.delivery_status === 'seen' ? 'seen' : 'sent',
    is_visible_to_driver: true,
    sent_at: sentAt,
    cancelled_at: null,
    cancellation_reason: null,
    updated_by_owner_id: session?.id,
    active_flag: true,
  });

  if (!alreadyVisible) {
    await createDriverDispatchNotification({
      dispatch,
      driverAccessCodeId: saved.driver_user_id,
      title: 'Dispatch Assigned',
      message: 'You have been assigned to a dispatch',
      notificationType: 'driver_assigned',
      requiredTrucks: [saved.truck_number],
    });
  }

  return saved;
}

export async function deactivateDriverAssignment({ dispatch, driverAssignments = [], truckNumber, session }) {
  const existingRows = driverAssignments.filter((entry) => entry.truck_number === truckNumber && entry.active_flag !== false);
  if (!existingRows.length) return { removed: false, existing: null };

  for (const row of existingRows) {
    await base44.entities.DriverDispatch.update(row.id, {
      active_flag: false,
      delivery_status: isVisibleDelivery(row) ? 'removed' : 'cancelled',
      is_visible_to_driver: false,
      cancelled_at: nowIso(),
      cancellation_reason: 'Owner removed assignment',
      updated_by_owner_id: session?.id,
    });

    if (isVisibleDelivery(row) && row.driver_user_id) {
      await createDriverDispatchNotification({
        dispatch,
        driverAccessCodeId: row.driver_user_id,
        title: 'Dispatch Removed',
        message: 'This dispatch assignment is no longer available',
        notificationType: 'driver_removed',
        requiredTrucks: [truckNumber],
      });
    }
  }

  return { removed: true, existing: existingRows[0] };
}

export async function clearRemovedTruckDriverAssignments({ dispatch, removedTrucks = [], session = null, log = null }) {
  if (!dispatch?.id || !removedTrucks.length) return;
  const activeRows = await base44.entities.DriverDispatch.filter({ dispatch_id: dispatch.id, active_flag: true }, '-created_date', 500);
  const toRemove = (activeRows || []).filter((row) => removedTrucks.includes(row.truck_number));
  log?.('assignmentsToRemove', { toRemove });
  if (!toRemove.length) return;

  await Promise.all(toRemove.map(async (row) => {
    const wasVisibleToDriver = isVisibleDelivery(row);
    await base44.entities.DriverDispatch.update(row.id, {
      active_flag: false,
      delivery_status: wasVisibleToDriver ? 'removed' : 'cancelled',
      is_visible_to_driver: false,
      cancelled_at: nowIso(),
      cancellation_reason: 'Truck removed from dispatch',
      updated_by_owner_id: session?.id,
    });

    if (wasVisibleToDriver && row.driver_user_id) {
      await createDriverDispatchNotification({
        dispatch,
        driverAccessCodeId: row.driver_user_id,
        title: 'Dispatch Removed',
        message: 'This dispatch assignment is no longer available',
        notificationType: 'driver_removed',
        requiredTrucks: [row.truck_number],
      });
    }
  }));
}
