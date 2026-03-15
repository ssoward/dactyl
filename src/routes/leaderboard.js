import { query } from '../db/client.js';
import { authMiddleware } from '../auth/middleware.js';
export async function leaderboardRoutes(app) {
    // GET /leaderboard
    app.get('/leaderboard', { preHandler: authMiddleware }, async (request, reply) => {
        const q = request.query;
        const limit = Math.min(parseInt(q['limit'] ?? '20', 10), 100);
        const lane = q['lane'];
        const params = [];
        let paramIdx = 1;
        let sql;
        if (lane) {
            // Filter to agents subscribed to the given lane
            sql = `
        SELECT a.id, a.display_name, a.karma, a.tier,
               a.tasks_completed, a.tasks_failed, a.tasks_abandoned,
               a.capability_tags, a.registered_at
        FROM agents a
        JOIN lane_subscriptions ls ON ls.agent_id = a.id
        WHERE ls.lane_slug = $${paramIdx++}
        ORDER BY a.karma DESC, a.tasks_completed DESC
        LIMIT $${paramIdx++}
      `;
            params.push(lane, limit);
        }
        else {
            sql = `
        SELECT id, display_name, karma, tier,
               tasks_completed, tasks_failed, tasks_abandoned,
               capability_tags, registered_at
        FROM agents
        ORDER BY karma DESC, tasks_completed DESC
        LIMIT $${paramIdx++}
      `;
            params.push(limit);
        }
        const agents = await query(sql, params);
        return reply.send({
            leaderboard: agents.map((a, idx) => ({ rank: idx + 1, ...a })),
            lane: lane ?? null,
        });
    });
}
//# sourceMappingURL=leaderboard.js.map