-- 022_admin_registry — Sprint 1/3 leftovers (2026-11-10): Administration
-- (tenant settings, access requests, access reviews) and Onboard › System &
-- Environment Registry. Tenant-isolated (RLS, fail-closed).

CREATE TABLE tenant_settings (
  tenant_id     TEXT PRIMARY KEY REFERENCES tenants(id),
  organization  JSONB NOT NULL DEFAULT '{}',   -- display_name, timezone, locale, support_contact
  system        JSONB NOT NULL DEFAULT '{}',   -- monitoring_cadence_hours, evidence_currency_days, session_idle_minutes
  notifications JSONB NOT NULL DEFAULT '{}',   -- alert_min_severity, digest, recipients[]
  security      JSONB NOT NULL DEFAULT '{}',   -- password_min_length, session_ttl_hours, require_mfa_note, ip_allowlist[]
  retention     JSONB NOT NULL DEFAULT '{}',   -- evidence_days, audit_days, package_days
  version       INTEGER NOT NULL DEFAULT 1,
  updated_by    TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_settings USING (tenant_id = current_setting('app.tenant_id', true));

CREATE TYPE "AccessRequestStatus" AS ENUM ('open', 'approved', 'rejected', 'fulfilled');
CREATE TABLE access_requests (
  id             TEXT PRIMARY KEY,
  tenant_id      TEXT NOT NULL REFERENCES tenants(id),
  requested_by   TEXT NOT NULL,
  subject_email  TEXT NOT NULL,                 -- whose access
  requested_role TEXT NOT NULL,
  engagement_id  TEXT REFERENCES engagements(id) ON DELETE SET NULL,
  justification  TEXT NOT NULL,
  status         "AccessRequestStatus" NOT NULL DEFAULT 'open',
  decided_by     TEXT,
  decided_at     TIMESTAMPTZ,
  decision_notes TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX access_requests_tenant_idx ON access_requests(tenant_id, status);
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON access_requests USING (tenant_id = current_setting('app.tenant_id', true));

CREATE TABLE access_reviews (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  title         TEXT NOT NULL,
  snapshot      JSONB NOT NULL,                 -- [{ user_id, email, role, display_name, last_login_at, disabled }]
  decisions     JSONB NOT NULL DEFAULT '[]',    -- [{ user_id, decision: keep|remove|change_role, note, by, at }]
  status        TEXT NOT NULL DEFAULT 'open',   -- open | completed
  started_by    TEXT NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_by  TEXT,
  completed_at  TIMESTAMPTZ
);
CREATE INDEX access_reviews_tenant_idx ON access_reviews(tenant_id, status);
ALTER TABLE access_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON access_reviews USING (tenant_id = current_setting('app.tenant_id', true));

CREATE TYPE "SystemKind" AS ENUM ('system', 'environment', 'infrastructure', 'cloud_resource');
CREATE TABLE systems (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  engagement_id   TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  kind            "SystemKind" NOT NULL DEFAULT 'system',
  environment     TEXT,                         -- production | test | development
  hosting         TEXT,                         -- gcc_high | azure_government | on_premises | saas | other
  description     TEXT,
  owner           TEXT,
  handles_cui     BOOLEAN NOT NULL DEFAULT false,
  scope_asset_id  TEXT REFERENCES scope_assets(id) ON DELETE SET NULL,
  attributes      JSONB,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX systems_engagement_idx ON systems(engagement_id, kind);
ALTER TABLE systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE systems FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON systems USING (tenant_id = current_setting('app.tenant_id', true));
