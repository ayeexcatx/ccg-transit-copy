import { base44 } from '@/api/base44Client';

const SMS_PROVIDER = 'signalwire';

export const SMS_WELCOME_MESSAGE = 'CCG Transit: You are subscribed to receive work-related dispatch and operational text notifications. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out. Reply HELP for help. Support: alex@ccgnj.com';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function logWelcomeSmsFailure({ accessCodeId, phone, errorMessage }) {
  try {
    await base44.entities.General.create({
      record_type: 'sms_log',
      notification_id: null,
      dispatch_id: null,
      recipient_access_code_id: accessCodeId || null,
      recipient_type: 'AccessCode',
      recipient_name: null,
      phone: phone || null,
      message: SMS_WELCOME_MESSAGE,
      status: 'failed',
      skip_reason: 'intro_sms_send_failed',
      error_message: errorMessage || null,
      provider: SMS_PROVIDER,
      provider_message_id: null,
      sent_at: null,
    });
  } catch (error) {
    console.error('Failed to log welcome SMS failure', error);
  }
}

export async function sendSmsWelcomeIfNeeded({ accessCodeId, consentGiven }) {
  if (!accessCodeId || consentGiven !== true) return;

  const records = await base44.entities.AccessCode.filter({ id: accessCodeId }, '-created_date', 1);
  const accessCode = records?.[0] || null;

  if (!accessCode) return;
  if (accessCode.sms_intro_sent_at) return;
  if (accessCode.sms_enabled !== true) return;

  const phone = normalizeText(accessCode.sms_phone);
  if (!phone) return;

  try {
    await base44.functions.invoke('sendNotificationSms/entry', {
      phone,
      message: SMS_WELCOME_MESSAGE,
    });

    await base44.entities.AccessCode.update(accessCode.id, {
      sms_intro_sent_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed sending welcome SMS', error);
    await logWelcomeSmsFailure({
      accessCodeId: accessCode.id,
      phone,
      errorMessage: error?.message || String(error),
    });
  }
}
