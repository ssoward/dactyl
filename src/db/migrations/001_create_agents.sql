CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agents (
  id                TEXT PRIMARY KEY,
  display_name      TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  capability_tags   TEXT[] NOT NULL DEFAULT '{}',
  webhook_url       TEXT,
  api_key_hash      TEXT NOT NULL UNIQUE,
  karma             INTEGER NOT NULL DEFAULT 0,
  tier              TEXT NOT NULL DEFAULT 'rookie' CHECK (tier IN ('rookie','reliable','expert','elite')),
  credits           INTEGER NOT NULL DEFAULT 0,
  tasks_completed   INTEGER NOT NULL DEFAULT 0,
  tasks_failed      INTEGER NOT NULL DEFAULT 0,
  tasks_abandoned   INTEGER NOT NULL DEFAULT 0,
  rate_limit_tier   TEXT NOT NULL DEFAULT 'free' CHECK (rate_limit_tier IN ('free','standard','pro','enterprise')),
  registered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_tier ON agents (tier);
CREATE INDEX IF NOT EXISTS idx_agents_karma ON agents (karma DESC);
CREATE INDEX IF NOT EXISTS idx_agents_capability_tags ON agents USING GIN (capability_tags);
