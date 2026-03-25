import { base44 } from '@/api/base44Client';
import { notifyDriverAssignmentChanges } from '@/components/notifications/createNotifications';

const normalizeTruckValue = (value) => String(value ?? '').trim();

/**
 * Assign or replace the driver assignment row for a truck while preserving assignment-history semantics.
 */
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
  const existing = driverAssignments.find((entry) => entry.truck_number === truckNumber);
  const previousAssignment = existing && existing.active_flag !== false ? existing : null;

  const payload = {
    dispatch_id: dispatch.id,
    company_id: dispatch.company_id,
    truck_number: truckNumber,
    driver_id: driver.id,
    driver_name: driver.driver_name,
    assigned_by_access_code_id: session?.id,
    assigned_by_code_type: session?.code_type,
    assigned_datetime: new Date().toISOString(),
    active_flag: true,
    receipt_confirmed_flag: false,
    receipt_confirmed_at: null,
    receipt_confirmed_by_driver_id: null,
    receipt_confirmed_by_name: null,
  };

  const savedAssignment = existing?.id
    ? await base44.entities.DriverDispatchAssignment.update(existing.id, payload)
    : await base44.entities.DriverDispatchAssignment.create(payload);

  const nextAssignments = previousAssignments
    .filter((entry) => entry?.id !== existing?.id)
    .concat(savedAssignment);

  if (buildActivityEntries && appendActivityEntries) {
    const activityEntries = buildActivityEntries({
      truckNumber,
      previousAssignment,
      nextAssignment: savedAssignment,
    });
    await appendActivityEntries(dispatch, activityEntries);
  }

  await notifyDriverAssignmentChanges(dispatch, previousAssignments, nextAssignments);

  return {
    savedAssignment,
    previousAssignments,
    nextAssignments,
    previousAssignment,
  };
}

/**
 * Unassign a driver by deactivating the active assignment row (never deleting history).
 */
export async function deactivateDriverAssignment({
  dispatch,
  driverAssignments = [],
  truckNumber,
  buildActivityEntries,
  appendActivityEntries,
}) {
  const existing = driverAssignments.find((entry) => entry.truck_number === truckNumber && entry.active_flag !== false);
  if (!existing?.id) return { removed: false, existing: null };

  const previousAssignments = [...driverAssignments];
  await base44.entities.DriverDispatchAssignment.update(existing.id, {
    active_flag: false,
  });

  if (buildActivityEntries && appendActivityEntries) {
    const activityEntries = buildActivityEntries({
      truckNumber,
      previousAssignment: existing,
      nextAssignment: null,
    });
    await appendActivityEntries(dispatch, activityEntries);
  }

  const nextAssignments = previousAssignments.filter((entry) => entry.id !== existing.id);
  await notifyDriverAssignmentChanges(dispatch, previousAssignments, nextAssignments);

  return {
    removed: true,
    existing,
    previousAssignments,
    nextAssignments,
  };
}

/**
 * Deactivate active assignments for trucks removed from a dispatch and notify affected drivers.
 */
export async function clearRemovedTruckDriverAssignments({
  dispatch,
  removedTrucks = [],
  log,
}) {
  if (!dispatch?.id || !removedTrucks.length) return;

  const normalizedRemovedTrucks = [...new Set((removedTrucks || [])
    .map((truck) => normalizeTruckValue(truck))
    .filter(Boolean))];
  if (!normalizedRemovedTrucks.length) return;

  const activeAssignments = await base44.entities.DriverDispatchAssignment.filter({
    dispatch_id: dispatch.id,
    active_flag: true,
  }, '-assigned_datetime', 500);

  const previousAssignments = activeAssignments || [];
  log?.('removedTrucks', {
    dispatchId: dispatch.id,
    removedTrucks,
    normalizedRemovedTrucks,
  });
  log?.('activeAssignments', {
    dispatchId: dispatch.id,
    activeAssignments: previousAssignments,
  });

  const assignmentsToRemove = previousAssignments.filter((assignment) =>
    normalizedRemovedTrucks.includes(normalizeTruckValue(assignment?.truck_number))
  );

  log?.('assignmentsToRemove', {
    dispatchId: dispatch.id,
    assignmentsToRemove,
  });

  if (!assignmentsToRemove.length) return;

  await Promise.all(assignmentsToRemove.map((assignment) =>
    base44.entities.DriverDispatchAssignment.update(assignment.id, {
      active_flag: false,
    })
  ));

  const removedIds = new Set(assignmentsToRemove.map((assignment) => assignment.id));
  const nextAssignments = previousAssignments.filter((assignment) => !removedIds.has(assignment.id));

  log?.('assignmentDiff', {
    dispatchId: dispatch.id,
    previousAssignments,
    nextAssignments,
  });

  await notifyDriverAssignmentChanges(dispatch, previousAssignments, nextAssignments);
}
