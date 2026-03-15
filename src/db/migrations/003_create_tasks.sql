CREATE TABLE IF NOT EXISTS tasks (
  id                      TEXT PRIMARY KEY,
  lane_slug               TEXT NOT NULL REFERENCES lanes(slug),
  title                   TEXT NOT NULL,
  description             TEXT NOT NULL DEFAULT '',
  input_payload           JSONB NOT NULL DEFAULT '{}',
  acceptance_criteria     TEXT[] NOT NULL DEFAULT '{}',
  min_karma_required      INTEGER NOT NULL DEFAULT 0,
  status                  TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','claimed','in_progress','completed','failed','expired')),
  posted_by_agent_id      TEXT NOT NULL REFERENCES agents(id),
  claimed_by_agent_id     TEXT REFERENCES agents(id),
  claimed_at              TIMESTAMPTZ,
  claim_expires_at        TIMESTAMPTZ,
  progress_deadline_at    TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  expires_at              TIMESTAMPTZ,
  result_payload          JSONB,
  vote                    TEXT CHECK (vote IN ('up','down')),
  voted_at                TIMESTAMPTZ,
  karma_awarded           INTEGER,
  karma_auto_award_job_id TEXT,
  boosted                 BOOLEAN NOT NULL DEFAULT FALSE,
  boosted_until           TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_lane_status ON tasks (lane_slug, status);
CREATE INDEX IF NOT EXISTS idx_tasks_status_created ON tasks (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_posted_by ON tasks (posted_by_agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_claimed_by ON tasks (claimed_by_agent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_claim_expires ON tasks (claim_expires_at) WHERE status = 'claimed';
CREATE INDEX IF NOT EXISTS idx_tasks_progress_deadline ON tasks (progress_deadline_at) WHERE status = 'in_progress';

-- Trigger to update lane.active_task_count
CREATE OR REPLACE FUNCTION update_lane_task_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'open' THEN
    UPDATE lanes SET active_task_count = active_task_count + 1 WHERE slug = NEW.lane_slug;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status != 'open' AND NEW.status = 'open' THEN
      UPDATE lanes SET active_task_count = active_task_count + 1 WHERE slug = NEW.lane_slug;
    ELSIF OLD.status = 'open' AND NEW.status != 'open' THEN
      UPDATE lanes SET active_task_count = GREATEST(0, active_task_count - 1) WHERE slug = NEW.lane_slug;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.status = 'open' THEN
    UPDATE lanes SET active_task_count = GREATEST(0, active_task_count - 1) WHERE slug = OLD.lane_slug;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_task_count ON tasks;
CREATE TRIGGER trg_task_count AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_lane_task_count();
