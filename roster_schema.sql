-- ═══════════════════════════════════════════════════════════════
--  K7TeamCore — Roster Planner schema
--  Run ONCE on the PRIMARY (AWS / PostgREST) database.
--  Safe to re-run: every statement is IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════

-- One row per planned month. status: 'draft' (only planners see it) | 'released' (agents see it)
CREATE TABLE IF NOT EXISTS roster_months (
  id           BIGSERIAL PRIMARY KEY,
  year         INT  NOT NULL,
  month        INT  NOT NULL CHECK (month BETWEEN 1 AND 12),
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','released')),
  released_at  TIMESTAMPTZ,
  released_by  TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   TEXT,
  UNIQUE (year, month)
);

-- One row per agent per month. days = JSON array of 31 shift codes ("" = unassigned).
CREATE TABLE IF NOT EXISTS roster_entries (
  id           BIGSERIAL PRIMARY KEY,
  year         INT  NOT NULL,
  month        INT  NOT NULL CHECK (month BETWEEN 1 AND 12),
  user_id      TEXT,                       -- users.id when the agent is a portal user (kept as text on purpose)
  agent_name   TEXT NOT NULL,              -- display name; this is what the roster grid & "My shift" match on
  emp_id       TEXT,
  sort_order   INT  NOT NULL DEFAULT 0,
  days         JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   TEXT,
  UNIQUE (year, month, agent_name)
);

CREATE INDEX IF NOT EXISTS roster_entries_ym_idx ON roster_entries (year, month, sort_order);

-- keep updated_at fresh
CREATE OR REPLACE FUNCTION roster_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS roster_months_touch ON roster_months;
CREATE TRIGGER roster_months_touch BEFORE UPDATE ON roster_months
  FOR EACH ROW EXECUTE FUNCTION roster_touch_updated_at();

DROP TRIGGER IF EXISTS roster_entries_touch ON roster_entries;
CREATE TRIGGER roster_entries_touch BEFORE UPDATE ON roster_entries
  FOR EACH ROW EXECUTE FUNCTION roster_touch_updated_at();

-- ── Access ──────────────────────────────────────────────────────
-- The portal talks to PostgREST with the token from ./make-jwt.sh (role "anon").
-- Give that role the same access the other TeamCore tables have.
-- If your PostgREST role is named differently, change "anon" below.
GRANT SELECT, INSERT, UPDATE, DELETE ON roster_months  TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON roster_entries TO anon;
GRANT USAGE, SELECT ON SEQUENCE roster_months_id_seq  TO anon;
GRANT USAGE, SELECT ON SEQUENCE roster_entries_id_seq TO anon;

-- If RLS is enabled on your other tables, mirror the same policy style here, e.g.:
-- ALTER TABLE roster_months  ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE roster_entries ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY roster_months_all  ON roster_months  FOR ALL TO anon USING (true) WITH CHECK (true);
-- CREATE POLICY roster_entries_all ON roster_entries FOR ALL TO anon USING (true) WITH CHECK (true);

-- Tell PostgREST about the new tables (no restart needed)
NOTIFY pgrst, 'reload schema';
