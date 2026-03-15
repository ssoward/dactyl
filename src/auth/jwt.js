import { SignJWT, jwtVerify } from 'jose';
import { getPrivateKey, getPublicKey } from './keys.js';
import { DactylError, ERROR_CODES } from '../lib/errors.js';
const ISSUER = 'dactyl';
const AUDIENCE = 'dactyl-agents';
/**
 * Sign a new RS256 JWT for the given agentId.
 * Default expiry: 1 hour.
 */
export async function signToken(agentId, expiresIn = '1h') {
    const privateKey = await getPrivateKey();
    return new SignJWT({ agentId })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuedAt()
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setExpirationTime(expiresIn)
        .sign(privateKey);
}
/**
 * Verify an RS256 JWT and return its payload.
 * Throws DactylError(invalid_token) on any failure.
 */
export async function verifyToken(token) {
    const publicKey = await getPublicKey();
    try {
        const { payload } = await jwtVerify(token, publicKey, {
            issuer: ISSUER,
            audience: AUDIENCE,
        });
        if (typeof payload['agentId'] !== 'string') {
            throw new DactylError(ERROR_CODES.INVALID_TOKEN, {
                reason: 'missing_agent_id',
            });
        }
        return {
            agentId: payload['agentId'],
            iat: payload.iat,
            exp: payload.exp,
        };
    }
    catch (err) {
        if (err instanceof DactylError)
            throw err;
        throw new DactylError(ERROR_CODES.INVALID_TOKEN, {
            reason: err.message,
        });
    }
}
//# sourceMappingURL=jwt.js.map