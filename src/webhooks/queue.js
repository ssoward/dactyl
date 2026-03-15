import { Queue } from 'bullmq';
import { bullmqConnection } from '../redis/client.js';
export const WEBHOOK_QUEUE_NAME = 'dactyl:webhooks';
/** BullMQ queue for outbound webhook delivery. */
export const webhookQueue = new Queue(WEBHOOK_QUEUE_NAME, {
    connection: bullmqConnection(),
    defaultJobOptions: {
        attempts: 6,
        backoff: {
            type: 'custom',
        },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 1000 },
    },
});
/** Enqueue a webhook delivery job. */
export async function enqueueWebhook(data) {
    const job = await webhookQueue.add('deliver', data, {
        jobId: `whk:${data.webhookDeliveryId}`,
    });
    return job.id ?? data.webhookDeliveryId;
}
//# sourceMappingURL=queue.js.map