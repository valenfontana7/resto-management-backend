import { createHmac, timingSafeEqual } from 'crypto';

export interface ResendWebhookHeaders {
  svixId?: string;
  svixTimestamp?: string;
  svixSignature?: string;
}

/**
 * Verifica firma Svix (Resend webhooks).
 * @see https://resend.com/docs/dashboard/webhooks/verify
 */
export function verifyResendWebhookSignature(
  rawBody: string,
  headers: ResendWebhookHeaders,
  secret: string | undefined,
): { valid: boolean; reason?: string } {
  if (!secret?.trim()) {
    return { valid: false, reason: 'RESEND_WEBHOOK_SECRET not configured' };
  }

  const svixId = headers.svixId;
  const svixTimestamp = headers.svixTimestamp;
  const svixSignature = headers.svixSignature;

  if (!svixId || !svixTimestamp || !svixSignature) {
    return { valid: false, reason: 'Missing Svix headers' };
  }

  const timestampSec = Number(svixTimestamp);
  if (!Number.isFinite(timestampSec)) {
    return { valid: false, reason: 'Invalid svix-timestamp' };
  }

  const ageSec = Math.abs(Date.now() / 1000 - timestampSec);
  if (ageSec > 300) {
    return { valid: false, reason: 'Webhook timestamp too old' };
  }

  const secretPart = secret.startsWith('whsec_')
    ? secret.slice('whsec_'.length)
    : secret;

  let secretBytes: Buffer;
  try {
    secretBytes = Buffer.from(secretPart, 'base64');
  } catch {
    return { valid: false, reason: 'Invalid webhook secret encoding' };
  }

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');

  const signatures = svixSignature
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.startsWith('v1,') ? part.slice(3) : part));

  const expectedBuf = Buffer.from(expected);
  const matched = signatures.some((sig) => {
    try {
      const sigBuf = Buffer.from(sig);
      return (
        sigBuf.length === expectedBuf.length &&
        timingSafeEqual(sigBuf, expectedBuf)
      );
    } catch {
      return false;
    }
  });

  if (!matched) {
    return { valid: false, reason: 'Signature mismatch' };
  }

  return { valid: true };
}
