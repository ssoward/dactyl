import pg from 'pg';
import { env } from '../env.js';
import { logger } from '../lib/logger.js';

const { Pool } = pg;

// Singleton pg pool
let _pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    _pool.on('error', (err) => {
      logger.error({ err }, 'pg pool idle client error');
    });
  }
  return _pool;
}

/** Convenience alias for the singleton pool */
export const db = new Proxy({} as pg.Pool, {
  get(_target, prop) {
    return Reflect.get(getPool(), prop);
  },
});

/** Execute a parameterized query and return typed rows. */
export async function query<T extends pg.QueryResultRow = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}

/** Close the pool (for graceful shutdown). */
export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
