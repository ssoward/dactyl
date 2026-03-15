#!/usr/bin/env tsx
/**
 * Database migration runner.
 * Reads all .sql files from src/db/migrations/ in numeric order,
 * checks schema_migrations for applied versions, and runs unapplied ones.
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Dev:  __dirname = <root>/scripts      → ../src/db/migrations
// Prod: __dirname = /app/dist/scripts   → ../../src/db/migrations
const isDist = __dirname.endsWith(`${path.sep}dist${path.sep}scripts`) || __dirname.endsWith('/dist/scripts');
const MIGRATIONS_DIR = isDist
  ? path.resolve(__dirname, '../../src/db/migrations')
  : path.resolve(__dirname, '../src/db/migrations');

async function ensureMigrationsTable(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedVersions(client: pg.PoolClient): Promise<Set<string>> {
  const result = await client.query<{ version: string }>(
    'SELECT version FROM schema_migrations ORDER BY version',
  );
  return new Set(result.rows.map((r) => r.version));
}

async function runMigrations(): Promise<void> {
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

  try {
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort(); // numeric prefix sort: 001_, 002_, ...

    const client = await pool.connect();
    try {
      await ensureMigrationsTable(client);
      const applied = await getAppliedVersions(client);

      for (const file of files) {
        const version = file.replace('.sql', '');
        if (applied.has(version)) {
          console.log(`[skip]  ${version} (already applied)`);
          continue;
        }

        const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

        console.log(`[run]   ${version} ...`);
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query(
            'INSERT INTO schema_migrations (version) VALUES ($1)',
            [version],
          );
          await client.query('COMMIT');
          console.log(`[done]  ${version}`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`[fail]  ${version}:`, err);
          throw err;
        }
      }

      console.log('\nAll migrations complete.');
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error(err);
  process.exit(1);
});
