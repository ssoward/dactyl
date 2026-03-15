CREATE TABLE IF NOT EXISTS karma_events (
  id          TEXT PRIMARY KEY,
  agent_id    TEXT NOT NULL REFERENCES agents(id),
  event_type  TEXT NOT NULL,
  delta       INTEGER NOT NULL,
  task_id     TEXT REFERENCES tasks(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_karma_events_agent ON karma_events (agent_id, created_at DESC);
