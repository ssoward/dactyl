import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import Stripe from 'stripe';
import { query, getPool } from '../db/client.js';
import { authMiddleware } from '../auth/middleware.js';
import { DactylError, ERROR_CODES } from '../lib/errors.js';
import { createTopupSession, getBundleCredits } from '../credits/stripe.js';
import { creditBalance } from '../credits/ledger.js';
import { encodeCursor, decodeCursor } from '../lib/paginate.js';
import { env } from '../env.js';
import type { Agent, CreditTransaction } from '../types.js';

const TopupBody = Type.Object({
  bundle: Type.Union([
    Type.Literal('starter'),
    Type.Literal('growth'),
    Type.Literal('pro'),
    Type.Literal('volume'),
  ]),
});

export async function creditsRoutes(app: FastifyInstance): Promise<void> {
  // GET /credits/balance
  app.get('/credits/balance', { preHandler: authMiddleware }, async (request, reply) => {
    const agentId = request.agentId;
    const rows = await query<{ credits: number; tier: string }>(
      'SELECT credits, tier FROM agents WHERE id = $1',
      [agentId],
    );
    if (rows.length === 0) {
      throw new DactylError(ERROR_CODES.AGENT_NOT_FOUND, { agent_id: agentId });
    }
    return reply.send({ balance: rows[0]!.credits, tier: rows[0]!.tier });
  });

  // POST /credits/topup — initiate Stripe checkout
  app.post(
    '/credits/topup',
    { preHandler: authMiddleware, schema: { body: TopupBody } },
    async (request, reply) => {
      const agentId = request.agentId;
      const body = request.body as { bundle: 'starter' | 'growth' | 'pro' | 'volume' };

      const { url, sessionId } = await createTopupSession(agentId, body.bundle);
      return reply.send({ checkout_url: url, session_id: sessionId });
    },
  );

  // GET /credits/ledger — paginated transaction history
  app.get('/credits/ledger', { preHandler: authMiddleware }, async (request, reply) => {
    const agentId = request.agentId;
    const q = request.query as Record<string, string>;
    const limit = Math.min(parseInt(q['limit'] ?? '20', 10), 100);
    const cursor = q['cursor'];

    const conditions = [`agent_id = $1`];
    const params: unknown[] = [agentId];
    let paramIdx = 2;

    if (cursor) {
      conditions.push(`id > $${paramIdx++}`);
      params.push(decodeCursor(cursor));
    }

    params.push(limit + 1);
    const txs = await query<CreditTransaction>(
      `SELECT * FROM credit_transactions
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${paramIdx}`,
      params,
    );

    let nextCursor: string | undefined;
    if (txs.length > limit) {
      txs.pop();
      const last = txs[txs.length - 1];
      if (last) nextCursor = encodeCursor(last.id);
    }

    return reply.send({ transactions: txs, next_cursor: nextCursor ?? null });
  });

  // POST /credits/stripe-webhook — Stripe event handler
  // No JWT auth; Stripe verifies via webhook secret
  app.post(
    '/credits/stripe-webhook',
    {
      config: { rawBody: true },
    },
    async (request, reply) => {
      const sig = request.headers['stripe-signature'];
      if (!sig || typeof sig !== 'string') {
        return reply.status(400).send({ error: { code: 'validation_error', reason: 'missing_signature' } });
      }

      const stripe = new Stripe(env.STRIPE_SECRET_KEY);
      let event: Stripe.Event;

      try {
        // rawBody is attached by Fastify raw body plugin or content-type parser
        const rawBody = (request as unknown as { rawBody: Buffer }).rawBody ?? Buffer.from(JSON.stringify(request.body));
        event = stripe.webhooks.constructEvent(
          rawBody,
          sig,
          env.STRIPE_WEBHOOK_SECRET,
        );
      } catch (err) {
        return reply.status(400).send({
          error: { code: 'validation_error', reason: 'invalid_signature' },
        });
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const agentId = session.metadata?.['agent_id'];
        const bundle = session.metadata?.['bundle'];

        if (agentId && bundle) {
          const credits = getBundleCredits(bundle as 'starter' | 'growth' | 'pro' | 'volume');
          if (credits > 0) {
            const pool = getPool();
            // Pass stripe event.id for idempotency — prevents duplicate credits
            // if Stripe retries the same webhook event.
            await creditBalance(
              agentId,
              credits,
              'topup',
              session.payment_intent as string | undefined,
              pool,
              event.id,
            );
          }
        }
      }

      return reply.send({ received: true });
    },
  );
}
