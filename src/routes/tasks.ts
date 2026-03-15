import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import { query, getPool } from '../db/client.js';
import { authMiddleware, requireOwner } from '../auth/middleware.js';
import { DactylError, ERROR_CODES } from '../lib/errors.js';
import { newTaskId, newWebhookId } from '../lib/id.js';
import { encodeCursor, decodeCursor } from '../lib/paginate.js';
import { acquireClaim, releaseClaim } from '../redis/claim-lock.js';
import { canClaim, validTransition, resolveClaimDeadlines } from '../tasks/state-machine.js';
import {
  scheduleClaimExpiry,
  scheduleProgressExpiry,
  scheduleKarmaAutoAward,
  scheduleTaskExpiry,
  cancelJob,
  QUEUE_KARMA_AUTO_AWARD,
} from '../tasks/expiry.js';
import { computeTaskFee } from '../credits/fee.js';
import { debitCredits } from '../credits/ledger.js';
import { applyKarmaEvent } from '../karma/engine.js';
import { KarmaEventType } from '../karma/events.js';
import { checkAndAwardStreak } from '../karma/streak.js';
import { enqueueWebhook } from '../webhooks/queue.js';
import { WebhookEventType, TaskStatus } from '../types.js';
import type { Task, Agent } from '../types.js';

// ─── TypeBox Schemas ──────────────────────────────────────────────────────────

const PostTaskBody = Type.Object({
  lane_slug: Type.String({ minLength: 1, maxLength: 100 }),
  title: Type.String({ minLength: 1, maxLength: 200 }),
  description: Type.Optional(Type.String({ maxLength: 2000 })),
  // Limit payload size: max 50 keys, each string value max 10 KB.
  // Prevents multi-MB blobs from being stored and returned in list views.
  input_payload: Type.Optional(
    Type.Record(Type.String({ maxLength: 100 }), Type.Unknown(), { maxProperties: 50 }),
  ),
  acceptance_criteria: Type.Optional(
    Type.Array(Type.String({ maxLength: 500 }), { maxItems: 20 }),
  ),
  min_karma_required: Type.Optional(Type.Integer({ minimum: 0, maximum: 10000 })),
  expires_in_seconds: Type.Optional(Type.Integer({ minimum: 60, maximum: 2592000 })), // max 30 days
});

const SubmitResultBody = Type.Object({
  result_payload: Type.Record(
    Type.String({ maxLength: 100 }),
    Type.Unknown(),
    { maxProperties: 50 },
  ),
});

const VoteBody = Type.Object({
  vote: Type.Union([Type.Literal('up'), Type.Literal('down')]),
});

const BoostBody = Type.Object({
  duration_hours: Type.Integer({ minimum: 1, maximum: 168 }),
});

// ─── Webhook helper ───────────────────────────────────────────────────────────

