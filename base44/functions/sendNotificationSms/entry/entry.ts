import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

type SmsPayload = {
  phone?: string;
  message?: string;
  notificationId?: string;
  dispatchId?: string;
  recipientAccessCodeId?: string;
};

type SmsResult = {
  ok: boolean;
  provider: 'signalwire';
  providerMessageId: string | null;
  sentAt: string | null;
  error?: string;
  reason?: string;
};

type ProviderConfig = {
  projectId: string;
  authToken: string;
  spaceUrl: string;
  fromPhone: string;
  statusCallbackUrl: string;
  configured: boolean;
};

type SignalWireMessageResponse = {
  sid?: string;
  date_created?: string;
  message?: string;
  error_message?: string;
};

function readPayload(body: unknown): SmsPayload {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid payload.');
  }
  return body as SmsPayload;
}

function maskPhone(value: string): string {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  return `***${normalized.slice(-4)}`;
}

function normalizeSpaceUrl(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed.replace(/\/+$/, '');
  }
  return `https://${trimmed.replace(/\/+$/, '')}`;
}

function normalizeUrl(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/+$/, '');
}

function getProviderConfig(): ProviderConfig {
  const projectId = String(Deno.env.get('SIGNALWIRE_PROJECT_ID') || '').trim();
  const authToken = String(Deno.env.get('SIGNALWIRE_AUTH_TOKEN') || '').trim();
  const spaceUrl = normalizeSpaceUrl(String(Deno.env.get('SIGNALWIRE_SPACE_URL') || ''));
  const fromPhone = String(Deno.env.get('SIGNALWIRE_FROM_PHONE') || '').trim();
  const statusCallbackUrl = normalizeUrl(String(Deno.env.get('SIGNALWIRE_SMS_STATUS_CALLBACK_URL') || ''));

  return {
    projectId,
    authToken,
    spaceUrl,
    fromPhone,
    statusCallbackUrl,
    configured: Boolean(projectId && authToken && spaceUrl && fromPhone),
  };
}

function getSignalWireMessagesUrl(config: ProviderConfig): string {
  return `${config.spaceUrl}/api/laml/2010-04-01/Accounts/${encodeURIComponent(config.projectId)}/Messages.json`;
}

function extractErrorMessage(responseBody: SignalWireMessageResponse | null, fallbackText: string): string {
  return String(
    responseBody?.error_message ||
    responseBody?.message ||
    fallbackText ||
    'Unknown SignalWire API error'
  );
}

Deno.serve(async (req: Request) => {
  console.log('sendNotificationSms invoked');

  try {
    createClientFromRequest(req);

    const payload = readPayload(await req.json());
    const phone = String(payload.phone || '').trim();
    const message = String(payload.message || '').trim();

    console.log('sendNotificationSms payload received', {
      notificationId: payload.notificationId || null,
      dispatchId: payload.dispatchId || null,
      recipientAccessCodeId: payload.recipientAccessCodeId || null,
      phoneMasked: maskPhone(phone),
      messageLength: message.length,
    });

    if (!phone) {
      return Response.json<SmsResult>({
        ok: false,
        provider: 'signalwire',
        providerMessageId: null,
        sentAt: null,
        reason: 'invalid_input',
        error: 'phone is required',
      }, { status: 400 });
    }

    if (!message) {
      return Response.json<SmsResult>({
        ok: false,
        provider: 'signalwire',
        providerMessageId: null,
        sentAt: null,
        reason: 'invalid_input',
        error: 'message is required',
      }, { status: 400 });
    }

    const config = getProviderConfig();

    console.log('sendNotificationSms provider config check', {
      configured: config.configured,
      hasProjectId: Boolean(config.projectId),
      hasAuthToken: Boolean(config.authToken),
      hasSpaceUrl: Boolean(config.spaceUrl),
      hasFromPhone: Boolean(config.fromPhone),
      hasStatusCallbackUrl: Boolean(config.statusCallbackUrl),
    });

    if (!config.configured) {
      return Response.json<SmsResult>({
        ok: false,
        provider: 'signalwire',
        providerMessageId: null,
        sentAt: null,
        reason: 'provider_not_configured',
        error: 'SignalWire credentials are not configured in Base44 Secrets.',
      }, { status: 200 });
    }

    const url = getSignalWireMessagesUrl(config);
    const authHeader = `Basic ${btoa(`${config.projectId}:${config.authToken}`)}`;

    const body = new URLSearchParams({
      To: phone,
      From: config.fromPhone,
      Body: message,
    });

    if (config.statusCallbackUrl) {
      body.set('StatusCallback', config.statusCallbackUrl);
    }

    console.log('sendNotificationSms request about to be sent to SignalWire', {
      url,
      toPhoneMasked: maskPhone(phone),
      fromPhoneMasked: maskPhone(config.fromPhone),
      hasStatusCallbackUrl: Boolean(config.statusCallbackUrl),
      messageLength: message.length,
    });

    const providerResponse = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    const responseText = await providerResponse.text();
    let responseJson: SignalWireMessageResponse | null = null;

    try {
      responseJson = responseText ? JSON.parse(responseText) as SignalWireMessageResponse : null;
    } catch {
      responseJson = null;
    }

    if (!providerResponse.ok) {
      const failureReason = extractErrorMessage(responseJson, responseText);

      return Response.json<SmsResult>({
        ok: false,
        provider: 'signalwire',
        providerMessageId: responseJson?.sid || null,
        sentAt: null,
        reason: 'provider_api_error',
        error: failureReason,
      }, { status: 200 });
    }

    return Response.json<SmsResult>({
      ok: true,
      provider: 'signalwire',
      providerMessageId: responseJson?.sid || null,
      sentAt: responseJson?.date_created || new Date().toISOString(),
    }, { status: 200 });
  } catch (error) {
    console.error('sendNotificationSms failure reason', { reason: 'unexpected_error', error });

    return Response.json<SmsResult>({
      ok: false,
      provider: 'signalwire',
      providerMessageId: null,
      sentAt: null,
      reason: 'unexpected_error',
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
});
