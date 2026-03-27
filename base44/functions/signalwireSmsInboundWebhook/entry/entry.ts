import { createClient } from 'npm:@base44/sdk@0.8.20';

type SignalWireInboundPayload = {
  MessageSid?: string;
  SmsSid?: string;
  AccountSid?: string;
  MessagingServiceSid?: string;
  From?: string;
  To?: string;
  Body?: string;
};

type ProviderConfig = {
  projectId: string;
  authToken: string;
  spaceUrl: string;
  fromPhone: string;
  configured: boolean;
};

type SmsSendResult = {
  ok: boolean;
  providerMessageId: string | null;
  sentAt: string | null;
  error?: string;
};

const STOP_KEYWORDS = new Set(['STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT']);
const HELP_KEYWORDS = new Set(['HELP', 'SUPPORT']);
const START_KEYWORDS = new Set(['START', 'YES', 'SUBSCRIBE']);

const MESSAGES = {
  stop: 'CCG Transit: You have been unsubscribed from SMS notifications and will no longer receive text messages. Reply START to resubscribe.',
  help: 'CCG Transit: You are receiving work-related dispatch and operational text notifications. For help, contact alex@ccgnj.com. Reply STOP to opt out.',
  start: 'CCG Transit: SMS notifications have been re-enabled for your account. Message frequency varies. Reply STOP to opt out.',
  startDenied: 'CCG Transit: We could not re-enable SMS because consent is not on file for this number. Contact alex@ccgnj.com for assistance.',
};

function normalizeSpaceUrl(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed.replace(/\/+$/, '');
  }
  return `https://${trimmed.replace(/\/+$/, '')}`;
}

function getProviderConfig(): ProviderConfig {
  const projectId = String(Deno.env.get('SIGNALWIRE_PROJECT_ID') || '').trim();
  const authToken = String(Deno.env.get('SIGNALWIRE_AUTH_TOKEN') || '').trim();
  const spaceUrl = normalizeSpaceUrl(String(Deno.env.get('SIGNALWIRE_SPACE_URL') || ''));
  const fromPhone = String(Deno.env.get('SIGNALWIRE_FROM_PHONE') || '').trim();

  return {
    projectId,
    authToken,
    spaceUrl,
    fromPhone,
    configured: Boolean(projectId && authToken && spaceUrl && fromPhone),
  };
}

function getSignalWireMessagesUrl(config: ProviderConfig): string {
  return `${config.spaceUrl}/api/laml/2010-04-01/Accounts/${encodeURIComponent(config.projectId)}/Messages.json`;
}

