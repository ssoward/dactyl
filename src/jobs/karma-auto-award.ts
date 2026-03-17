import { Worker } from 'bullmq';
import { bullmqConnection } from '../redis/client.js';
import { getPool } from '../db/client.js';
import { applyKarmaEvent } from '../karma/engine.js';
import { KarmaEventType } from '../karma/events.js';
import { checkAndAwardStreak } from '../karma/streak.js';
import { enqueueWebhook } from '../webhooks/queue.js';
import { newWebhookId } from '../lib/id.js';
import { WebhookEventType } from '../types.js';
import { logger } from '../lib/logger.js';
import { QUEUE_KARMA_AUTO_AWARD } from '../tasks/expiry.js';
import type { Task } from '../types.js';

interface KarmaAutoAwardJob {
  taskId: string;
  agentId: string;
}

export function createKarmaAutoAwardWorker(): Worker {
  return new Worker<KarmaAutoAwardJob>(
    QUEUE_KARMA_AUTO_AWARD,
    async (job) => {
      const { taskId, agentId } = job.data;
      const pool = getPool();

      const result = await pool.query<Task>(
        'SELECT * FROM tasks WHERE id = $1',
        [taskId],
      );

      const task = result.rows[0];
      if (!task) {
        logger.warn({ taskId }, 'karma-auto-award: task not found');
        return;
      }

      // Only award if completed and no vote was cast
      if (task.status !== 'completed' || task.vote !== null) {
        logger.debug(
          { taskId, status: task.status, vote: task.vote },
          'karma-auto-award: skipping (already voted or not completed)',
        );
        return;
      }

      // Award no-vote karma
      const { newKarma } = await applyKarmaEvent(
        agentId,
        KarmaEventType.TASK_COMPLETED_NO_VOTE,
        taskId,
        pool,
      );

      // Mark karma as awarded on the task
      await pool.query(
        'UPDATE tasks SET karma_awarded = $1, updated_at = NOW() WHERE id = $2',
        [3, taskId],
      );

      // Check for streak bonus
      await checkAndAwardStreak(agentId, pool);

      // Queue karma.updated webhook
      const deliveryId = newWebhookId();
      const webhookPayload = {
        event: WebhookEventType.KARMA_UPDATED,
        task_id: taskId,
        agent_id: agentId,
        delta: 3,
        new_karma: newKarma,
        reason: 'auto_award_no_vote',
      };

      await pool.query(
        `INSERT INTO webhook_deliveries (id, agent_id, event_type, task_id, payload)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          deliveryId,
          agentId,
          WebhookEventType.KARMA_UPDATED,
          taskId,
          JSON.stringify(webhookPayload),
        ],
      );

      const agentResult = await pool.query<{ webhook_url: string | null }>(
        'SELECT webhook_url FROM agents WHERE id = $1',
        [agentId],
      );
      const webhookUrl = agentResult.rows[0]?.webhook_url;

      if (webhookUrl) {
        await enqueueWebhook({
          webhookDeliveryId: deliveryId,
          agentId,
          webhookUrl,
          eventType: WebhookEventType.KARMA_UPDATED,
          taskId,
          payload: webhookPayload,
        });
      }

      logger.info({ taskId, agentId, newKarma }, 'karma-auto-award: no-vote karma awarded');
    },
    {
      connection: bullmqConnection(),
      concurrency: 5,
      lockDuration: 30000,
      stalledInterval: 120000,
      maxStalledCount: 1,
    },
  );
}
