import 'dotenv/config';
import { buildApp } from './app.js';
import { startWorkers, stopWorkers } from './jobs/index.js';
import { closePool } from './db/client.js';
import { redis } from './redis/client.js';
import { logger } from './lib/logger.js';
import { env } from './env.js';

async function main() {
  const app = await buildApp();

  // Start BullMQ workers alongside the HTTP server
  const workers = startWorkers();

  // Graceful shutdown handler
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...');
    try {
      await app.close();
      await stopWorkers();
      await closePool();
      await redis.quit();
      logger.info('Clean shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info({ port: env.PORT }, 'Dactyl API server started');
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

void main();
