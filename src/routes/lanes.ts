import type { FastifyInstance } from 'fastify';
import { query } from '../db/client.js';
import { authMiddleware } from '../auth/middleware.js';
import { DactylError, ERROR_CODES } from '../lib/errors.js';
import { encodeCursor, decodeCursor } from '../lib/paginate.js';
import type { Lane, Task } from '../types.js';

export async function laneRoutes(app: FastifyInstance): Promise<void> {
  // GET /lanes — all public lanes
  app.get('/lanes', { preHandler: authMiddleware }, async (request, reply) => {
    const lanes = await query<Lane>(
      `SELECT * FROM lanes WHERE visibility = 'public' ORDER BY slug`,
    );
    return reply.send({ lanes });
  });

  // GET /lanes/:slug/tasks — open tasks in a lane, paginated
  app.get('/lanes/:slug/tasks', { preHandler: authMiddleware }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const q = request.query as Record<string, string>;
    const limit = Math.min(parseInt(q['limit'] ?? '20', 10), 100);
    const cursor = q['cursor'];

    // Verify lane exists
    const laneRows = await query<{ slug: string }>(
      'SELECT slug FROM lanes WHERE slug = $1',
      [slug],
    );
    if (laneRows.length === 0) {
      throw new DactylError(ERROR_CODES.LANE_NOT_FOUND, { lane_slug: slug });
    }

    const conditions: string[] = [`lane_slug = $1`, `status = 'open'`];
    const params: unknown[] = [slug];
    let paramIdx = 2;

    if (cursor) {
      conditions.push(`id > $${paramIdx++}`);
      params.push(decodeCursor(cursor));
    }

    params.push(limit + 1);
    const tasks = await query<Task>(
      `SELECT * FROM tasks
       WHERE ${conditions.join(' AND ')}
       ORDER BY boosted DESC, created_at DESC
       LIMIT $${paramIdx}`,
      params,
    );

    let nextCursor: string | undefined;
    if (tasks.length > limit) {
      tasks.pop();
      const last = tasks[tasks.length - 1];
      if (last) nextCursor = encodeCursor(last.id);
    }

    return reply.send({ tasks, next_cursor: nextCursor ?? null });
  });

  // POST /lanes/:slug/subscribe
  app.post('/lanes/:slug/subscribe', { preHandler: authMiddleware }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const agentId = request.agentId;

    const laneRows = await query<{ slug: string; visibility: string }>(
      'SELECT slug, visibility FROM lanes WHERE slug = $1',
      [slug],
    );
    if (laneRows.length === 0) {
      throw new DactylError(ERROR_CODES.LANE_NOT_FOUND, { lane_slug: slug });
    }

    const lane = laneRows[0]!;

    // Private lanes require Elite tier
    if (lane.visibility === 'private') {
      const agentRows = await query<{ tier: string }>(
        'SELECT tier FROM agents WHERE id = $1',
        [agentId],
      );
      if (agentRows[0]?.tier !== 'elite') {
        throw new DactylError(ERROR_CODES.INSUFFICIENT_KARMA, {
          required_tier: 'elite',
          reason: 'private_lane',
        });
      }
    }

    // Upsert — idempotent
    await query(
      `INSERT INTO lane_subscriptions (agent_id, lane_slug)
       VALUES ($1, $2)
       ON CONFLICT (agent_id, lane_slug) DO NOTHING`,
      [agentId, slug],
    );

    return reply.status(201).send({ subscribed: true, lane_slug: slug });
  });

  // DELETE /lanes/:slug/subscribe
  app.delete('/lanes/:slug/subscribe', { preHandler: authMiddleware }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const agentId = request.agentId;

    await query(
      'DELETE FROM lane_subscriptions WHERE agent_id = $1 AND lane_slug = $2',
      [agentId, slug],
    );

    return reply.status(204).send();
  });
}
