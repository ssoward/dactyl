import crypto from 'node:crypto';

/**
 * Sign a webhook payload body with HMAC-SHA256.
 * Returns the hex digest, sent as the X-Dactyl-Signature header.
 */
export function signWebhookPayload(secret: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

/**
 * Constant-time verification of a webhook signature.
 */
export function verifyWebhookSignature(
  secret: string,
  body: string,
  signature: string,
): boolean {
  const expected = signWebhookPayload(secret, body);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature, 'hex'),
    );
  } catch {
    return false;
  }
}
