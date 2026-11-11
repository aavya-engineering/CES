-- 024_engine_jobs — discovery (assessment) runs through the runner protocol (2026-11-11).
-- The registry's read commands are PowerShell, so a discovery run executes on the Windows
-- runner. A job is queued here, claimed by the runner, and completed with a readiness-result
-- envelope (+ captures). Replaces the in-memory job map (one row per job; survives restarts
-- and multiple API replicas).
CREATE TYPE "EngineJobStatus" AS ENUM ('queued', 'running', 'done', 'failed', 'cancelled');

CREATE TABLE engine_jobs (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  engagement_id  TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL DEFAULT 'discovery',
  mode           TEXT NOT NULL,                       -- sim | live
  tenant_slug    TEXT NOT NULL,
  label          TEXT,
  status         "EngineJobStatus" NOT NULL DEFAULT 'queued',
  requested_by   TEXT NOT NULL,
  requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_by     TEXT,
  claimed_at     TIMESTAMPTZ,
  finished_at    TIMESTAMPTZ,
  run_id         TEXT REFERENCES assessment_runs(id) ON DELETE SET NULL,
  error          TEXT,
  stats          JSONB,
  evidence       JSONB,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX engine_jobs_engagement_status_idx ON engine_jobs (engagement_id, status);
ALTER TABLE engine_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON engine_jobs USING (tenant_id = current_setting('app.tenant_id', true));
