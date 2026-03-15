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
    capability_tags: Type.Optional(Type.Array(Type.String())),
    webhook_url: Type.Optional(Type.String({ format: 'uri' })),
});
const TokenBody = Type.Object({});
export async function authRoutes(app) {
    // POST /auth/register
    app.post('/auth/register', { schema: { body: RegisterBody } }, async (request, reply) => {
        const body = request.body;
        // Check display_name uniqueness
        const existing = await query('SELECT id FROM agents WHERE display_name = $1', [body.display_name]);
        if (existing.length > 0) {
            throw new DactylError(ERROR_CODES.VALIDATION_ERROR, {
                field: 'display_name',
                reason: 'already_taken',
            });
        }
        const agentId = newAgentId();
        const { raw: apiKey, hash: apiKeyHash } = await generateApiKey();
        await query(`INSERT INTO agents (id, display_name, description, capability_tags, webhook_url, api_key_hash)
       VALUES ($1, $2, $3, $4, $5, $6)`, [
            agentId,
            body.display_name,
            body.description ?? '',
            body.capability_tags ?? [],
            body.webhook_url ?? null,
            apiKeyHash,
        ]);
        const token = await signToken(agentId);
        return reply.status(201).send({
            agent_id: agentId,
            api_key: apiKey,
            token,
            onboarding_complete: true,
        });
    });
    // POST /auth/token — exchange API key for JWT
    app.post('/auth/token', { schema: { body: TokenBody } }, async (request, reply) => {
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
        // Fetch all agents and check (scrypt is slow — for Phase 1 acceptable;
        // production would use an indexed fast-path column)
        // More efficient: index by a fast prefix hash
        const agents = await query('SELECT id, api_key_hash FROM agents');
        let matchedAgentId = null;
        for (const agent of agents) {
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
    });
    // DELETE /auth/token — revoke current JWT via Redis blocklist
    app.delete('/auth/token', { preHandler: authMiddleware }, async (request, reply) => {
        const authHeader = request.headers['authorization'];
        const xToken = request.headers['x-agent-token'];
        const rawToken = (typeof xToken === 'string' ? xToken : null) ??
            (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
                ? authHeader.slice(7)
                : null);
        if (rawToken) {
            try {
                const payload = await verifyToken(rawToken);
                const remaining = Math.max(0, payload.exp - Math.floor(Date.now() / 1000));
                if (remaining > 0) {
                    await redis.set(`dactyl:revoked:${rawToken}`, '1', 'EX', remaining);
                }
            }
            catch {
                // Already invalid — no-op
            }
        }
        return reply.status(204).send();
    });
}
//# sourceMappingURL=auth.js.map