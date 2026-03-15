-- Migration 008: security hardening + performance indexes

-- 1. Fast-path API key lookup (O(1) prefix lookup instead of full-table scrypt scan)
--    Stores the first 16 hex chars of the raw key after 'dactyl_sk_' prefix.
--    Unique to enable index-only filtering before expensive scrypt verification.
ALTER TABLE agents ADD COLUMN IF NOT EXISTS api_key_prefix TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_api_key_prefix
  ON agents (api_key_prefix) WHERE api_key_prefix IS NOT NULL;

-- 2. Display name uniqueness check by index (not sequential scan)
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_display_name ON agents (display_name);

-- 3. Stripe webhook event idempotency — prevents double-credit on webhook retries
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS stripe_event_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ctx_stripe_event
  ON credit_transactions (stripe_event_id) WHERE stripe_event_id IS NOT NULL;
