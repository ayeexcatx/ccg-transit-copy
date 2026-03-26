import { base44 } from '@/api/base44Client';
import { formatDispatchDateTimeLine } from '@/components/notifications/dispatchDateTimeFormat';
import { getCompanyOwnerSmsState, getDriverSmsState } from '@/lib/sms';

const SMS_PROVIDER = 'signalwire';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function maskPhone(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;

  const lastFour = normalized.slice(-4);
  return `***${lastFour}`;
}

function normalizeHeadline(value) {
  const headline = normalizeText(value);
  if (!headline) return '';
  return /[.!?]$/.test(headline) ? headline : `${headline}.`;
}

async function resolveDispatchDateTimeLine(notification) {
  const dispatchId = notification?.related_dispatch_id;
  if (!dispatchId) return '';

  try {
    const records = await base44.entities.Dispatch.filter({ id: dispatchId }, '-created_date', 1);
    const dispatch = records?.[0] || null;
    return formatDispatchDateTimeLine(dispatch);
  } catch (error) {
    console.error('SMS debug: failed resolving dispatch for SMS format', {
      notificationId: notification?.id || null,
      dispatchId,
      error,
    });
    return '';
  }
}

async function buildSmsMessage(notification) {
  if (!notification?.related_dispatch_id) {
    return notification?.message || '';
  }

  const headline = normalizeHeadline(notification?.title || 'Dispatch update');
  const dispatchDateTimeLine = await resolveDispatchDateTimeLine(notification);
  const dispatchLine = dispatchDateTimeLine || 'Dispatch details are available in the app.';

  return `CCG Transit: ${headline}\n${dispatchLine}\n\nPlease open the app to view and confirm.`;
}

async function createSmsLog({
  notification,
  recipient,
  phone,
  message,
  status,
  skipReason = null,
  errorMessage = null,
  provider = SMS_PROVIDER,
  providerMessageId = null,
  sentAt = null,
}) {
  try {
    await base44.entities.General.create({
      record_type: 'sms_log',
      notification_id: notification?.id || null,
      dispatch_id: notification?.related_dispatch_id || null,
      recipient_access_code_id: recipient?.id || notification?.recipient_access_code_id || notification?.recipient_id || null,
      recipient_type: notification?.recipient_type || null,
      recipient_name: recipient?.label || recipient?.name || recipient?.code || null,
      phone: phone || null,
      message: message || null,
      status,
      skip_reason: skipReason,
      error_message: errorMessage,
      provider,
      provider_message_id: providerMessageId,
      sent_at: sentAt,
    });

    console.log('SMS debug: General log create succeeded', {
      notificationId: notification?.id || null,
      status,
      skipReason: skipReason || null,
    });
  } catch (error) {
    console.error('SMS debug: General log create failed', {
      notificationId: notification?.id || null,
      status,
      skipReason: skipReason || null,
      error,
    });
  }
}


async function resolveSmsEligibility(recipient) {
  if (!recipient) {
    return { smsEnabled: false, smsPhone: '', skipReason: 'recipient_access_code_not_found' };
  }

  if (recipient.code_type === 'Driver') {
    const driverRecords = await base44.entities.Driver.filter({ id: recipient.driver_id }, '-created_date', 1);
    const driver = driverRecords?.[0] || null;
    const state = getDriverSmsState(driver);
    return {
      smsEnabled: state.effective,
      smsPhone: state.normalizedPhone || '',
      skipReason: !state.ownerEnabled ? 'owner_sms_disabled' : !state.driverOptedIn ? 'driver_not_opted_in' : !state.hasValidPhone ? 'missing_sms_phone' : null,
    };
  }

  if (recipient.code_type === 'CompanyOwner') {
    const companyRecords = await base44.entities.Company.filter({ id: recipient.company_id }, '-created_date', 1);
    const company = companyRecords?.[0] || null;
    const state = getCompanyOwnerSmsState({ accessCode: recipient, company });
    return {
      smsEnabled: state.effective,
      smsPhone: state.normalizedPhone || '',
      skipReason: !state.optedIn ? 'owner_not_opted_in' : !state.hasValidPhone ? 'missing_sms_phone' : null,
    };
  }

  if (recipient.code_type === 'Admin') {
    return {
      smsEnabled: recipient.sms_enabled === true,
      smsPhone: normalizeText(recipient.sms_phone),
      skipReason: recipient.sms_enabled === true ? null : 'sms_disabled',
    };
  }

  return {
    smsEnabled: false,
    smsPhone: '',
    skipReason: 'unsupported_access_code_type',
  };
}

