import { Worker } from 'bullmq';
import { bullmqConnection } from '../redis/client.js';
import { getPool } from '../db/client.js';
import { applyKarmaEvent } from '../karma/engine.js';
import { KarmaEventType } from '../karma/events.js';
import { enqueueWebhook } from '../webhooks/queue.js';
import { newWebhookId } from '../lib/id.js';
import { WebhookEventType } from '../types.js';
import { logger } from '../lib/logger.js';
import { QUEUE_PROGRESS_EXPIRY } from '../tasks/expiry.js';
import type { Task } from '../types.js';

interface ProgressExpiryJob {
  taskId: string;
  agentId: string;
}

export function createProgressExpiryWorker(): Worker {
  return new Worker<ProgressExpiryJob>(
    QUEUE_PROGRESS_EXPIRY,
    async (job) => {
      const { taskId, agentId } = job.data;
      const pool = getPool();

      const result = await pool.query<Task>(
        'SELECT * FROM tasks WHERE id = $1',
        [taskId],
      );

      const task = result.rows[0];
      if (!task) {
        logger.warn({ taskId }, 'progress-expiry: task not found');
        return;
      }

      if (task.status !== 'in_progress') {
        logger.debug({ taskId, status: task.status }, 'progress-expiry: task not in_progress, skipping');
        return;
      }

      const deadlinePassed =
        task.progress_deadline_at && new Date(task.progress_deadline_at) < new Date();
      if (!deadlinePassed) {
        logger.debug({ taskId }, 'progress-expiry: deadline not yet passed');
        return;
      }

      // Mark task as failed
      await pool.query(
        `UPDATE tasks
         SET status = 'failed',
             updated_at = NOW()
         WHERE id = $1 AND status = 'in_progress'`,
        [taskId],
      );

      // Increment agent.tasks_failed
      await pool.query(
        'UPDATE agents SET tasks_failed = tasks_failed + 1 WHERE id = $1',
        [agentId],
      );

      // Apply karma penalty
      try {
        await applyKarmaEvent(
          agentId,
          KarmaEventType.TASK_PROGRESS_TIMEOUT,
          taskId,
          pool,
        );
      } catch (err) {
        logger.error({ err, agentId, taskId }, 'progress-expiry: karma event failed');
      }

      // Queue task.failed webhook
      const deliveryId = newWebhookId();
      await pool.query(
        `INSERT INTO webhook_deliveries (id, agent_id, event_type, task_id, payload)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          deliveryId,
          agentId,
          WebhookEventType.TASK_FAILED,
          taskId,
          JSON.stringify({ task_id: taskId, reason: 'progress_timeout' }),
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
          eventType: WebhookEventType.TASK_FAILED,
          taskId,
          payload: {
            event: WebhookEventType.TASK_FAILED,
            task_id: taskId,
            reason: 'progress_timeout',
          },
        });
      }

      logger.info({ taskId, agentId }, 'progress-expiry: task marked failed');
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
