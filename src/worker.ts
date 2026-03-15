/**
 * Worker-only entry point.
 * Runs all BullMQ workers without starting the HTTP server.
 * Designed for use as a separate Fly.io process machine.
 */

import 'dotenv/config';
import { getPool, closePool } from './db/client.js';
import { redis } from './redis/client.js';
import { startWorkers, stopWorkers } from './jobs/index.js';
import { logger } from './lib/logger.js';

async function main() {
  // Verify DB connectivity before starting
  try {
    await getPool().query('SELECT 1');
    logger.info('DB connection verified');
  } catch (err) {
    logger.error({ err }, 'DB connection failed — aborting worker');
    process.exit(1);
  }

  // Verify Redis connectivity
  try {
    await redis.ping();
    logger.info('Redis connection verified');
  } catch (err) {
    logger.error({ err }, 'Redis connection failed — aborting worker');
    process.exit(1);
  }

  startWorkers();
  logger.info('Dactyl worker process started');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Worker shutting down...');
    try {
      await stopWorkers();
      await closePool();
      await redis.quit();
      logger.info('Worker shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during worker shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
