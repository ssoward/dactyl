import { Worker } from 'bullmq';
import { bullmqConnection } from '../redis/client.js';
import { getPool } from '../db/client.js';
import { releaseClaim } from '../redis/claim-lock.js';
import { applyKarmaEvent } from '../karma/engine.js';
import { KarmaEventType } from '../karma/events.js';
import { enqueueWebhook } from '../webhooks/queue.js';
import { newWebhookId } from '../lib/id.js';
import { WebhookEventType } from '../types.js';
import { logger } from '../lib/logger.js';
import { QUEUE_CLAIM_EXPIRY } from '../tasks/expiry.js';
import type { Task } from '../types.js';

interface ClaimExpiryJob {
  taskId: string;
}

export function createClaimExpiryWorker(): Worker {
  return new Worker<ClaimExpiryJob>(
    QUEUE_CLAIM_EXPIRY,
    async (job) => {
      const { taskId } = job.data;
      const pool = getPool();

      const result = await pool.query<Task>(
        `SELECT * FROM tasks WHERE id = $1`,
        [taskId],
      );

      const task = result.rows[0];
      if (!task) {
        logger.warn({ taskId }, 'claim-expiry: task not found, skipping');
        return;
      }

      // Only act if still claimed and the claim has expired
      if (task.status !== 'claimed') {
        logger.debug({ taskId, status: task.status }, 'claim-expiry: task no longer claimed, skipping');
        return;
      }

      const claimExpired =
        task.claim_expires_at && new Date(task.claim_expires_at) < new Date();
      if (!claimExpired) {
        logger.debug({ taskId }, 'claim-expiry: claim not yet expired, skipping');
        return;
      }

      const previousClaimant = task.claimed_by_agent_id;

      // Reset task to open
      await pool.query(
        `UPDATE tasks
         SET status = 'open',
             claimed_by_agent_id = NULL,
             claimed_at = NULL,
             claim_expires_at = NULL,
             updated_at = NOW()
         WHERE id = $1 AND status = 'claimed'`,
        [taskId],
      );

      // Release Redis lock
      await releaseClaim(taskId);

      // Apply karma penalty to agent who held the claim
      if (previousClaimant) {
        try {
          await applyKarmaEvent(
            previousClaimant,
            KarmaEventType.TASK_CLAIMED_TIMEOUT,
            taskId,
            pool,
          );
        } catch (err) {
          logger.error({ err, agentId: previousClaimant, taskId }, 'claim-expiry: karma event failed');
        }

        // Queue task.opened webhook for the previous claimant
        const deliveryId = newWebhookId();
        await pool.query(
          `INSERT INTO webhook_deliveries (id, agent_id, event_type, task_id, payload)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            deliveryId,
            previousClaimant,
            WebhookEventType.TASK_OPENED,
            taskId,
            JSON.stringify({ task_id: taskId, reason: 'claim_timeout' }),
          ],
        );

        // Fetch agent's webhook_url
        const agentResult = await pool.query<{ webhook_url: string | null }>(
          'SELECT webhook_url FROM agents WHERE id = $1',
          [previousClaimant],
        );
        const webhookUrl = agentResult.rows[0]?.webhook_url;

        if (webhookUrl) {
          await enqueueWebhook({
            webhookDeliveryId: deliveryId,
            agentId: previousClaimant,
            webhookUrl,
            eventType: WebhookEventType.TASK_OPENED,
            taskId,
            payload: { event: WebhookEventType.TASK_OPENED, task_id: taskId, reason: 'claim_timeout' },
          });
        }
      }

      logger.info({ taskId, previousClaimant }, 'claim-expiry: task reset to open');
    },
    {
      connection: bullmqConnection(),
      concurrency: 5,
      lockDuration: 30000, // 30 seconds
      stalledInterval: 120000, // 2 minutes (default is 30s)
      maxStalledCount: 1, // Reduce stalled job checks
    },
  );
}
