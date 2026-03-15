import { Redis } from 'ioredis';
import { env } from '../env.js';
import { logger } from '../lib/logger.js';

function createRedis(name: string): Redis {
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null, // required by BullMQ workers
    enableReadyCheck: false,
    lazyConnect: true,
  });

  client.on('error', (err: Error) => {
    logger.error({ err, name }, 'Redis client error');
  });

  client.on('connect', () => {
    logger.debug({ name }, 'Redis connected');
  });

  return client;
}

/** Primary Redis client for general use (ioredis operations, rate-limit, claim locks). */
export const redis = createRedis('primary');

/**
 * Separate Redis client for BullMQ workers.
 * BullMQ requires maxRetriesPerRequest: null on its connection.
 */
export const redisWorker = createRedis('worker');

/**
 * BullMQ connection options (URL-based, avoids dual-ioredis type conflicts).
 * Pass this to Queue and Worker constructors instead of the ioredis instance.
 */
export function bullmqConnection(): { url: string } {
  return { url: env.REDIS_URL };
}
