CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id           TEXT PRIMARY KEY,
  agent_id     TEXT NOT NULL REFERENCES agents(id),
  event_type   TEXT NOT NULL,
  task_id      TEXT,
  payload      JSONB NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed')),
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_attempt TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_agent ON webhook_deliveries (agent_id, created_at DESC);
