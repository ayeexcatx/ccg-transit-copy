export const TRUCK_SWITCH_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

export function getPendingTruckSwitchRequest(requests = [], dispatchId) {
  return (requests || []).find((request) =>
    request.dispatch_id === dispatchId && request.status === TRUCK_SWITCH_STATUS.PENDING
  ) || null;
}

export function findTruckConflictForShift({
  dispatches = [],
  dispatchId,
  date,
  shiftTime,
  truckNumber,
}) {
  if (!truckNumber || !date || !shiftTime) return null;

  return (dispatches || []).find((dispatch) => (
    dispatch.id !== dispatchId &&
    dispatch.date === date &&
    dispatch.shift_time === shiftTime &&
    (dispatch.trucks_assigned || []).includes(truckNumber)
  )) || null;
}

export function validateTruckSwitchRequest({
  dispatch,
  session,
  oldTruck,
  newTruck,
  dispatches = [],
  pendingRequest,
}) {
  if (!dispatch?.id) return { ok: false, error: 'Dispatch not found.' };
  if (!session || session.code_type !== 'CompanyOwner') {
    return { ok: false, error: 'Only company owners can request a truck switch.' };
  }

  if (pendingRequest) {
    return { ok: false, error: 'A truck-switch request is already pending for this dispatch.' };
  }

  const assigned = dispatch.trucks_assigned || [];
  if (!oldTruck || !assigned.includes(oldTruck)) {
    return { ok: false, error: 'Select a currently assigned truck to replace.' };
  }

  const allowedSet = new Set(session.allowed_trucks || []);
  if (!newTruck || !allowedSet.has(newTruck)) {
    return { ok: false, error: 'Replacement truck must be in your allowed truck list.' };
  }

  if (oldTruck === newTruck) {
    return { ok: false, error: 'Replacement truck must be different from the current truck.' };
  }

  if (assigned.includes(newTruck)) {
    return { ok: false, error: 'Replacement truck is already assigned to this dispatch.' };
  }

  const conflictingDispatch = findTruckConflictForShift({
    dispatches,
    dispatchId: dispatch.id,
    date: dispatch.date,
    shiftTime: dispatch.shift_time,
    truckNumber: newTruck,
  });

  if (conflictingDispatch) {
    return {
      ok: false,
      error: `Truck ${newTruck} is already assigned to another ${dispatch.shift_time.toLowerCase()} dispatch on ${dispatch.date}.`,
      conflictingDispatch,
    };
  }

  return { ok: true };
}

export function formatTruckSwitchSummary(request) {
  if (!request) return '';
  return `${request.old_truck} → ${request.new_truck}`;
}
