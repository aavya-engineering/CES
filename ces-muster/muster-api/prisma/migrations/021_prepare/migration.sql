-- 021_prepare — Sprint 6 slice "Prepare for Assessment" (2026-11-10).
-- What the C3PAO sees: SSP control implementation statements, evidence
-- packages (a frozen manifest of validated evidence per scope with its hashes),
-- the assessor's read-only workspace and question log, and the sign-offs of
-- the internal review. Tenant-isolated (RLS, fail-closed).

CREATE TYPE "ImplementationStatus" AS ENUM ('implemented', 'partially_implemented', 'planned', 'alternative', 'not_applicable');
CREATE TYPE "PackageStatus" AS ENUM ('draft', 'validated', 'signed_off', 'superseded');
CREATE TYPE "AssessorRequestStatus" AS ENUM ('open', 'answered', 'closed');
CREATE TYPE "SignOffKind" AS ENUM ('internal_review', 'evidence_completeness', 'gap_closure', 'package', 'final');

CREATE TABLE implementation_statements (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenants(id),
  engagement_id    TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  requirement_id   TEXT NOT NULL,
  status           "ImplementationStatus" NOT NULL DEFAULT 'planned',
  statement        TEXT NOT NULL DEFAULT '',
  responsible_role TEXT,
  systems          TEXT[] NOT NULL DEFAULT '{}',
  evidence_item_ids TEXT[] NOT NULL DEFAULT '{}',
  source           TEXT NOT NULL DEFAULT 'manual',      -- manual | generated_draft
  version          INTEGER NOT NULL DEFAULT 1,
  approved_by      TEXT,
  approved_at      TIMESTAMPTZ,
  updated_by       TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX implementation_statements_req_key ON implementation_statements(engagement_id, requirement_id);
ALTER TABLE implementation_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE implementation_statements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON implementation_statements USING (tenant_id = current_setting('app.tenant_id', true));

CREATE TABLE evidence_packages (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  engagement_id  TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  scope_type     TEXT NOT NULL DEFAULT 'all',          -- all | requirement | family | objective
  scope_values   TEXT[] NOT NULL DEFAULT '{}',
  item_ids       TEXT[] NOT NULL DEFAULT '{}',
  manifest       JSONB NOT NULL,                       -- frozen: items with sha256, requirement, archetype, status, validation strength
  validation     JSONB,                                -- { passed, missing_required[], unvalidated[], expired[] }
  status         "PackageStatus" NOT NULL DEFAULT 'draft',
  version        INTEGER NOT NULL DEFAULT 1,
  supersedes_id  TEXT REFERENCES evidence_packages(id) ON DELETE SET NULL,
  run_id         TEXT REFERENCES assessment_runs(id) ON DELETE SET NULL,
  built_by       TEXT,
  built_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  signed_off_by  TEXT,
  signed_off_at  TIMESTAMPTZ,
  sign_off_notes TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX evidence_packages_engagement_idx ON evidence_packages(engagement_id, status);
ALTER TABLE evidence_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_packages FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON evidence_packages USING (tenant_id = current_setting('app.tenant_id', true));

CREATE TABLE assessor_requests (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  engagement_id  TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  package_id     TEXT REFERENCES evidence_packages(id) ON DELETE SET NULL,
  requirement_id TEXT,
  question       TEXT NOT NULL,
  requested_by   TEXT NOT NULL,
  status         "AssessorRequestStatus" NOT NULL DEFAULT 'open',
  answer         TEXT,
  answered_by    TEXT,
  answered_at    TIMESTAMPTZ,
  evidence_item_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX assessor_requests_engagement_idx ON assessor_requests(engagement_id, status);
ALTER TABLE assessor_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessor_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assessor_requests USING (tenant_id = current_setting('app.tenant_id', true));

CREATE TABLE assessment_sign_offs (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  kind          "SignOffKind" NOT NULL,
  decision      TEXT NOT NULL,                         -- approved | rejected
  notes         TEXT NOT NULL,
  package_id    TEXT REFERENCES evidence_packages(id) ON DELETE SET NULL,
  run_id        TEXT REFERENCES assessment_runs(id) ON DELETE SET NULL,
  readiness     JSONB,                                 -- the checklist at the time of signing
  signed_by     TEXT NOT NULL,
  signed_role   TEXT,
  signed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX assessment_sign_offs_engagement_idx ON assessment_sign_offs(engagement_id, kind);
ALTER TABLE assessment_sign_offs ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_sign_offs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON assessment_sign_offs USING (tenant_id = current_setting('app.tenant_id', true));
