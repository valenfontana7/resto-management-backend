import { describe, expect, it } from '@jest/globals';
import { createHmac } from 'crypto';
import { verifyResendWebhookSignature } from './resend-webhook.verify';

function signPayload(
  body: string,
  secret: string,
  svixId = 'msg_test',
  svixTimestamp = String(Math.floor(Date.now() / 1000)),
): { svixId: string; svixTimestamp: string; svixSignature: string } {
  const secretPart = secret.startsWith('whsec_')
    ? secret.slice('whsec_'.length)
    : secret;
  const secretBytes = Buffer.from(secretPart, 'base64');
  const signedContent = `${svixId}.${svixTimestamp}.${body}`;
  const signature = createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');
  return {
    svixId,
    svixTimestamp,
    svixSignature: `v1,${signature}`,
  };
}

describe('verifyResendWebhookSignature', () => {
  const secret = `whsec_${Buffer.from('test-secret-key-32bytes-long!!').toString('base64')}`;

  it('acepta firma válida', () => {
    const body = JSON.stringify({
      type: 'email.opened',
      data: { email_id: 'e1' },
    });
    const headers = signPayload(body, secret);
    const result = verifyResendWebhookSignature(body, headers, secret);
    expect(result.valid).toBe(true);
  });

  it('rechaza firma inválida', () => {
    const body = JSON.stringify({ type: 'email.clicked' });
    const result = verifyResendWebhookSignature(
      body,
      {
        svixId: 'msg_x',
        svixTimestamp: String(Math.floor(Date.now() / 1000)),
        svixSignature: 'v1,invalid',
      },
      secret,
    );
    expect(result.valid).toBe(false);
  });
});
