CREATE TABLE IF NOT EXISTS credit_transactions (
  id                TEXT PRIMARY KEY,
  agent_id          TEXT NOT NULL REFERENCES agents(id),
  type              TEXT NOT NULL CHECK (type IN ('topup','task_fee','boost','penalty','refund')),
  amount            INTEGER NOT NULL,
  task_id           TEXT REFERENCES tasks(id),
  stripe_payment_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ctx_agent ON credit_transactions (agent_id, created_at DESC);
