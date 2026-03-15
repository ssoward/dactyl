import { query } from '../db/client.js';
import { authMiddleware } from '../auth/middleware.js';
import { DactylError, ERROR_CODES } from '../lib/errors.js';
import { encodeCursor, decodeCursor } from '../lib/paginate.js';
export async function agentRoutes(app) {
    // GET /agents/me — full profile with subscribed lanes
    app.get('/agents/me', { preHandler: authMiddleware }, async (request, reply) => {
        const agentId = request.agentId;
        const rows = await query('SELECT * FROM agents WHERE id = $1', [agentId]);
        if (rows.length === 0) {
            throw new DactylError(ERROR_CODES.AGENT_NOT_FOUND, { agent_id: agentId });
        }
        const laneRows = await query('SELECT lane_slug FROM lane_subscriptions WHERE agent_id = $1 ORDER BY created_at', [agentId]);
        const agent = {
            ...rows[0],
            subscribed_lanes: laneRows.map((r) => r.lane_slug),
        };
        // Don't expose the api_key_hash
        const { api_key_hash: _, ...safeAgent } = agent;
        return reply.send(safeAgent);
    });
    // GET /agents/:id — public profile
    app.get('/agents/:id', { preHandler: authMiddleware }, async (request, reply) => {
        const { id } = request.params;
        const rows = await query(`SELECT id, display_name, description, capability_tags, karma, tier,
              tasks_completed, tasks_failed, tasks_abandoned, registered_at, last_active_at
       FROM agents WHERE id = $1`, [id]);
        if (rows.length === 0) {
            throw new DactylError(ERROR_CODES.AGENT_NOT_FOUND, { agent_id: id });
        }
        return reply.send(rows[0]);
    });
    // GET /agents — search with pagination
    app.get('/agents', { preHandler: authMiddleware }, async (request, reply) => {
        const q = request.query;
        const limit = Math.min(parseInt(q['limit'] ?? '20', 10), 100);
        const cursor = q['cursor'];
        const lane = q['lane'];
        const tier = q['tier'];
        const tag = q['capability_tag'];
        const conditions = [];
        const params = [];
        let paramIdx = 1;
        if (cursor) {
            conditions.push(`a.id > $${paramIdx++}`);
            params.push(decodeCursor(cursor));
        }
        if (tier) {
            conditions.push(`a.tier = $${paramIdx++}`);
            params.push(tier);
        }
        if (tag) {
            conditions.push(`$${paramIdx++} = ANY(a.capability_tags)`);
            params.push(tag);
        }
        let fromClause = 'FROM agents a';
        if (lane) {
            fromClause += ' JOIN lane_subscriptions ls ON ls.agent_id = a.id';
            conditions.push(`ls.lane_slug = $${paramIdx++}`);
            params.push(lane);
        }
        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        params.push(limit + 1);
        const agents = await query(`SELECT a.id, a.display_name, a.description, a.capability_tags,
              a.karma, a.tier, a.tasks_completed, a.tasks_failed,
              a.tasks_abandoned, a.registered_at, a.last_active_at
       ${fromClause} ${where}
       ORDER BY a.karma DESC, a.id
       LIMIT $${paramIdx}`, params);
        let nextCursor;
        if (agents.length > limit) {
            agents.pop();
            const last = agents[agents.length - 1];
            if (last?.id)
                nextCursor = encodeCursor(last.id);
        }
        return reply.send({ agents, next_cursor: nextCursor ?? null });
    });
}
//# sourceMappingURL=agents.js.map