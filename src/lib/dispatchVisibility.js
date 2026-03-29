import { getActiveCompanyId, getEffectiveView } from '@/components/session/workspaceUtils';

const normalizeId = (value) => String(value ?? '');

const getDispatchTrucks = (dispatch) => (Array.isArray(dispatch?.trucks_assigned) ? dispatch.trucks_assigned : []);

/**
 * Build a dispatchId -> unique assigned truck numbers map from active driver assignments.
 */
export function buildDriverAssignedTrucksByDispatch(driverAssignments = []) {
  const map = new Map();

  driverAssignments
    .filter((assignment) => assignment?.active_flag !== false && assignment?.is_visible_to_driver !== false && ['sent','seen'].includes(String(assignment?.delivery_status || 'sent').toLowerCase()))
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
 * - CompanyOwner: same-company only
 */
export function canUserSeeDispatch(session, dispatch, { driverDispatchIds = null, ownerCompanyId = null } = {}) {
  if (!session || !dispatch?.id) return false;
  const effectiveView = getEffectiveView(session);
  if (effectiveView === 'Admin') return true;

  const dispatchId = normalizeId(dispatch.id);
  if (effectiveView === 'Driver') {
    return driverDispatchIds instanceof Set ? driverDispatchIds.has(dispatchId) : false;
  }
  if (effectiveView !== 'CompanyOwner') return false;

  const effectiveCompanyId = ownerCompanyId ?? getActiveCompanyId(session);
  return normalizeId(dispatch.company_id) === normalizeId(effectiveCompanyId);
}

/**
 * Truck visibility for a single dispatch.
 */
export function getVisibleTrucksForDispatch(session, dispatch, { driverAssignedTrucks = [] } = {}) {
  const assigned = getDispatchTrucks(dispatch);
  if (!session) return [];
  const effectiveView = getEffectiveView(session);
  if (effectiveView === 'Admin') return assigned;

  if (effectiveView === 'Driver') {
    return [...new Set((driverAssignedTrucks || []).filter(Boolean))];
  }
  if (effectiveView !== 'CompanyOwner') return [];

  return assigned;
}

/**
 * Notification visibility filtering for bell/list hooks.
 */
export function canUserSeeNotification(session, notification, {
  visibleDispatchIds = new Set(),
  driverDispatchIds = new Set(),
} = {}) {
  if (!notification?.related_dispatch_id) return true;
  const effectiveView = getEffectiveView(session);
  if (effectiveView === 'Admin') return true;

  const relatedDispatchId = normalizeId(notification.related_dispatch_id);
  if (effectiveView === 'Driver') {
    if (notification.notification_category === 'driver_dispatch_update') return true;
    return driverDispatchIds.has(relatedDispatchId);
  }
  if (effectiveView !== 'CompanyOwner') return false;

  return visibleDispatchIds.has(relatedDispatchId);
}

/**
 * Incident visibility across roles.
 */
export function canUserSeeIncident(session, incident, {
  visibleDispatchIds = new Set(),
} = {}) {
  if (!session || !incident) return false;
  const effectiveView = getEffectiveView(session);

  if (effectiveView === 'Admin') return true;

  if (effectiveView === 'Driver') {
    const createdByDriver = incident.reported_by_access_code_id === session.id;
    const tiedToAssignedDispatch = incident.dispatch_id && visibleDispatchIds.has(normalizeId(incident.dispatch_id));
    return createdByDriver || tiedToAssignedDispatch;
  }

  if (effectiveView === 'CompanyOwner') {
    const createdByOwner = incident.reported_by_access_code_id === session.id;
    const forOwnerCompany = incident.company_id === getActiveCompanyId(session);
    return createdByOwner || forOwnerCompany;
  }

  return false;
}

export function normalizeVisibilityId(value) {
  return normalizeId(value);
}
