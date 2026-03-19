import { createClient } from 'npm:@base44/sdk@0.8.20';

type SignalWireWebhookPayload = {
  MessageSid?: string;
  MessageStatus?: string;
  SmsStatus?: string;
  From?: string;
  To?: string;
  Body?: string;
  ErrorCode?: string;
  ErrorMessage?: string;
};

function normalizeStatus(value: string): string {
  const status = String(value || '').trim().toLowerCase();

  switch (status) {
    case 'queued':
      return 'queued';
    case 'sending':
      return 'sending';
    case 'sent':
      return 'sent';
    case 'delivered':
      return 'delivered';
    case 'failed':
      return 'failed';
    case 'undelivered':
      return 'undelivered';
    default:
      return 'sent';
  }
}

function buildErrorMessage(payload: SignalWireWebhookPayload): string | null {
  const parts = [
    payload.ErrorMessage,
    payload.ErrorCode ? `ErrorCode: ${payload.ErrorCode}` : null,
    payload.MessageStatus || payload.SmsStatus || null,
  ].filter(Boolean);

  if (!parts.length) return null;
  return parts.join(' | ');
}

Deno.serve(async (req: Request) => {
  try {
    const contentType = req.headers.get('content-type') || '';
    let payload: SignalWireWebhookPayload = {};

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const form = await req.formData();
      payload = Object.fromEntries(form.entries()) as SignalWireWebhookPayload;
    } else if (contentType.includes('application/json')) {
      payload = await req.json();
    } else {
      const form = await req.formData();
      payload = Object.fromEntries(form.entries()) as SignalWireWebhookPayload;
    }

    const messageSid = String(payload.MessageSid || '').trim();
    const messageStatus = String(payload.MessageStatus || payload.SmsStatus || '').trim();

    if (!messageSid || !messageStatus) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Missing MessageSid or MessageStatus',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const normalizedStatus = normalizeStatus(messageStatus);

    const base44 = createClient({
      appId: Deno.env.get('BASE44_APP_ID') || '',
      apiKey: Deno.env.get('BASE44_SERVICE_ROLE_KEY') || '',
    });

    const existingLogs = await base44.entities.General.filter({
      record_type: 'sms_log',
      provider_message_id: messageSid,
    }, '-created_date', 1);

    const existingLog = existingLogs?.[0];

    if (!existingLog) {
      return new Response(JSON.stringify({
        ok: true,
        message: 'No matching SMS log found',
        providerMessageId: messageSid,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      status: normalizedStatus,
      provider: 'signalwire',
      provider_message_id: messageSid,
      provider_status_payload: JSON.stringify(payload),
    };

    if (normalizedStatus === 'delivered') {
      updateData.delivered_at = now;
    }

    if (normalizedStatus === 'failed' || normalizedStatus === 'undelivered') {
      updateData.failed_at = now;
      updateData.error_message = buildErrorMessage(payload);
    }

    await base44.entities.General.update(existingLog.id, updateData);

    return new Response(JSON.stringify({
      ok: true,
      updatedId: existingLog.id,
      status: normalizedStatus,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('signalwireSmsStatusWebhook error', error);

    return new Response(JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
