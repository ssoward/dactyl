import type pg from 'pg';
import { KarmaEventType } from './events.js';
import { applyKarmaEvent } from './engine.js';

const STREAK_LENGTH = 5;

/**
 * Check whether the agent has a completion streak (last N tasks completed
 * without a downvote) and award a streak bonus if so.
 *
 * Returns true if the bonus was awarded.
 */
export async function checkAndAwardStreak(
  agentId: string,
  pool: pg.Pool,
): Promise<boolean> {
  // Fetch last STREAK_LENGTH completed tasks for this agent
  const result = await pool.query<{ vote: string | null }>(
    `SELECT vote
     FROM tasks
     WHERE claimed_by_agent_id = $1
       AND status = 'completed'
     ORDER BY completed_at DESC
     LIMIT $2`,
    [agentId, STREAK_LENGTH],
  );

  const rows = result.rows;

  // Need exactly STREAK_LENGTH completions to qualify
  if (rows.length < STREAK_LENGTH) return false;

  // All recent completions must have no downvote
  const hasDownvote = rows.some((r) => r.vote === 'down');
  if (hasDownvote) return false;

  await applyKarmaEvent(
    agentId,
    KarmaEventType.STREAK_BONUS,
    undefined,
    pool,
  );
  return true;
}
