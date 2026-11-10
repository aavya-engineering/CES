-- 018_remediation_runs — Sprint 5 slice "Remediate" (2026-11-10).
-- Run requests for the two execution modules (Stamper = configuration
-- set-commands from the command registry, BHD-operated; AdminOps = the 95
-- administrative operations the customer's CIS administrator runs) with the
-- engine's gates recorded on the row: simulator-first rail, DP-1 cost estimate,
-- DP-2 two-person approval, HELD (manual_only) entries, live-access flag.
-- Execution against a tenant is the Sprint-5 runner integration; until then a
-- simulate run records what would be executed and a live run stops at "queued".

CREATE TYPE "RemediationModule" AS ENUM ('stamper', 'adminops');
CREATE TYPE "RunMode" AS ENUM ('simulate', 'live');
CREATE TYPE "RunStatus" AS ENUM ('requested', 'approved', 'rejected', 'blocked', 'queued', 'running', 'succeeded', 'failed', 'verified', 'cancelled');

CREATE TABLE remediation_runs (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenants(id),
  engagement_id    TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  module           "RemediationModule" NOT NULL,
  mode             "RunMode" NOT NULL DEFAULT 'simulate',
  action_id        TEXT REFERENCES plan_actions(id) ON DELETE SET NULL,
  requirement_id   TEXT,
  entry_ids        TEXT[] NOT NULL DEFAULT '{}',      -- stamper registry entry ids
  op_id            TEXT,                              -- adminops operation id (A-01 …)
  parameters       JSONB,                             -- adminops parameters (never secrets)
  justification    TEXT NOT NULL,
  status           "RunStatus" NOT NULL DEFAULT 'requested',
  gates            JSONB NOT NULL,                    -- [{ id, label, ok, note }]
  cost_estimate    INTEGER NOT NULL DEFAULT 0,
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  requested_by     TEXT NOT NULL,
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by      TEXT,
  approved_at      TIMESTAMPTZ,
  rejection_reason TEXT,
  started_at       TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ,
  result           JSONB,
  verified_by      TEXT,
  verified_at      TIMESTAMPTZ,
  verification_notes TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX remediation_runs_engagement_idx ON remediation_runs(engagement_id, status);
ALTER TABLE remediation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE remediation_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON remediation_runs USING (tenant_id = current_setting('app.tenant_id', true));
