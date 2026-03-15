import { Worker } from 'bullmq';
import { bullmqConnection } from '../redis/client.js';
import { getPool } from '../db/client.js';
import { enqueueWebhook } from '../webhooks/queue.js';
import { newWebhookId } from '../lib/id.js';
import { WebhookEventType } from '../types.js';
import { logger } from '../lib/logger.js';
import { QUEUE_TASK_EXPIRY } from '../tasks/expiry.js';
import type { Task } from '../types.js';

interface TaskExpiryJob {
  taskId: string;
}

export function createTaskExpiryWorker(): Worker {
  return new Worker<TaskExpiryJob>(
    QUEUE_TASK_EXPIRY,
    async (job) => {
      const { taskId } = job.data;
      const pool = getPool();

      const result = await pool.query<Task>(
        'SELECT * FROM tasks WHERE id = $1',
        [taskId],
      );

      const task = result.rows[0];
      if (!task) {
        logger.warn({ taskId }, 'task-expiry: task not found');
        return;
      }

      if (task.status !== 'open') {
        logger.debug({ taskId, status: task.status }, 'task-expiry: not open, skipping');
        return;
      }

      const nowExpired =
        task.expires_at && new Date(task.expires_at) < new Date();
      if (!nowExpired) {
        logger.debug({ taskId }, 'task-expiry: not yet expired');
        return;
      }

      await pool.query(
        `UPDATE tasks SET status = 'expired', updated_at = NOW()
         WHERE id = $1 AND status = 'open'`,
        [taskId],
      );

      // Notify the poster
      const posterId = task.posted_by_agent_id;
      const deliveryId = newWebhookId();
      const webhookPayload = {
        event: WebhookEventType.TASK_EXPIRED,
        task_id: taskId,
        agent_id: posterId,
      };

      await pool.query(
        `INSERT INTO webhook_deliveries (id, agent_id, event_type, task_id, payload)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          deliveryId,
          posterId,
          WebhookEventType.TASK_EXPIRED,
          taskId,
          JSON.stringify(webhookPayload),
        ],
      );

      const agentResult = await pool.query<{ webhook_url: string | null }>(
        'SELECT webhook_url FROM agents WHERE id = $1',
        [posterId],
      );
      const webhookUrl = agentResult.rows[0]?.webhook_url;

      if (webhookUrl) {
        await enqueueWebhook({
          webhookDeliveryId: deliveryId,
          agentId: posterId,
          webhookUrl,
          eventType: WebhookEventType.TASK_EXPIRED,
          taskId,
          payload: webhookPayload,
        });
      }

      logger.info({ taskId }, 'task-expiry: task expired');
    },
    {
      connection: bullmqConnection(),
      concurrency: 5,
    },
  );
}
