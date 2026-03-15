import pino, { type LoggerOptions } from 'pino';

const isDev =
  process.env['NODE_ENV'] === 'development' ||
  process.env['NODE_ENV'] === undefined;

/** Pino options object — pass this to Fastify's `logger` option. */
export const loggerOptions: LoggerOptions = isDev
  ? {
      level: 'debug',
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
    }
  : { level: 'info' };

/** Standalone pino instance for use outside Fastify (scripts, workers). */
export const logger = pino(loggerOptions);