async function resolveRecipientAccessCode(notification) {
  const recipientId = notification?.recipient_access_code_id || notification?.recipient_id;
  if (!recipientId) return null;

  const records = await base44.entities.AccessCode.filter({ id: recipientId }, '-created_date', 1);
  return records?.[0] || null;
}

export async function sendNotificationSmsIfEligible(notification) {
  try {
    if (!notification?.id) return;

    console.log('SMS debug: sendNotificationSmsIfEligible invoked', {
      notificationId: notification.id,
      recipientType: notification.recipient_type,
      recipientAccessCodeId: notification.recipient_access_code_id || null,
      recipientId: notification.recipient_id || null,
      title: notification.title || null,
    });

    if (notification.recipient_type !== 'AccessCode') {
      console.log('SMS debug exit: recipient not AccessCode', {
        notificationId: notification.id,
        recipientType: notification.recipient_type,
        recipientAccessCodeId: notification.recipient_access_code_id || null,
        recipientId: notification.recipient_id || null,
      });

      await createSmsLog({
        notification,
        recipient: null,
        phone: null,
        message: notification.message || null,
        status: 'skipped',
        skipReason: 'recipient_not_access_code',
      });
      return;
    }

    const recipient = await resolveRecipientAccessCode(notification);
    if (!recipient) {
      console.log('SMS debug exit: recipient access code not found', {
        notificationId: notification.id,
        recipientAccessCodeId: notification.recipient_access_code_id || null,
        recipientId: notification.recipient_id || null,
      });

      await createSmsLog({
        notification,
        recipient: null,
        phone: null,
        message: notification.message || null,
        status: 'skipped',
        skipReason: 'recipient_access_code_not_found',
      });
      return;
    }

    const { smsEnabled, smsPhone, skipReason } = await resolveSmsEligibility(recipient);

    if (!smsEnabled) {
      console.log('SMS debug exit: sms disabled', {
        notificationId: notification.id,
        recipientAccessCodeId: recipient.id,
      });

      await createSmsLog({
        notification,
        recipient,
        phone: smsPhone || null,
        message: notification.message || null,
        status: 'skipped',
        skipReason: skipReason || 'sms_disabled',
      });
      return;
    }

    if (!smsPhone) {
      console.log('SMS debug exit: missing sms phone', {
        notificationId: notification.id,
        recipientAccessCodeId: recipient.id,
      });

      await createSmsLog({
        notification,
        recipient,
        phone: null,
        message: notification.message || null,
        status: 'skipped',
        skipReason: 'missing_sms_phone',
      });
      return;
    }

    console.log('SMS debug: before invoking backend function', {
      notificationId: notification.id,
      recipientAccessCodeId: recipient.id,
      phoneMasked: maskPhone(smsPhone),
      relatedDispatchId: notification.related_dispatch_id || null,
    });

    const smsMessage = await buildSmsMessage(notification);

    const response = await base44.functions.invoke('sendNotificationSms/entry', {
      phone: smsPhone,
      message: smsMessage,
      notificationId: notification.id,
      dispatchId: notification.related_dispatch_id || null,
      recipientAccessCodeId: recipient.id,
    });

    const responseData = response?.data || response || {};

    console.log('SMS debug: after backend function response', {
      notificationId: notification.id,
      recipientAccessCodeId: recipient.id,
      responseData,
    });

    if (responseData?.ok) {
      await createSmsLog({
        notification,
        recipient,
        phone: smsPhone,
        message: smsMessage || null,
        status: 'sent',
        provider: responseData.provider || SMS_PROVIDER,
        providerMessageId: responseData.providerMessageId || null,
        sentAt: responseData.sentAt || new Date().toISOString(),
      });
      return;
    }

    const reason = responseData?.reason || null;
    const isProviderNotConfigured = reason === 'provider_not_configured';
    const errorMessage = responseData?.error || 'Unknown SignalWire provider error';

    await createSmsLog({
      notification,
      recipient,
      phone: smsPhone,
      message: smsMessage || null,
      status: isProviderNotConfigured ? 'skipped' : 'failed',
      skipReason: isProviderNotConfigured ? 'provider_not_configured' : null,
      errorMessage,
      provider: responseData?.provider || SMS_PROVIDER,
      providerMessageId: responseData?.providerMessageId || null,
    });
  } catch (error) {
    console.error('SMS delivery attempt failed:', error);

    await createSmsLog({
      notification,
      recipient: null,
      phone: null,
      message: notification?.message || null,
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}