function normalizePhoneForMatch(value: string): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';

  if (digits.length === 10) return `1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return digits;
  return digits;
}

function normalizeKeyword(value: string): string {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return '';
  return text.split(/\s+/)[0] || '';
}

function hasUsSmsPhone(value: string): boolean {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
}

function parseInboundPayload(req: Request, contentType: string): Promise<SignalWireInboundPayload> {
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return req.formData().then((form) => Object.fromEntries(form.entries()) as SignalWireInboundPayload);
  }

  if (contentType.includes('application/json')) {
    return req.json();
  }

  return req.formData().then((form) => Object.fromEntries(form.entries()) as SignalWireInboundPayload);
}

async function sendSms(config: ProviderConfig, to: string, message: string): Promise<SmsSendResult> {
  if (!config.configured) {
    return { ok: false, providerMessageId: null, sentAt: null, error: 'SignalWire provider not configured' };
  }

  const authHeader = `Basic ${btoa(`${config.projectId}:${config.authToken}`)}`;
  const body = new URLSearchParams({
    To: to,
    From: config.fromPhone,
    Body: message,
  });

  const providerResponse = await fetch(getSignalWireMessagesUrl(config), {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const responseText = await providerResponse.text();
  let responseJson: Record<string, unknown> = {};

  try {
    responseJson = responseText ? JSON.parse(responseText) as Record<string, unknown> : {};
  } catch {
    responseJson = {};
  }

  if (!providerResponse.ok) {
    return {
      ok: false,
      providerMessageId: typeof responseJson.sid === 'string' ? responseJson.sid : null,
      sentAt: null,
      error: String(responseJson.error_message || responseJson.message || responseText || 'SignalWire send failed'),
    };
  }

  return {
    ok: true,
    providerMessageId: typeof responseJson.sid === 'string' ? responseJson.sid : null,
    sentAt: typeof responseJson.date_created === 'string' ? responseJson.date_created : new Date().toISOString(),
  };
}

async function createInboundLog(base44: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  try {
    await base44.entities.General.create(payload);
  } catch (error) {
    console.error('signalwireSmsInboundWebhook: failed to create sms_inbound_log', error);
  }
}

Deno.serve(async (req: Request) => {
  try {
    const contentType = req.headers.get('content-type') || '';
    const payload = await parseInboundPayload(req, contentType);

    const from = String(payload.From || '').trim();
    const to = String(payload.To || '').trim();
    const body = String(payload.Body || '').trim();
    const keyword = normalizeKeyword(body);

    const providerMessageId = String(payload.MessageSid || payload.SmsSid || '').trim() || null;

    const base44 = createClient({
      appId: Deno.env.get('BASE44_APP_ID') || '',
      apiKey: Deno.env.get('BASE44_SERVICE_ROLE_KEY') || '',
    });

    const normalizedFrom = normalizePhoneForMatch(from);

    const candidates = await base44.entities.AccessCode.filter({
      sms_phone: from,
    }, '-created_date', 5);

    let accessCode = candidates?.[0] || null;

    if (!accessCode && normalizedFrom) {
      const plusOne = `+${normalizedFrom}`;
      const altCandidates = await base44.entities.AccessCode.filter({ sms_phone: plusOne }, '-created_date', 5);
      accessCode = altCandidates?.[0] || null;
    }

    if (!accessCode && normalizedFrom) {
      const local10 = normalizedFrom.length === 11 && normalizedFrom.startsWith('1') ? normalizedFrom.slice(1) : normalizedFrom;
      const hyphenCandidates = await base44.entities.AccessCode.filter({ sms_phone: local10 }, '-created_date', 5);
      accessCode = hyphenCandidates?.[0] || null;
    }

    let action = 'ignored';
    let status: 'queued' | 'sent' | 'failed' | 'skipped' = 'skipped';
    let responseMessage: string | null = null;
    let responseSendResult: SmsSendResult | null = null;

    if (!accessCode) {
      action = 'unknown_sender';
    } else if (STOP_KEYWORDS.has(keyword)) {
      await base44.entities.AccessCode.update(accessCode.id, {
        sms_enabled: false,
        sms_opted_out_at: new Date().toISOString(),
      });

      action = 'opt_out';
      responseMessage = MESSAGES.stop;
    } else if (HELP_KEYWORDS.has(keyword)) {
      action = 'help';
      responseMessage = MESSAGES.help;
    } else if (START_KEYWORDS.has(keyword)) {
      const accessCodePhone = String(accessCode.sms_phone || '').trim();
      const canResubscribe = accessCode.sms_consent_given === true && hasUsSmsPhone(accessCodePhone);
      if (canResubscribe) {
        await base44.entities.AccessCode.update(accessCode.id, {
          sms_enabled: true,
          sms_opted_out_at: null,
        });

        action = 'resubscribe';
        responseMessage = MESSAGES.start;
      } else {
        action = 'resubscribe_denied_missing_consent';
        responseMessage = MESSAGES.startDenied;
      }
    } else {
      action = 'unsupported_keyword';
    }

    if (responseMessage && from) {
      const providerConfig = getProviderConfig();
      responseSendResult = await sendSms(providerConfig, from, responseMessage);
      status = responseSendResult.ok ? 'sent' : 'failed';
    }

    await createInboundLog(base44, {
      record_type: 'sms_inbound_log',
      status,
      recipient_access_code_id: accessCode?.id || null,
      recipient_type: accessCode?.code_type || null,
      recipient_name: accessCode?.label || accessCode?.code || null,
      phone: from || null,
      message: body || null,
      inbound_keyword: keyword || null,
      skip_reason: action,
      provider: 'signalwire',
      provider_message_id: providerMessageId,
      provider_status_payload: JSON.stringify({
        inbound: payload,
        action,
        to,
        responseMessage,
        responseSendResult,
      }),
      sent_at: responseSendResult?.ok ? responseSendResult.sentAt : null,
      error_message: responseSendResult?.ok ? null : (responseSendResult?.error || null),
    });

    return new Response(JSON.stringify({
      ok: true,
      action,
      keyword: keyword || null,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('signalwireSmsInboundWebhook error', error);

    return new Response(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
