import { SignJWT, jwtVerify } from 'jose';
import { getPrivateKey, getPublicKey } from './keys.js';
import { DactylError, ERROR_CODES } from '../lib/errors.js';
import { redis } from '../redis/client.js';

const ISSUER = 'dactyl';
const AUDIENCE = 'dactyl-agents';

export interface JwtPayload {
  agentId: string;
  iat: number;
  exp: number;
}

/**
 * Sign a new RS256 JWT for the given agentId.
 * Default expiry: 1 hour.
 */
export async function signToken(
  agentId: string,
  expiresIn = '1h',
): Promise<string> {
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
export async function verifyToken(token: string): Promise<JwtPayload> {
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

    // Check revocation blocklist (populated by DELETE /auth/token)
    const isRevoked = await redis.exists(`dactyl:revoked:${token}`);
    if (isRevoked) {
      throw new DactylError(ERROR_CODES.INVALID_TOKEN, {
        reason: 'revoked',
      });
    }

    return {
      agentId: payload['agentId'],
      iat: payload.iat as number,
      exp: payload.exp as number,
    };
  } catch (err) {
    if (err instanceof DactylError) throw err;
    // Return generic reason — never leak jose internals to the caller
    throw new DactylError(ERROR_CODES.INVALID_TOKEN, {
      reason: 'invalid',
    });
  }
}
