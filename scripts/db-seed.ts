#!/usr/bin/env tsx
/**
 * Database seeder — runs src/db/seeds/lanes.sql.
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Dev:  __dirname = <root>/scripts      → ../src/db/seeds
// Prod: __dirname = /app/dist/scripts   → ../../src/db/seeds
const isDist = __dirname.endsWith(`${path.sep}dist${path.sep}scripts`) || __dirname.endsWith('/dist/scripts');
const SEED_FILE = isDist
  ? path.resolve(__dirname, '../../src/db/seeds/lanes.sql')
  : path.resolve(__dirname, '../src/db/seeds/lanes.sql');

async function seed(): Promise<void> {
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  try {
    const sql = fs.readFileSync(SEED_FILE, 'utf8');
    console.log('[seed] Running lanes seed...');
    await pool.query(sql);
    console.log('[seed] Done.');
  } finally {
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
