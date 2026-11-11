-- 019_evidence — Sprint 6 slice "Collect Evidence" (2026-11-10).
-- Evidence items per engagement (uploads, run captures, attestations) mapped to
-- requirements + a standard-evidence archetype (CES-Shared EMX catalogue),
-- validated against built-in completeness/format/mapping checks and the
-- published EVR rules, reviewed by a person who did not submit them (SoD),
-- versioned, classified and retained. Evidence requests ask a named person for
-- a specific archetype by a date. Tenant-isolated (RLS, fail-closed).

CREATE TYPE "EvidenceKind" AS ENUM ('document', 'screenshot', 'export', 'config_capture', 'attestation', 'log', 'other');
CREATE TYPE "EvidenceSource" AS ENUM ('upload', 'stamper', 'adminops', 'discovery', 'manual');
CREATE TYPE "EvidenceStatus" AS ENUM ('draft', 'submitted', 'validated', 'rejected', 'expired', 'archived');
CREATE TYPE "EvidenceRequestStatus" AS ENUM ('open', 'submitted', 'fulfilled', 'cancelled');

CREATE TABLE evidence_items (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  engagement_id   TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  requirement_ids TEXT[] NOT NULL DEFAULT '{}',
  objective_ids   TEXT[] NOT NULL DEFAULT '{}',
  archetype_code  TEXT,
  form            TEXT,                           -- one of the archetype's acceptable_forms
  title           TEXT NOT NULL,
  description     TEXT,
  kind            "EvidenceKind" NOT NULL DEFAULT 'document',
  source          "EvidenceSource" NOT NULL DEFAULT 'upload',
  file_name       TEXT,
  content_type    TEXT,
  size_bytes      INTEGER NOT NULL DEFAULT 0,
  sha256          TEXT,
  content         BYTEA,                          -- ≤ 10 MB; larger files: repository link in metadata.external_url
  metadata        JSONB,
  collected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  period_start    DATE,
  period_end      DATE,
  owner           TEXT,
  classification  TEXT NOT NULL DEFAULT 'internal', -- cui | non_cui | internal
  status          "EvidenceStatus" NOT NULL DEFAULT 'draft',
  validation      JSONB,                          -- { checked_at, passed, strength, checks[], rules[] }
  reviewed_by     TEXT,
  reviewed_at     TIMESTAMPTZ,
  review_notes    TEXT,
  run_id          TEXT REFERENCES remediation_runs(id) ON DELETE SET NULL,
  version         INTEGER NOT NULL DEFAULT 1,
  supersedes_id   TEXT REFERENCES evidence_items(id) ON DELETE SET NULL,
  retention_until DATE,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX evidence_items_engagement_idx ON evidence_items(engagement_id, status);
CREATE INDEX evidence_items_requirements_idx ON evidence_items USING GIN (requirement_ids);
ALTER TABLE evidence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON evidence_items USING (tenant_id = current_setting('app.tenant_id', true));

CREATE TABLE evidence_requests (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL REFERENCES tenants(id),
  engagement_id    TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  requirement_id   TEXT NOT NULL,
  archetype_code   TEXT,
  title            TEXT NOT NULL,
  instructions     TEXT,
  assignee         TEXT,
  due_date         DATE,
  status           "EvidenceRequestStatus" NOT NULL DEFAULT 'open',
  evidence_item_id TEXT REFERENCES evidence_items(id) ON DELETE SET NULL,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX evidence_requests_engagement_idx ON evidence_requests(engagement_id, status);
ALTER TABLE evidence_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON evidence_requests USING (tenant_id = current_setting('app.tenant_id', true));
