import { describe, it, expect } from 'vitest';
import { signWebhookPayload, verifyWebhookSignature } from '../../src/webhooks/hmac.js';

const SECRET = 'test-secret-key-abc123';
const BODY = JSON.stringify({ event: 'task.completed', task_id: 'tsk_abc' });

describe('signWebhookPayload', () => {
  it('returns a non-empty hex string', () => {
    const sig = signWebhookPayload(SECRET, BODY);
    expect(typeof sig).toBe('string');
    expect(sig.length).toBeGreaterThan(0);
    // SHA-256 hex is 64 chars
    expect(sig).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(sig)).toBe(true);
  });

  it('produces the same output for the same inputs', () => {
    const sig1 = signWebhookPayload(SECRET, BODY);
    const sig2 = signWebhookPayload(SECRET, BODY);
    expect(sig1).toBe(sig2);
  });

  it('produces different output for different secrets', () => {
    const sig1 = signWebhookPayload(SECRET, BODY);
    const sig2 = signWebhookPayload('different-secret', BODY);
    expect(sig1).not.toBe(sig2);
  });
});

describe('verifyWebhookSignature', () => {
  it('returns true for matching secret and body', () => {
    const sig = signWebhookPayload(SECRET, BODY);
    expect(verifyWebhookSignature(SECRET, BODY, sig)).toBe(true);
  });

  it('returns false for wrong secret', () => {
    const sig = signWebhookPayload(SECRET, BODY);
    expect(verifyWebhookSignature('wrong-secret', BODY, sig)).toBe(false);
  });

  it('returns false for tampered body', () => {
    const sig = signWebhookPayload(SECRET, BODY);
    const tampered = BODY + ' tampered';
    expect(verifyWebhookSignature(SECRET, tampered, sig)).toBe(false);
  });

  it('returns false for tampered signature', () => {
    const sig = signWebhookPayload(SECRET, BODY);
    const tampered = sig.slice(0, -1) + (sig.endsWith('a') ? 'b' : 'a');
    expect(verifyWebhookSignature(SECRET, BODY, tampered)).toBe(false);
  });
});
