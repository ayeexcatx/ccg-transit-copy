import { hasUsSmsPhone } from '@/lib/smsPhone';

/**
 * Driver opt-in uses explicit driver_sms_opt_in, with legacy fallback to sms_enabled.
 */
export function getDriverOptInState(driver) {
  return driver?.driver_sms_opt_in === true || (driver?.driver_sms_opt_in == null && driver?.sms_enabled === true);
}

/**
 * Driver SMS is active only when owner enabled + driver opted in + valid phone.
 */
export function getDriverEffectiveSmsState({ driver, normalizedPhone }) {
  const ownerEnabled = driver?.owner_sms_enabled === true;
  const driverOptedIn = getDriverOptInState(driver);
  const hasValidPhone = hasUsSmsPhone(normalizedPhone);
  const effective = ownerEnabled && driverOptedIn && hasValidPhone;

  return {
    ownerEnabled,
    driverOptedIn,
    hasValidPhone,
    effective,
  };
}

/**
 * Company-owner SMS is active only when owner opted in + valid designated contact phone.
 */
export function getCompanyOwnerEffectiveSmsState({ accessCode, normalizedPhone }) {
  const optedIn = accessCode?.sms_enabled === true;
  const optedOut = Boolean(accessCode?.sms_opted_out_at);
  const hasValidPhone = Boolean(normalizedPhone);

  return {
    optedIn,
    optedOut,
    hasValidPhone,
    effective: optedIn && !optedOut && hasValidPhone,
  };
}

/**
 * Admin profile stores preference, while product delivery remains inactive currently.
 */
export function getAdminSmsProductState(accessCode) {
  return {
    optedIn: accessCode?.sms_enabled === true,
    optedOut: Boolean(accessCode?.sms_opted_out_at),
    deliveryActive: false,
  };
}
