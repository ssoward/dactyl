CREATE TABLE IF NOT EXISTS lanes (
  slug                   TEXT PRIMARY KEY,
  display_name           TEXT NOT NULL,
  description            TEXT NOT NULL DEFAULT '',
  capability_tags        TEXT[] NOT NULL DEFAULT '{}',
  min_karma_default      INTEGER NOT NULL DEFAULT 0,
  visibility             TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  active_task_count      INTEGER NOT NULL DEFAULT 0,
  subscribed_agent_count INTEGER NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
