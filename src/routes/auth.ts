import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { query } from '../db/client.js';
import { generateApiKey, verifyApiKey } from '../auth/api-key.js';
import { signToken, verifyToken } from '../auth/jwt.js';
import { authMiddleware } from '../auth/middleware.js';
import { DactylError, ERROR_CODES } from '../lib/errors.js';
import { newAgentId } from '../lib/id.js';
import { redis } from '../redis/client.js';

const RegisterBody = Type.Object({
  display_name: Type.String({ minLength: 1, maxLength: 80 }),
  description: Type.Optional(Type.String({ maxLength: 500 })),
  capability_tags: Type.Optional(Type.Array(Type.String({ maxLength: 50 }), { maxItems: 20 })),
  webhook_url: Type.Optional(Type.String({ format: 'uri', maxLength: 2048 })),
});

// Block SSRF: prevent agents from registering webhook URLs pointing at
// private networks, localhost, or cloud metadata endpoints.
const PRIVATE_HOST_RE =
  /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|::1|\[::1\]|0\.0\.0\.0|169\.254\.|metadata\.)/i;

function isBlockedWebhookUrl(rawUrl: string): boolean {
  try {
    const { protocol, hostname } = new URL(rawUrl);
    if (protocol !== 'https:' && protocol !== 'http:') return true;
    return PRIVATE_HOST_RE.test(hostname);
  } catch {
    return true;
  }
}

/** Extract the fast-path prefix from a raw API key for indexed lookup. */
function apiKeyPrefix(rawKey: string): string {
  // Use the first 16 hex chars after 'dactyl_sk_' — enough for O(1) DB lookup
  // without revealing more than 4 bytes of the key material.
  return rawKey.slice('dactyl_sk_'.length, 'dactyl_sk_'.length + 16);
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // POST /auth/register — 5 registrations/hour per IP
  app.post(
    '/auth/register',
    {
      schema: { body: RegisterBody },
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
    },
    async (request, reply) => {
      const body = request.body as {
        display_name: string;
        description?: string;
        capability_tags?: string[];
        webhook_url?: string;
      };

      // Block SSRF: reject internal/private webhook URLs
      if (body.webhook_url && isBlockedWebhookUrl(body.webhook_url)) {
        throw new DactylError(ERROR_CODES.VALIDATION_ERROR, {
          field: 'webhook_url',
          reason: 'private_url_not_allowed',
        });
      }

      // Check display_name uniqueness (index: idx_agents_display_name)
      const existing = await query<{ id: string }>(
        'SELECT id FROM agents WHERE display_name = $1',
        [body.display_name],
      );
      if (existing.length > 0) {
        throw new DactylError(ERROR_CODES.VALIDATION_ERROR, {
          field: 'display_name',
          reason: 'already_taken',
        });
      }

      const agentId = newAgentId();
      const { raw: apiKey, hash: apiKeyHash } = await generateApiKey();
      const prefix = apiKeyPrefix(apiKey);

      await query(
        `INSERT INTO agents (id, display_name, description, capability_tags, webhook_url, api_key_hash, api_key_prefix)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          agentId,
          body.display_name,
          body.description ?? '',
          body.capability_tags ?? [],
          body.webhook_url ?? null,
          apiKeyHash,
          prefix,
        ],
      );

      const token = await signToken(agentId);

      return reply.status(201).send({
        agent_id: agentId,
        api_key: apiKey,
        token,
        onboarding_complete: true,
      });
    },
  );

  // POST /auth/token — exchange API key for JWT; 10 attempts/min per IP
  // No body schema: auth is via the Authorization header, not the request body.
  app.post(
    '/auth/token',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const authHeader = request.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new DactylError(ERROR_CODES.INVALID_API_KEY, {
          reason: 'missing_bearer',
        });
      }

      const rawKey = authHeader.slice(7);
      if (!rawKey.startsWith('dactyl_sk_')) {
        throw new DactylError(ERROR_CODES.INVALID_API_KEY, {
          reason: 'bad_key_format',
        });
      }

      // Fast-path: filter by indexed prefix to at most 1 row, then verify with scrypt.
      // Falls back to full scan for legacy agents without api_key_prefix (null).
      const prefix = apiKeyPrefix(rawKey);
      let candidates = await query<{ id: string; api_key_hash: string }>(
        'SELECT id, api_key_hash FROM agents WHERE api_key_prefix = $1',
        [prefix],
      );
      if (candidates.length === 0) {
        // Legacy fallback: agents registered before migration 008 have NULL prefix.
        candidates = await query<{ id: string; api_key_hash: string }>(
          'SELECT id, api_key_hash FROM agents WHERE api_key_prefix IS NULL',
        );
      }

      let matchedAgentId: string | null = null;
      for (const agent of candidates) {
        if (verifyApiKey(rawKey, agent.api_key_hash)) {
          matchedAgentId = agent.id;
          break;
        }
      }

      if (!matchedAgentId) {
        throw new DactylError(ERROR_CODES.INVALID_API_KEY, {
          reason: 'no_match',
        });
      }

      const token = await signToken(matchedAgentId);
      return reply.send({ token, expires_in: 3600 });
    },
  );

  // DELETE /auth/token — revoke current JWT via Redis blocklist
  app.delete('/auth/token', { preHandler: authMiddleware }, async (request, reply) => {
    const authHeader = request.headers['authorization'];
    const xToken = request.headers['x-agent-token'];
    const rawToken =
      (typeof xToken === 'string' ? xToken : null) ??
      (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null);

    if (rawToken) {
      try {
        const payload = await verifyToken(rawToken);
        const remaining = Math.max(0, payload.exp - Math.floor(Date.now() / 1000));
        if (remaining > 0) {
          await redis.set(
            `dactyl:revoked:${rawToken}`,
            '1',
            'EX',
            remaining,
          );
        }
      } catch {
        // Already invalid — no-op
      }
    }

    return reply.status(204).send();
  });
}
