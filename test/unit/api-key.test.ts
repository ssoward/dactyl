import { describe, it, expect } from 'vitest';
import { generateApiKey, verifyApiKey } from '../../src/auth/api-key.js';

describe('generateApiKey', () => {
  it('returns a raw key starting with dactyl_sk_', async () => {
    const { raw } = await generateApiKey();
    expect(raw.startsWith('dactyl_sk_')).toBe(true);
  });

  it('hash is different from raw', async () => {
    const { raw, hash } = await generateApiKey();
    expect(hash).not.toBe(raw);
  });

  it('hash contains a salt separator', async () => {
    const { hash } = await generateApiKey();
    // hash format is "salt$derivedHex"
    expect(hash).toContain('$');
  });

  it('two calls produce different keys', async () => {
    const a = await generateApiKey();
    const b = await generateApiKey();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
  });
});

describe('verifyApiKey', () => {
  it('returns true for a valid raw key against its hash', async () => {
    const { raw, hash } = await generateApiKey();
    expect(verifyApiKey(raw, hash)).toBe(true);
  });

  it('returns false for a wrong raw key against the hash', async () => {
    const { hash } = await generateApiKey();
    expect(verifyApiKey('dactyl_sk_wrongkey', hash)).toBe(false);
  });

  it('returns false for an empty string against a valid hash', async () => {
    const { hash } = await generateApiKey();
    expect(verifyApiKey('', hash)).toBe(false);
  });

  it('returns false for a malformed stored hash', () => {
    expect(verifyApiKey('dactyl_sk_whatever', 'no-dollar-sign-here')).toBe(false);
  });
});
