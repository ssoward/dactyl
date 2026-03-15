import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from './jwt.js';
import { DactylError, ERROR_CODES } from '../lib/errors.js';
import { query } from '../db/client.js';

// Augment Fastify's request interface so TypeScript knows about agentId
declare module 'fastify' {
  interface FastifyRequest {
    agentId: string;
  }
}

/**
 * Fastify preHandler: validates the RS256 JWT from the request.
 *
 * Accepts the token via:
 *   - X-Agent-Token: <jwt>
 *   - Authorization: Bearer <jwt>
 *
 * On success: sets request.agentId and fires an async last_active_at update.
 * On failure: replies 401 with { error: { code: "invalid_token" } }.
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  let token: string | undefined;

  const xAgentToken = request.headers['x-agent-token'];
  if (typeof xAgentToken === 'string' && xAgentToken.length > 0) {
    token = xAgentToken;
  } else {
    const authHeader = request.headers['authorization'];
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }
  }

  if (!token) {
    throw new DactylError(ERROR_CODES.INVALID_TOKEN, {
      reason: 'missing_token',
    });
  }

  const payload = await verifyToken(token);
  request.agentId = payload.agentId;

  // Fire-and-forget last_active_at update — do not await
  query(
    'UPDATE agents SET last_active_at = NOW() WHERE id = $1',
    [payload.agentId],
  ).catch(() => {
    // Swallow silently; this is a best-effort update
  });
}

/**
 * Convenience wrapper: throw 401 if the calling agent is not the expected agent.
 */
export function requireOwner(
  request: FastifyRequest,
  ownerId: string,
): void {
  if (request.agentId !== ownerId) {
    throw new DactylError(ERROR_CODES.UNAUTHORIZED, {
      reason: 'not_owner',
    });
  }
}
