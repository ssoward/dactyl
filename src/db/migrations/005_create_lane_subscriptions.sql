CREATE TABLE IF NOT EXISTS lane_subscriptions (
  agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  lane_slug  TEXT NOT NULL REFERENCES lanes(slug) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (agent_id, lane_slug)
);

CREATE INDEX IF NOT EXISTS idx_lane_subs_lane ON lane_subscriptions (lane_slug);

CREATE OR REPLACE FUNCTION update_lane_sub_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE lanes SET subscribed_agent_count = subscribed_agent_count + 1 WHERE slug = NEW.lane_slug;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE lanes SET subscribed_agent_count = GREATEST(0, subscribed_agent_count - 1) WHERE slug = OLD.lane_slug;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lane_sub_count ON lane_subscriptions;
CREATE TRIGGER trg_lane_sub_count AFTER INSERT OR DELETE ON lane_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_lane_sub_count();
