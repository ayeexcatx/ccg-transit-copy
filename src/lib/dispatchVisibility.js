const normalizeId = (value) => String(value ?? '');

const getDispatchTrucks = (dispatch) => (Array.isArray(dispatch?.trucks_assigned) ? dispatch.trucks_assigned : []);
const getAllowedTrucks = (session) => (Array.isArray(session?.allowed_trucks) ? session.allowed_trucks : []);

/**
 * Build a dispatchId -> unique assigned truck numbers map from active driver assignments.
 */
export function buildDriverAssignedTrucksByDispatch(driverAssignments = []) {
  const map = new Map();

  driverAssignments
    .filter((assignment) => assignment?.active_flag !== false)
    .forEach((assignment) => {
      if (!assignment?.dispatch_id || !assignment?.truck_number) return;
      const dispatchId = normalizeId(assignment.dispatch_id);
      if (!map.has(dispatchId)) map.set(dispatchId, []);
      const trucks = map.get(dispatchId);
      if (!trucks.includes(assignment.truck_number)) trucks.push(assignment.truck_number);
    });

  return map;
}

export function getDriverDispatchIdSet(driverAssignments = []) {
  return new Set(buildDriverAssignedTrucksByDispatch(driverAssignments).keys());
}

/**
 * Dispatch visibility used by portal/home list views:
 * - Admin: all
 * - Driver: active assignment only
 * - CompanyOwner: allowed_trucks intersection
 */
export function canUserSeeDispatch(session, dispatch, { driverDispatchIds = null } = {}) {
  if (!session || !dispatch?.id) return false;
  if (session.code_type === 'Admin') return true;

  const dispatchId = normalizeId(dispatch.id);
  if (session.code_type === 'Driver') {
    return driverDispatchIds instanceof Set ? driverDispatchIds.has(dispatchId) : false;
  }
  if (session.code_type !== 'CompanyOwner') return false;

  const allowedTrucks = getAllowedTrucks(session);
  const assigned = getDispatchTrucks(dispatch);
  return assigned.some((truck) => allowedTrucks.includes(truck));
}

/**
 * Truck visibility for a single dispatch.
 */
export function getVisibleTrucksForDispatch(session, dispatch, { driverAssignedTrucks = [] } = {}) {
  const assigned = getDispatchTrucks(dispatch);
  if (!session) return [];
  if (session.code_type === 'Admin') return assigned;

  if (session.code_type === 'Driver') {
    return [...new Set((driverAssignedTrucks || []).filter(Boolean))];
  }
  if (session.code_type !== 'CompanyOwner') return [];

  const allowed = getAllowedTrucks(session);
  return assigned.filter((truck) => allowed.includes(truck));
}

/**
 * Notification visibility filtering for bell/list hooks.
 */
export function canUserSeeNotification(session, notification, {
  visibleDispatchIds = new Set(),
  driverDispatchIds = new Set(),
} = {}) {
  if (!notification?.related_dispatch_id) return true;
  if (session?.code_type === 'Admin') return true;

  const relatedDispatchId = normalizeId(notification.related_dispatch_id);
  if (session?.code_type === 'Driver') {
    if (notification.notification_category === 'driver_dispatch_update') return true;
    return driverDispatchIds.has(relatedDispatchId);
  }
  if (session?.code_type !== 'CompanyOwner') return false;

  return visibleDispatchIds.has(relatedDispatchId);
}

/**
 * Incident visibility across roles.
 */
export function canUserSeeIncident(session, incident, {
  visibleDispatchIds = new Set(),
} = {}) {
  if (!session || !incident) return false;

  if (session.code_type === 'Admin') return true;

  if (session.code_type === 'Driver') {
    const createdByDriver = incident.reported_by_access_code_id === session.id;
    const tiedToAssignedDispatch = incident.dispatch_id && visibleDispatchIds.has(normalizeId(incident.dispatch_id));
    return createdByDriver || tiedToAssignedDispatch;
  }

  if (session.code_type === 'CompanyOwner') {
    const createdByOwner = incident.reported_by_access_code_id === session.id;
    const ownedTruckSet = new Set(getAllowedTrucks(session));
    const forOwnersTruck = incident.company_id === session.company_id && ownedTruckSet.has(incident.truck_number);
    return createdByOwner || forOwnersTruck;
  }

  return false;
}

export function normalizeVisibilityId(value) {
  return normalizeId(value);
}
