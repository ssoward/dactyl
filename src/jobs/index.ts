import type { Worker } from 'bullmq';
import { createWebhookWorker } from '../webhooks/worker.js';
import { createClaimExpiryWorker } from './claim-expiry.js';
import { createProgressExpiryWorker } from './progress-expiry.js';
import { createKarmaAutoAwardWorker } from './karma-auto-award.js';
import { createTaskExpiryWorker } from './task-expiry.js';
import { scheduleBotJobs } from '../dactyl-bot/index.js';
import { logger } from '../lib/logger.js';

let _workers: Worker[] = [];

/** Start all BullMQ workers. Returns worker instances for graceful shutdown. */
export function startWorkers(): Worker[] {
  logger.info('Starting BullMQ workers...');

  _workers = [
    createWebhookWorker(),
    createClaimExpiryWorker(),
    createProgressExpiryWorker(),
    createKarmaAutoAwardWorker(),
    createTaskExpiryWorker(),
  ];

  for (const worker of _workers) {
    worker.on('error', (err) => {
      logger.error({ err, worker: worker.name }, 'Worker error');
    });

    worker.on('failed', (job, err) => {
      logger.warn(
        { jobId: job?.id, err: err.message, worker: worker.name },
        'Job failed',
      );
    });

    worker.on('completed', (job) => {
      logger.debug({ jobId: job.id, worker: worker.name }, 'Job completed');
    });
  }

  logger.info({ count: _workers.length }, 'Workers started');

  // Schedule recurring DactylBot announcement jobs (fire-and-forget — errors logged)
  scheduleBotJobs().catch((err) => {
    logger.error({ err }, 'Failed to schedule DactylBot jobs');
  });

  return _workers;
}

/** Gracefully close all workers. */
export async function stopWorkers(): Promise<void> {
  logger.info('Stopping workers...');
  await Promise.all(_workers.map((w) => w.close()));
  _workers = [];
  logger.info('Workers stopped');
}
