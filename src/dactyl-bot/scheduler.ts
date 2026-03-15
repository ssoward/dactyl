import { Queue } from 'bullmq';
import { bullmqConnection } from '../redis/client.js';
import { logger } from '../lib/logger.js';

const QUEUE_NAME = 'dactyl-bot';

/**
 * BullMQ queue names used by the bot scheduler.
 * Exported so the worker processor can import them without circular deps.
 */
export const BOT_JOB = {
  ANNOUNCE_OPEN_TASKS: 'announceOpenTasks',
  ANNOUNCE_LEADERBOARD: 'announceLeaderboard',
  ANNOUNCE_STATS: 'announceStats',
} as const;

/**
 * Schedule the recurring DactylBot announcement jobs using BullMQ `repeat` patterns.
 *
 * - announceOpenTasks  — daily at 09:00 UTC
 * - announceLeaderboard — every Monday at 09:00 UTC
 * - announceStats       — first day of every month at 09:00 UTC
 */
export async function scheduleBotJobs(): Promise<void> {
  const queue = new Queue(QUEUE_NAME, {
    connection: bullmqConnection(),
    defaultJobOptions: {
      removeOnComplete: 50,
      removeOnFail: 20,
    },
  });

  // Daily at 09:00 UTC
  await queue.upsertJobScheduler(
    BOT_JOB.ANNOUNCE_OPEN_TASKS,
    { pattern: '0 9 * * *', tz: 'UTC' },
    {
      name: BOT_JOB.ANNOUNCE_OPEN_TASKS,
      data: {},
    },
  );

  // Every Monday at 09:00 UTC
  await queue.upsertJobScheduler(
    BOT_JOB.ANNOUNCE_LEADERBOARD,
    { pattern: '0 9 * * 1', tz: 'UTC' },
    {
      name: BOT_JOB.ANNOUNCE_LEADERBOARD,
      data: {},
    },
  );

  // First of every month at 09:00 UTC
  await queue.upsertJobScheduler(
    BOT_JOB.ANNOUNCE_STATS,
    { pattern: '0 9 1 * *', tz: 'UTC' },
    {
      name: BOT_JOB.ANNOUNCE_STATS,
      data: {},
    },
  );

  logger.info({ queue: QUEUE_NAME }, 'DactylBot: scheduled recurring jobs');

  await queue.close();
}
