import type pg from 'pg';
import { DactylError, ERROR_CODES } from '../lib/errors.js';
import { newTxId } from '../lib/id.js';

/**
 * Debit credits from an agent account inside a pg transaction.
 * Throws DactylError(insufficient_credits) if balance < amount.
 */
export async function debitCredits(
  agentId: string,
  amount: number,
  type: 'task_fee' | 'boost' | 'penalty',
  taskId: string | undefined,
  pool: pg.Pool,
): Promise<{ newBalance: number }> {
  const txId = newTxId();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the agent row for update
    const lockResult = await client.query<{ credits: number }>(
      'SELECT credits FROM agents WHERE id = $1 FOR UPDATE',
      [agentId],
    );

    if (lockResult.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new DactylError(ERROR_CODES.AGENT_NOT_FOUND, { agent_id: agentId });
    }

    const current = lockResult.rows[0]!.credits;
    if (current < amount) {
      await client.query('ROLLBACK');
      throw new DactylError(ERROR_CODES.INSUFFICIENT_CREDITS, {
        required: amount,
        available: current,
      });
    }

    const updateResult = await client.query<{ credits: number }>(
      'UPDATE agents SET credits = credits - $1 WHERE id = $2 RETURNING credits',
      [amount, agentId],
    );

    await client.query(
      `INSERT INTO credit_transactions (id, agent_id, type, amount, task_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [txId, agentId, type, -amount, taskId ?? null],
    );

    await client.query('COMMIT');
    return { newBalance: updateResult.rows[0]!.credits };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Credit an agent's account (topup or refund).
 *
 * stripeEventId: if provided, used as an idempotency key — the same Stripe event
 * will not credit the account twice even if Stripe delivers the webhook multiple times.
 */
export async function creditBalance(
  agentId: string,
  amount: number,
  type: 'topup' | 'refund',
  stripePaymentId: string | undefined,
  pool: pg.Pool,
  stripeEventId?: string,
): Promise<{ newBalance: number }> {
  const txId = newTxId();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check: if this Stripe event was already processed, return current balance.
    if (stripeEventId) {
      const dup = await client.query<{ id: string }>(
        'SELECT id FROM credit_transactions WHERE stripe_event_id = $1',
        [stripeEventId],
      );
      if (dup.rows.length > 0) {
        await client.query('ROLLBACK');
        const balRow = await pool.query<{ credits: number }>(
          'SELECT credits FROM agents WHERE id = $1',
          [agentId],
        );
        return { newBalance: balRow.rows[0]?.credits ?? 0 };
      }
    }

    const result = await client.query<{ credits: number }>(
      'UPDATE agents SET credits = credits + $1 WHERE id = $2 RETURNING credits',
      [amount, agentId],
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new DactylError(ERROR_CODES.AGENT_NOT_FOUND, { agent_id: agentId });
    }

    await client.query(
      `INSERT INTO credit_transactions (id, agent_id, type, amount, stripe_payment_id, stripe_event_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [txId, agentId, type, amount, stripePaymentId ?? null, stripeEventId ?? null],
    );

    await client.query('COMMIT');
    return { newBalance: result.rows[0]!.credits };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
