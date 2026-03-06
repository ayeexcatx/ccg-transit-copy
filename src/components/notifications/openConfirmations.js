const NON_CONFIRMATION_CATEGORIES = new Set(['dispatch_update_info']);

const dedupeTruckRows = (rows) => {
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.notificationId}:${row.truckNumber}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const parseStatusFromDedupKey = (notification) => {
  const parts = String(notification?.dispatch_status_key || '').split(':');
  return parts.length >= 2 ? parts[1] : '';
};

const resolveRequiredTrucks = (notification, dispatch, ownerCode) => {
  const baseRequired = Array.isArray(notification?.required_trucks)
    ? notification.required_trucks
    : [];

  if (!baseRequired.length) return [];

  const dispatchTruckSet = new Set(dispatch?.trucks_assigned || []);
  const ownerAllowedSet = ownerCode
    ? new Set(ownerCode.allowed_trucks || [])
    : null;

  return baseRequired.filter((truck) => {
    if (!dispatchTruckSet.has(truck)) return false;
    if (ownerAllowedSet && !ownerAllowedSet.has(truck)) return false;
    return true;
  });
};

export function buildOpenConfirmationRows({
  notifications = [],
  confirmations = [],
  dispatches = [],
  companies = [],
  accessCodes = [],
}) {
  const dispatchById = new Map(dispatches.map((dispatch) => [dispatch.id, dispatch]));
  const companyById = new Map(companies.map((company) => [company.id, company]));
  const accessCodeById = new Map(accessCodes.map((accessCode) => [accessCode.id, accessCode]));

  const rows = [];

  notifications.forEach((notification) => {
    const isOwnerNotification = notification.recipient_type === 'AccessCode';
    const isUnread = !notification.read_flag;
    const isConfirmationCategory = !NON_CONFIRMATION_CATEGORIES.has(notification.notification_category);

    if (!isOwnerNotification || !isUnread || !isConfirmationCategory) return;

    const status = parseStatusFromDedupKey(notification);
    if (!status) return;

    const dispatch = dispatchById.get(notification.related_dispatch_id);
    if (!dispatch) return;

    const ownerCodeId = notification.recipient_access_code_id || notification.recipient_id;
    const ownerCode = accessCodeById.get(ownerCodeId);
    if (ownerCode && ownerCode.code_type !== 'CompanyOwner') return;

    const requiredTrucks = resolveRequiredTrucks(notification, dispatch, ownerCode);
    if (!requiredTrucks.length) return;

    const confirmedTrucks = new Set(
      confirmations
        .filter((confirmation) => (
          confirmation.dispatch_id === dispatch.id &&
          confirmation.confirmation_type === status
        ))
        .map((confirmation) => confirmation.truck_number)
    );

    const companyName = companyById.get(dispatch.company_id)?.name || 'Unknown Company';

    requiredTrucks.forEach((truckNumber) => {
      if (confirmedTrucks.has(truckNumber)) return;

      rows.push({
        id: `${notification.id}:${truckNumber}`,
        notificationId: notification.id,
        dispatchId: dispatch.id,
        status,
        companyName,
        dispatchDate: dispatch.date,
        truckNumber,
        clientName: dispatch.client_name || '',
        jobNumber: dispatch.job_number || '',
        createdAt: notification.created_date || notification.created_at || null,
      });
    });
  });

  return dedupeTruckRows(rows).sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
}
