import type pg from 'pg';
import { AgentTier } from '../types.js';
import { KarmaEventType, KARMA_DELTAS } from './events.js';
import { newKarmaId } from '../lib/id.js';

export function computeTier(karma: number): AgentTier {
  if (karma >= 500) return AgentTier.ELITE;
  if (karma >= 200) return AgentTier.EXPERT;
  if (karma >= 50) return AgentTier.RELIABLE;
  return AgentTier.ROOKIE;
}

/**
 * Apply a karma event inside a pg transaction.
 *
 * Steps:
 *   1. SELECT karma FOR UPDATE (row-level lock, compute new values in one pass)
 *   2. INSERT into karma_events
 *   3. UPDATE agents: karma = newValue, tier = computeTier(newValue), last_active_at = NOW()
 *   4. Return new values
 */
export async function applyKarmaEvent(
  agentId: string,
  eventType: KarmaEventType,
  taskId: string | undefined,
  pool: pg.Pool,
): Promise<{ newKarma: number; newTier: AgentTier }> {
  const delta = KARMA_DELTAS[eventType];
  const karmaId = newKarmaId();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the row and read current karma so we can compute the correct tier
    // in a single subsequent UPDATE (avoids the double-UPDATE bug).
    const currentKarmaResult = await client.query<{ karma: number }>(
      'SELECT karma FROM agents WHERE id = $1 FOR UPDATE',
      [agentId],
    );
    if (currentKarmaResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new Error(`Agent not found: ${agentId}`);
    }
    const newKarmaValue = currentKarmaResult.rows[0]!.karma + delta;
    const newTier = computeTier(newKarmaValue);

    await client.query(
      `INSERT INTO karma_events (id, agent_id, event_type, delta, task_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [karmaId, agentId, eventType, delta, taskId ?? null],
    );

    // Single UPDATE: karma, tier, and last_active_at all set correctly at once.
    await client.query(
      `UPDATE agents SET karma = $1, tier = $2, last_active_at = NOW() WHERE id = $3`,
      [newKarmaValue, newTier, agentId],
    );

    await client.query('COMMIT');
    return { newKarma: newKarmaValue, newTier };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
