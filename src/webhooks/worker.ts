import { Worker } from 'bullmq';
import { fetch } from 'undici';
import { bullmqConnection } from '../redis/client.js';
import { getPool } from '../db/client.js';
import { signWebhookPayload } from './hmac.js';
import { env } from '../env.js';
import { logger } from '../lib/logger.js';
import { WEBHOOK_QUEUE_NAME, type WebhookJobData } from './queue.js';

// Custom backoff schedule (ms): 1s, 5s, 30s, 300s, 1800s
const BACKOFF_DELAYS = [1_000, 5_000, 30_000, 300_000, 1_800_000];

export function createWebhookWorker(): Worker {
  return new Worker<WebhookJobData>(
    WEBHOOK_QUEUE_NAME,
    async (job) => {
      const {
        webhookDeliveryId,
        agentId,
        webhookUrl,
        payload,
      } = job.data;

      const body = JSON.stringify(payload);
      const signature = signWebhookPayload(env.WEBHOOK_SIGNING_SECRET, body);

      let delivered = false;
      let lastError: string | null = null;

      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Dactyl-Signature': signature,
            'X-Dactyl-Event': payload['event'] as string ?? 'unknown',
            'User-Agent': 'Dactyl-Webhook/1.0',
          },
          body,
          // 10 second timeout per attempt
          signal: AbortSignal.timeout(10_000),
        });

        delivered = response.status >= 200 && response.status < 300;
        if (!delivered) {
          lastError = `HTTP ${response.status}`;
        }
      } catch (err) {
        lastError = (err as Error).message;
      }

      // Update webhook_deliveries table
      const pool = getPool();
      await pool.query(
        `UPDATE webhook_deliveries
         SET status = $1,
             attempts = attempts + 1,
             last_attempt = NOW()
         WHERE id = $2`,
        [delivered ? 'delivered' : 'failed', webhookDeliveryId],
      );

      if (!delivered) {
        logger.warn(
          { webhookDeliveryId, agentId, webhookUrl, attempt: job.attemptsMade, lastError },
          'Webhook delivery failed',
        );
        throw new Error(`Delivery failed: ${lastError}`);
      }

      logger.debug(
        { webhookDeliveryId, agentId, webhookUrl },
        'Webhook delivered',
      );
    },
    {
      connection: bullmqConnection(),
      concurrency: 5, // Reduced from 10
      lockDuration: 30000,
      stalledInterval: 120000,
      maxStalledCount: 1,
      settings: {
        backoffStrategy(attemptsMade: number): number {
          // Use custom schedule; clamp to last value for excess attempts
          return BACKOFF_DELAYS[Math.min(attemptsMade, BACKOFF_DELAYS.length - 1)] ?? 1_800_000;
        },
      },
    },
  );
}
