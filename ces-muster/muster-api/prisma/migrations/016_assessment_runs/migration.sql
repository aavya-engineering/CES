-- 016_assessment_runs — Sprint 3/4 slice "Assess" (2026-11-10).
-- A persisted readiness assessment per engagement: one run (SPRS now / projected,
-- status counts, engine provenance) + one row per NIST SP 800-171 requirement
-- (status, weight, confidence, objectives, fix path, human override). Feeds
-- Assess › Readiness Assessment and Assess › Gap Analysis; later Plan › POA&M.
-- Tenant-isolated like parties (RLS, fail-closed).

CREATE TYPE "RequirementStatus" AS ENUM ('met', 'partial', 'not_met', 'unknown');
CREATE TYPE "AssessmentSource" AS ENUM ('readiness_result', 'delivery_artifact', 'manual');

CREATE TABLE assessment_runs (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  engagement_id   TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  source          "AssessmentSource" NOT NULL,
  schema_version  TEXT,
  label           TEXT,
  sprs_now        INTEGER NOT NULL,
  sprs_after      INTEGER,
  met_count       INTEGER NOT NULL DEFAULT 0,
  partial_count   INTEGER NOT NULL DEFAULT 0,
  not_met_count   INTEGER NOT NULL DEFAULT 0,
  unknown_count   INTEGER NOT NULL DEFAULT 0,
  engine          JSONB,
  manifest        JSONB,
  generated_at    TIMESTAMPTZ,
  delivery_artifact_id TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX assessment_runs_engagement_id_idx ON assessment_runs(engagement_id, created_at DESC);
ALTER TABLE assessment_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assessment_runs USING (tenant_id = current_setting('app.tenant_id', true));

CREATE TABLE assessment_results (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  run_id          TEXT NOT NULL REFERENCES assessment_runs(id) ON DELETE CASCADE,
  requirement_id  TEXT NOT NULL,
  family          TEXT NOT NULL,
  weight          INTEGER NOT NULL,
  status          "RequirementStatus" NOT NULL,
  engine_status   "RequirementStatus" NOT NULL,
  confidence      TEXT,
  objective_ids   TEXT[] NOT NULL DEFAULT '{}',
  ran_entry_ids   TEXT[] NOT NULL DEFAULT '{}',
  fixable         TEXT,
  fix_entry_ids   TEXT[] NOT NULL DEFAULT '{}',
  override_by     TEXT,
  override_at     TIMESTAMPTZ,
  override_reason TEXT,
  notes           TEXT
);
CREATE UNIQUE INDEX assessment_results_run_requirement_key ON assessment_results(run_id, requirement_id);
ALTER TABLE assessment_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_results FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assessment_results USING (tenant_id = current_setting('app.tenant_id', true));
