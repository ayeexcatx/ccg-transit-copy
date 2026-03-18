export const NON_CONFIRMATION_NOTIFICATION_CATEGORIES = new Set(['dispatch_update_info', 'driver_dispatch_confirmed']);

function parseStatusFromDedupKey(notification) {
  const parts = String(notification?.dispatch_status_key || '').split(':');
  return parts.length >= 2 ? parts[1] : '';
}

export function getOwnerNotificationRequiredTrucks({ notification, dispatch = null, ownerAllowedTrucks = [] }) {
  const fallbackRequired = Array.isArray(notification?.required_trucks)
    ? notification.required_trucks.filter(Boolean)
    : [];

  if (!dispatch) return fallbackRequired;

  const dispatchTrucks = Array.isArray(dispatch?.trucks_assigned)
    ? dispatch.trucks_assigned.filter(Boolean)
    : [];

  if (!ownerAllowedTrucks?.length) return fallbackRequired.length ? fallbackRequired : dispatchTrucks;

  const allowedSet = new Set(ownerAllowedTrucks);
  return dispatchTrucks.filter((truck) => allowedSet.has(truck));
}

export function getOwnerNotificationActionStatus({
  notification,
  dispatch = null,
  confirmations = [],
  ownerAllowedTrucks = [],
}) {
  const isOwnerNotification = notification?.recipient_type === 'AccessCode';
  const isConfirmationNotification = !NON_CONFIRMATION_NOTIFICATION_CATEGORIES.has(notification?.notification_category);
  const dispatchId = notification?.related_dispatch_id;
  const status = parseStatusFromDedupKey(notification);

  if (!isOwnerNotification || !isConfirmationNotification || !dispatchId || !status) {
    return {
      isOwnerConfirmationNotification: false,
      status,
      requiredTrucks: [],
      confirmedTrucks: [],
      pendingTrucks: [],
      total: 0,
      done: 0,
      needsAction: !notification?.read_flag,
      effectiveReadFlag: Boolean(notification?.read_flag),
    };
  }

  const requiredTrucks = getOwnerNotificationRequiredTrucks({ notification, dispatch, ownerAllowedTrucks });
  const confirmationSet = new Set(
    confirmations
      .filter((confirmation) => (
        confirmation.dispatch_id === dispatchId &&
        confirmation.confirmation_type === status &&
        confirmation?.truck_number
      ))
      .map((confirmation) => confirmation.truck_number)
  );

  const confirmedTrucks = requiredTrucks.filter((truck) => confirmationSet.has(truck));
  const pendingTrucks = requiredTrucks.filter((truck) => !confirmationSet.has(truck));
  const needsAction = pendingTrucks.length > 0;

  return {
    isOwnerConfirmationNotification: true,
    status,
    requiredTrucks,
    confirmedTrucks,
    pendingTrucks,
    total: requiredTrucks.length,
    done: confirmedTrucks.length,
    needsAction,
    effectiveReadFlag: notification?.read_flag || !needsAction,
  };
}
