-- 017_plan_actions — Sprint 4 slice "Plan" (2026-11-10).
-- Remediation action items generated from an assessment run's gaps (or added by
-- hand), their prioritisation / owners / due dates, and the POA&M register
-- (NIST SP 800-171 DoD Assessment Methodology format: weakness, mitigation,
-- milestones, scheduled completion, responsible party). Tenant-isolated (RLS).

CREATE TYPE "ActionPriority" AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE "ActionStatus" AS ENUM ('open', 'in_progress', 'blocked', 'done', 'wont_fix');
CREATE TYPE "PoamStatus" AS ENUM ('open', 'ongoing', 'completed', 'risk_accepted');

CREATE TABLE plan_actions (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  engagement_id   TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  run_id          TEXT REFERENCES assessment_runs(id) ON DELETE SET NULL,
  requirement_id  TEXT,
  family          TEXT,
  weight          INTEGER NOT NULL DEFAULT 0,
  title           TEXT NOT NULL,
  description     TEXT,
  source          TEXT NOT NULL DEFAULT 'manual',          -- gap | manual
  fix_kind        TEXT NOT NULL DEFAULT 'manual',          -- registry | manual
  fix_entry_ids   TEXT[] NOT NULL DEFAULT '{}',
  priority        "ActionPriority" NOT NULL DEFAULT 'medium',
  status          "ActionStatus" NOT NULL DEFAULT 'open',
  owner           TEXT,
  due_date        DATE,
  effort_hours    INTEGER,
  depends_on      TEXT[] NOT NULL DEFAULT '{}',
  sequence        INTEGER,
  notes           TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at       TIMESTAMPTZ
);
CREATE INDEX plan_actions_engagement_idx ON plan_actions(engagement_id, status);
ALTER TABLE plan_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON plan_actions USING (tenant_id = current_setting('app.tenant_id', true));

CREATE TABLE poam_items (
  id                    TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL REFERENCES tenants(id),
  engagement_id         TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  action_id             TEXT REFERENCES plan_actions(id) ON DELETE SET NULL,
  requirement_id        TEXT NOT NULL,
  weight                INTEGER NOT NULL DEFAULT 0,
  poam_allowed          BOOLEAN NOT NULL DEFAULT true,     -- false for sprs-weights poam_prohibited
  weakness              TEXT NOT NULL,
  mitigation            TEXT,
  milestones            JSONB,                             -- [{ title, due_date, done }]
  scheduled_completion  DATE,
  responsible           TEXT,
  resources             TEXT,
  status                "PoamStatus" NOT NULL DEFAULT 'open',
  created_by            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at          TIMESTAMPTZ
);
CREATE INDEX poam_items_engagement_idx ON poam_items(engagement_id, status);
ALTER TABLE poam_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE poam_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON poam_items USING (tenant_id = current_setting('app.tenant_id', true));
