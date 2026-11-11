-- 020_monitor — Sprint 6 slice "Monitor" (2026-11-10).
-- Continuous monitoring over the engagement's own records: each evaluation
-- derives findings (score regression, control drift between runs, failed or
-- blocked remediation, overdue actions / POA&M, evidence freshness / expiry /
-- missing / stuck in review, scope changes after a confirmed boundary, tenant
-- prerequisites) and writes one trend snapshot. Findings are deduplicated by
-- key, acknowledged / resolved / escalated by people, and audited.
-- Tenant-isolated (RLS, fail-closed).

CREATE TYPE "FindingSeverity" AS ENUM ('critical', 'high', 'medium', 'low', 'info');
CREATE TYPE "FindingStatus" AS ENUM ('open', 'acknowledged', 'escalated', 'resolved');

CREATE TABLE monitor_findings (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  engagement_id   TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,                 -- dedupe key, e.g. evidence.expiring:<item id>
  category        TEXT NOT NULL,                 -- score | control | remediation | plan | evidence | scope | tenant
  severity        "FindingSeverity" NOT NULL,
  title           TEXT NOT NULL,
  detail          JSONB,
  requirement_id  TEXT,
  target_type     TEXT,
  target_id       TEXT,
  status          "FindingStatus" NOT NULL DEFAULT 'open',
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_count      INTEGER NOT NULL DEFAULT 1,
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMPTZ,
  resolved_by     TEXT,
  resolved_at     TIMESTAMPTZ,
  resolution      TEXT,
  escalated_to    TEXT,
  notes           TEXT
);
CREATE UNIQUE INDEX monitor_findings_key ON monitor_findings(engagement_id, key);
CREATE INDEX monitor_findings_engagement_idx ON monitor_findings(engagement_id, status, severity);
ALTER TABLE monitor_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitor_findings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON monitor_findings USING (tenant_id = current_setting('app.tenant_id', true));

CREATE TABLE monitor_snapshots (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  engagement_id   TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  taken_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  sprs_now        INTEGER,
  met_count       INTEGER,
  not_met_count   INTEGER,
  partial_count   INTEGER,
  unknown_count   INTEGER,
  open_actions    INTEGER NOT NULL DEFAULT 0,
  overdue_actions INTEGER NOT NULL DEFAULT 0,
  open_poam       INTEGER NOT NULL DEFAULT 0,
  evidence_validated INTEGER NOT NULL DEFAULT 0,
  evidence_pending   INTEGER NOT NULL DEFAULT 0,
  coverage_covered   INTEGER NOT NULL DEFAULT 0,
  coverage_missing   INTEGER NOT NULL DEFAULT 0,
  findings_open      INTEGER NOT NULL DEFAULT 0,
  findings_critical  INTEGER NOT NULL DEFAULT 0,
  by_family       JSONB,
  triggered_by    TEXT
);
CREATE INDEX monitor_snapshots_engagement_idx ON monitor_snapshots(engagement_id, taken_at DESC);
ALTER TABLE monitor_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitor_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON monitor_snapshots USING (tenant_id = current_setting('app.tenant_id', true));