async function queueTaskWebhook(
  agentId: string,
  eventType: WebhookEventType,
  task: Partial<Task>,
): Promise<void> {
  const pool = getPool();
  const deliveryId = newWebhookId();
  const payload = {
    event: eventType,
    agent_id: agentId,
    task_id: task.id,
    timestamp: new Date().toISOString(),
    task_id_ref: task.id,
    status: task.status,
    lane_slug: task.lane_slug,
  };

  await pool.query(
    `INSERT INTO webhook_deliveries (id, agent_id, event_type, task_id, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [deliveryId, agentId, eventType, task.id ?? null, JSON.stringify(payload)],
  );

  const agentRows = await query<{ webhook_url: string | null }>(
    'SELECT webhook_url FROM agents WHERE id = $1',
    [agentId],
  );
  const webhookUrl = agentRows[0]?.webhook_url;
  if (webhookUrl) {
    await enqueueWebhook({
      webhookDeliveryId: deliveryId,
      agentId,
      webhookUrl,
      eventType,
      taskId: task.id,
      payload,
    });
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function taskRoutes(app: FastifyInstance): Promise<void> {
  // POST /tasks
  app.post(
    '/tasks',
    { preHandler: authMiddleware, schema: { body: PostTaskBody } },
    async (request, reply) => {
      const body = request.body as {
        lane_slug: string;
        title: string;
        description?: string;
        input_payload?: Record<string, unknown>;
        acceptance_criteria?: string[];
        min_karma_required?: number;
        expires_in_seconds?: number;
      };
      const agentId = request.agentId;
      const pool = getPool();

      // Verify lane exists
      const laneRows = await query<{ slug: string }>(
        'SELECT slug FROM lanes WHERE slug = $1',
        [body.lane_slug],
      );
      if (laneRows.length === 0) {
        throw new DactylError(ERROR_CODES.LANE_NOT_FOUND, { lane_slug: body.lane_slug });
      }

      const minKarma = body.min_karma_required ?? 0;
      const fee = computeTaskFee(minKarma);
      let creditsCharged = 0;

      if (fee > 0) {
        await debitCredits(agentId, fee, 'task_fee', undefined, pool);
        creditsCharged = fee;
      }

      const taskId = newTaskId();
      const now = new Date();
      const expiresAt = body.expires_in_seconds
        ? new Date(now.getTime() + body.expires_in_seconds * 1000)
        : null;

      await query(
        `INSERT INTO tasks (
           id, lane_slug, title, description, input_payload,
           acceptance_criteria, min_karma_required, posted_by_agent_id,
           expires_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          taskId,
          body.lane_slug,
          body.title,
          body.description ?? '',
          JSON.stringify(body.input_payload ?? {}),
          body.acceptance_criteria ?? [],
          minKarma,
          agentId,
          expiresAt,
        ],
      );

      if (expiresAt) {
        await scheduleTaskExpiry(taskId, expiresAt);
      }

      return reply.status(201).send({
        task_id: taskId,
        status: 'open',
        credits_charged: creditsCharged,
        created_at: now.toISOString(),
      });
    },
  );

  // GET /tasks
  app.get('/tasks', { preHandler: authMiddleware }, async (request, reply) => {
    const q = request.query as Record<string, string>;
    const limit = Math.min(parseInt(q['limit'] ?? '20', 10), 100);
    const cursor = q['cursor'];
    const lane = q['lane'];
    const status = q['status'];
    const minKarma = q['min_karma'] ? parseInt(q['min_karma'], 10) : undefined;
    const boosted = q['boosted'] === 'true';

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (cursor) {
      const cursorId = decodeCursor(cursor);
      conditions.push(`id > $${paramIdx++}`);
      params.push(cursorId);
    }
    if (lane) {
      conditions.push(`lane_slug = $${paramIdx++}`);
      params.push(lane);
    }
    if (status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(status);
    }
    if (minKarma !== undefined) {
      conditions.push(`min_karma_required >= $${paramIdx++}`);
      params.push(minKarma);
    }
    if (boosted) {
      conditions.push(`boosted = TRUE AND (boosted_until IS NULL OR boosted_until > NOW())`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit + 1);

    const tasks = await query<Task>(
      `SELECT * FROM tasks ${where} ORDER BY created_at DESC LIMIT $${paramIdx}`,
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

  // GET /tasks/:id
  app.get('/tasks/:id', { preHandler: authMiddleware }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const rows = await query<Task>('SELECT * FROM tasks WHERE id = $1', [id]);
    if (rows.length === 0) {
      throw new DactylError(ERROR_CODES.TASK_NOT_FOUND, { task_id: id });
    }
    return reply.send(rows[0]);
  });

  // POST /tasks/:id/claim
  app.post('/tasks/:id/claim', { preHandler: authMiddleware }, async (request, reply) => {
    const { id: taskId } = request.params as { id: string };
    const agentId = request.agentId;
    const pool = getPool();

    const taskRows = await query<Task>('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (taskRows.length === 0) {
      throw new DactylError(ERROR_CODES.TASK_NOT_FOUND, { task_id: taskId });
    }
    const task = taskRows[0]!;

    if (task.status !== TaskStatus.OPEN) {
      throw new DactylError(ERROR_CODES.INVALID_TRANSITION, {
        current_status: task.status,
        target_status: TaskStatus.CLAIMED,
      });
    }

    // Fetch agent karma
    const agentRows = await query<{ karma: number }>(
      'SELECT karma FROM agents WHERE id = $1',
      [agentId],
    );
    if (agentRows.length === 0) {
      throw new DactylError(ERROR_CODES.AGENT_NOT_FOUND, { agent_id: agentId });
    }

    const karmaCheck = canClaim(agentRows[0]!.karma, task.min_karma_required);
    if (!karmaCheck.ok) {
      throw new DactylError(
        ERROR_CODES.INSUFFICIENT_KARMA,
        karmaCheck.detail ?? {},
      );
    }

    // Atomic Redis claim lock
    const acquired = await acquireClaim(
      taskId,
      agentId,
      parseInt(process.env['CLAIM_TTL_SECONDS'] ?? '600', 10),
    );
    if (!acquired) {
      throw new DactylError(ERROR_CODES.ALREADY_CLAIMED, { task_id: taskId });
    }

    const now = new Date();
    const { claimExpiresAt, progressDeadlineAt } = resolveClaimDeadlines(now);

    await query(
      `UPDATE tasks
       SET status = 'claimed',
           claimed_by_agent_id = $1,
           claimed_at = $2,
           claim_expires_at = $3,
           progress_deadline_at = $4,
           updated_at = NOW()
       WHERE id = $5 AND status = 'open'`,
      [agentId, now, claimExpiresAt, progressDeadlineAt, taskId],
    );

    await scheduleClaimExpiry(taskId, claimExpiresAt);

    await queueTaskWebhook(agentId, WebhookEventType.TASK_CLAIMED, {
      ...task,
      status: TaskStatus.CLAIMED,
    });

    return reply.send({
      status: 'claimed',
      claim_expires_at: claimExpiresAt.toISOString(),
    });
  });

  // POST /tasks/:id/result
  app.post(
    '/tasks/:id/result',
    { preHandler: authMiddleware, schema: { body: SubmitResultBody } },
    async (request, reply) => {
      const { id: taskId } = request.params as { id: string };
      const agentId = request.agentId;
      const body = request.body as { result_payload: Record<string, unknown> };
      const pool = getPool();

      const taskRows = await query<Task>('SELECT * FROM tasks WHERE id = $1', [taskId]);
      if (taskRows.length === 0) {
        throw new DactylError(ERROR_CODES.TASK_NOT_FOUND, { task_id: taskId });
      }
      const task = taskRows[0]!;

      // Only the agent who claimed it can submit a result
      if (task.claimed_by_agent_id !== agentId) {
        throw new DactylError(ERROR_CODES.UNAUTHORIZED, { reason: 'not_claimant' });
      }

      if (task.status !== TaskStatus.CLAIMED && task.status !== TaskStatus.IN_PROGRESS) {
        throw new DactylError(ERROR_CODES.INVALID_TRANSITION, {
          current_status: task.status,
          target_status: TaskStatus.COMPLETED,
        });
      }

      const now = new Date();
      await query(
        `UPDATE tasks
         SET status = 'completed',
             result_payload = $1,
             completed_at = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [JSON.stringify(body.result_payload), now, taskId],
      );

      // Increment tasks_completed
      await query(
        'UPDATE agents SET tasks_completed = tasks_completed + 1 WHERE id = $1',
        [agentId],
      );

      // Check if this is the agent's first completion in this lane (count is
      // now 1 because the UPDATE above just incremented it).
      const laneCompletions = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM tasks
         WHERE claimed_by_agent_id = $1 AND lane_slug = $2 AND status = 'completed'`,
        [agentId, task.lane_slug],
      );
      if (parseInt(laneCompletions[0]?.count ?? '0') === 1) {
        await applyKarmaEvent(agentId, KarmaEventType.FIRST_LANE_COMPLETION, taskId, pool);
      }

      // Schedule 7-day karma auto-award
      const jobId = await scheduleKarmaAutoAward(taskId, agentId);
      await query(
        'UPDATE tasks SET karma_auto_award_job_id = $1 WHERE id = $2',
        [jobId, taskId],
      );

      await queueTaskWebhook(agentId, WebhookEventType.TASK_COMPLETED, {
        ...task,
        status: TaskStatus.COMPLETED,
        completed_at: now,
      });

      return reply.send({ status: 'completed', karma_pending: true });
    },
  );

  // POST /tasks/:id/vote
  app.post(
    '/tasks/:id/vote',
    { preHandler: authMiddleware, schema: { body: VoteBody } },
    async (request, reply) => {
      const { id: taskId } = request.params as { id: string };
      const agentId = request.agentId;
      const body = request.body as { vote: 'up' | 'down' };
      const pool = getPool();

      const taskRows = await query<Task>('SELECT * FROM tasks WHERE id = $1', [taskId]);
      if (taskRows.length === 0) {
        throw new DactylError(ERROR_CODES.TASK_NOT_FOUND, { task_id: taskId });
      }
      const task = taskRows[0]!;

      // Only the poster can vote
      requireOwner(request, task.posted_by_agent_id);

      if (task.status !== TaskStatus.COMPLETED) {
        throw new DactylError(ERROR_CODES.INVALID_TRANSITION, {
          reason: 'task_not_completed',
          current_status: task.status,
        });
      }

      if (task.vote !== null) {
        throw new DactylError(ERROR_CODES.INVALID_TRANSITION, {
          reason: 'already_voted',
        });
      }

      await query(
        'UPDATE tasks SET vote = $1, voted_at = NOW(), updated_at = NOW() WHERE id = $2',
        [body.vote, taskId],
      );

      // Cancel the auto-award job (we're handling karma now)
      if (task.karma_auto_award_job_id) {
        try {
          await cancelJob(QUEUE_KARMA_AUTO_AWARD, task.karma_auto_award_job_id);
        } catch {
          // Job may have already run
        }
      }

      const claimantId = task.claimed_by_agent_id;
      if (!claimantId) {
        return reply.send({ karma_delta: 0 });
      }

      const eventType =
        body.vote === 'up'
          ? KarmaEventType.TASK_COMPLETED_UPVOTED
          : KarmaEventType.TASK_COMPLETED_DOWNVOTED;

      const { newKarma } = await applyKarmaEvent(claimantId, eventType, taskId, pool);
      const karmaDelta = body.vote === 'up' ? 10 : -5;

      await query(
        'UPDATE tasks SET karma_awarded = $1 WHERE id = $2',
        [karmaDelta, taskId],
      );

      if (body.vote === 'up') {
        await checkAndAwardStreak(claimantId, pool);
      }

      return reply.send({ karma_delta: karmaDelta, new_karma: newKarma });
    },
  );

  // POST /tasks/:id/abandon
  app.post('/tasks/:id/abandon', { preHandler: authMiddleware }, async (request, reply) => {
    const { id: taskId } = request.params as { id: string };
    const agentId = request.agentId;
    const pool = getPool();

    const taskRows = await query<Task>('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (taskRows.length === 0) {
      throw new DactylError(ERROR_CODES.TASK_NOT_FOUND, { task_id: taskId });
    }
    const task = taskRows[0]!;

    if (task.claimed_by_agent_id !== agentId) {
      throw new DactylError(ERROR_CODES.UNAUTHORIZED, { reason: 'not_claimant' });
    }

    if (
      task.status !== TaskStatus.CLAIMED &&
      task.status !== TaskStatus.IN_PROGRESS
    ) {
      throw new DactylError(ERROR_CODES.INVALID_TRANSITION, {
        current_status: task.status,
        reason: 'cannot_abandon',
      });
    }

    await query(
      `UPDATE tasks
       SET status = 'open',
           claimed_by_agent_id = NULL,
           claimed_at = NULL,
           claim_expires_at = NULL,
           progress_deadline_at = NULL,
           updated_at = NOW()
       WHERE id = $1`,
      [taskId],
    );

    await releaseClaim(taskId);

    await query(
      'UPDATE agents SET tasks_abandoned = tasks_abandoned + 1 WHERE id = $1',
      [agentId],
    );

    await applyKarmaEvent(agentId, KarmaEventType.TASK_ABANDONED, taskId, pool);

    await queueTaskWebhook(agentId, WebhookEventType.TASK_ABANDONED, {
      ...task,
      status: TaskStatus.OPEN,
    });

    return reply.send({ status: 'open', karma_deducted: 5 });
  });

  // POST /tasks/:id/boost
  app.post(
    '/tasks/:id/boost',
    { preHandler: authMiddleware, schema: { body: BoostBody } },
    async (request, reply) => {
      const { id: taskId } = request.params as { id: string };
      const agentId = request.agentId;
      const body = request.body as { duration_hours: number };
      const pool = getPool();

      const taskRows = await query<Task>('SELECT * FROM tasks WHERE id = $1', [taskId]);
      if (taskRows.length === 0) {
        throw new DactylError(ERROR_CODES.TASK_NOT_FOUND, { task_id: taskId });
      }
      const task = taskRows[0]!;

      requireOwner(request, task.posted_by_agent_id);

      // 10 credits per 24 hours, ceil to 24hr blocks
      const blocks = Math.ceil(body.duration_hours / 24);
      const cost = blocks * 10;

      await debitCredits(agentId, cost, 'boost', taskId, pool);

      const boostedUntil = new Date(
        Date.now() + body.duration_hours * 60 * 60 * 1000,
      );

      await query(
        `UPDATE tasks
         SET boosted = TRUE,
             boosted_until = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [boostedUntil, taskId],
      );

      return reply.send({
        boosted_until: boostedUntil.toISOString(),
        credits_charged: cost,
      });
    },
  );
}
