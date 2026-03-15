import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifyDactylWebhook } from '../src/webhook.js';

function makeSignature(secret: string, body: string | Buffer): string {
  const buf = typeof body === 'string' ? Buffer.from(body) : body;
  return createHmac('sha256', secret).update(buf).digest('hex');
}

describe('verifyDactylWebhook', () => {
  const SECRET = 'super_secret_32_byte_signing_key!';
  const BODY_STR = '{"event":"task.completed","task_id":"tsk_123"}';
  const BODY_BUF = Buffer.from(BODY_STR);

  it('returns true for a valid signature over a string body', () => {
    const sig = makeSignature(SECRET, BODY_STR);
    expect(verifyDactylWebhook(SECRET, BODY_STR, sig)).toBe(true);
  });

  it('returns true for a valid signature over a Buffer body', () => {
    const sig = makeSignature(SECRET, BODY_BUF);
    expect(verifyDactylWebhook(SECRET, BODY_BUF, sig)).toBe(true);
  });

  it('returns true when Buffer and string bodies are equivalent', () => {
    const sig = makeSignature(SECRET, BODY_STR);
    expect(verifyDactylWebhook(SECRET, BODY_BUF, sig)).toBe(true);
  });

  it('returns false for a tampered body (string)', () => {
    const sig = makeSignature(SECRET, BODY_STR);
    const tampered = '{"event":"task.completed","task_id":"tsk_HACKED"}';
    expect(verifyDactylWebhook(SECRET, tampered, sig)).toBe(false);
  });

  it('returns false for a tampered body (Buffer)', () => {
    const sig = makeSignature(SECRET, BODY_STR);
    const tampered = Buffer.from('tampered payload');
    expect(verifyDactylWebhook(SECRET, tampered, sig)).toBe(false);
  });

  it('returns false for a wrong secret', () => {
    const sig = makeSignature('wrong-secret', BODY_STR);
    expect(verifyDactylWebhook(SECRET, BODY_STR, sig)).toBe(false);
  });

  it('returns false for an empty signature', () => {
    expect(verifyDactylWebhook(SECRET, BODY_STR, '')).toBe(false);
  });

  it('returns false for a truncated signature', () => {
    const sig = makeSignature(SECRET, BODY_STR);
    expect(verifyDactylWebhook(SECRET, BODY_STR, sig.slice(0, 20))).toBe(false);
  });

  it('returns false for a completely wrong signature string', () => {
    expect(verifyDactylWebhook(SECRET, BODY_STR, 'not-a-valid-hmac')).toBe(false);
  });

  it('handles empty body correctly (consistent hmac)', () => {
    const emptyBody = '';
    const sig = makeSignature(SECRET, emptyBody);
    expect(verifyDactylWebhook(SECRET, emptyBody, sig)).toBe(true);
  });

  it('is timing-safe — does not throw on length mismatch', () => {
    // The function must return false, not throw, when sig lengths differ
    expect(() =>
      verifyDactylWebhook(SECRET, BODY_STR, 'short'),
    ).not.toThrow();
    expect(verifyDactylWebhook(SECRET, BODY_STR, 'short')).toBe(false);
  });
});
