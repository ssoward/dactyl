import crypto from 'node:crypto';
import { promisify } from 'node:util';
// Type the promisified scrypt correctly
const scryptAsync = promisify(crypto.scrypt);
const API_KEY_PREFIX = 'dactyl_sk_';
const KEY_LEN = 32; // bytes
const SCRYPT_KEYLEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
// Fixed salt per deployment — in production use a per-key random salt
// stored alongside the hash. For Phase 1 simplicity we use a fixed salt
// embedded in the hash string as "salt$hash" (hex:hex).
async function hashKey(raw) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = await scryptAsync(raw, salt, SCRYPT_KEYLEN);
    return `${salt}$${derived.toString('hex')}`;
}
function hashKeySync(raw, salt) {
    const derived = crypto.scryptSync(raw, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
    return `${salt}$${derived.toString('hex')}`;
}
/**
 * Generate a new API key.
 * Returns the plaintext raw key (shown once to the agent) and the stored hash.
 */
export async function generateApiKey() {
    const random = crypto.randomBytes(KEY_LEN).toString('hex');
    const raw = `${API_KEY_PREFIX}${random}`;
    const hash = await hashKey(raw);
    return { raw, hash };
}
/**
 * Verify a raw API key against its stored scrypt hash.
 * Constant-time comparison prevents timing attacks.
 */
export function verifyApiKey(raw, storedHash) {
    try {
        const [salt, expected] = storedHash.split('$');
        if (!salt || !expected)
            return false;
        const actual = hashKeySync(raw, salt);
        const [, actualHex] = actual.split('$');
        if (!actualHex)
            return false;
        return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(actualHex, 'hex'));
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=api-key.js.map