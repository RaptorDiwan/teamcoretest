-- ═══════════════════════════════════════════════════════════════
--  K7TeamCore — Teams schema  (run AFTER roster_schema.sql, once)
--  Companies: K7 Computing · K7 Cyber Security
--  Teams:     K7C (K7 Computing) · K7CS (K7 Cyber Security) · SOC (K7 Cyber Security)
--  Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS teams (
  code        TEXT PRIMARY KEY,            -- K7C / K7CS / SOC
  name        TEXT NOT NULL,               -- display name
  company     TEXT NOT NULL,               -- K7 Computing | K7 Cyber Security
  color       TEXT NOT NULL DEFAULT '#4C76A8',
  sort_order  INT  NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT true,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO teams (code, name, company, color, sort_order) VALUES
  ('K7C',  'K7 Computing',      'K7 Computing',      '#C9352B', 1),
  ('K7CS', 'K7 Cyber Security', 'K7 Cyber Security', '#1E3A5F', 2),
  ('SOC',  'SOC',               'K7 Cyber Security', '#4C3A9E', 3)
ON CONFLICT (code) DO NOTHING;

-- One row per portal user. Users with no row are treated as K7C (default team).
CREATE TABLE IF NOT EXISTS user_teams (
  user_id     TEXT PRIMARY KEY,            -- users.id as text
  user_name   TEXT,
  team_code   TEXT NOT NULL REFERENCES teams(code) ON UPDATE CASCADE,
  assigned_by TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_teams_team_idx ON user_teams (team_code);

-- ── Roster tables become team-scoped ───────────────────────────
ALTER TABLE roster_months  ADD COLUMN IF NOT EXISTS team TEXT NOT NULL DEFAULT 'K7C';
ALTER TABLE roster_entries ADD COLUMN IF NOT EXISTS team TEXT NOT NULL DEFAULT 'K7C';

-- replace the old (year, month[, agent_name]) uniqueness with team-scoped uniqueness
ALTER TABLE roster_months  DROP CONSTRAINT IF EXISTS roster_months_year_month_key;
ALTER TABLE roster_entries DROP CONSTRAINT IF EXISTS roster_entries_year_month_agent_name_key;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roster_months_team_ym_key') THEN
    ALTER TABLE roster_months ADD CONSTRAINT roster_months_team_ym_key UNIQUE (team, year, month);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roster_entries_team_ym_agent_key') THEN
    ALTER TABLE roster_entries ADD CONSTRAINT roster_entries_team_ym_agent_key UNIQUE (team, year, month, agent_name);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS roster_entries_team_ym_idx ON roster_entries (team, year, month, sort_order);

-- ── Access (same role as the other tables; rename "anon" if yours differs) ──
GRANT SELECT, INSERT, UPDATE, DELETE ON teams      TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_teams TO anon;

NOTIFY pgrst, 'reload schema';
