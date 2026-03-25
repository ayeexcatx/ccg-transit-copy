import {
  buildConfirmedTruckSetForStatus,
  deriveConfirmationCoverage,
  parseStatusFromDispatchStatusKey,
} from './confirmationStateHelpers';

export const CLICK_TO_READ_NOTIFICATION_CATEGORIES = new Set(['dispatch_update_info', 'driver_dispatch_seen']);
export const NON_CONFIRMATION_NOTIFICATION_CATEGORIES = CLICK_TO_READ_NOTIFICATION_CATEGORIES;

function parseStatusFromDedupKey(notification) {
  return parseStatusFromDispatchStatusKey(notification?.dispatch_status_key);
}

export function isNotificationMarkedReadOnClick(notification) {
  return CLICK_TO_READ_NOTIFICATION_CATEGORIES.has(notification?.notification_category);
}

export function getNotificationEffectiveReadFlag({
  session,
  notification,
  dispatch = null,
  confirmations = [],
  ownerAllowedTrucks = [],
}) {
  if (session?.code_type !== 'CompanyOwner') {
    return Boolean(notification?.read_flag);
  }

  return getOwnerNotificationActionStatus({
    notification,
    dispatch,
    confirmations,
    ownerAllowedTrucks,
  }).effectiveReadFlag;
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
  const confirmationSet = buildConfirmedTruckSetForStatus({
    confirmations,
    dispatchId,
    status,
  });
  const { confirmedTrucks, pendingTrucks, done, total, allConfirmed } = deriveConfirmationCoverage(requiredTrucks, confirmationSet);
  const needsAction = !allConfirmed;

  return {
    isOwnerConfirmationNotification: true,
    status,
    requiredTrucks,
    confirmedTrucks,
    pendingTrucks,
    total,
    done,
    needsAction,
    effectiveReadFlag: notification?.read_flag || !needsAction,
  };
}
