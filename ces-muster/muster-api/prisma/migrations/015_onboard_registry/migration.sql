-- 015_onboard_registry — Sprint 3 slice "Onboard" (S3-DB-01/03, 2026-11-10).
-- Organisation master data, customer Microsoft 365 tenant registrations and the
-- compliance scope (assets by CMMC category + versioned CUI boundary) for the
-- unified lifecycle UI. Tenant-isolated like parties (RLS, fail-closed).

CREATE TYPE "CustomerCloud" AS ENUM ('gcc_high', 'gcc', 'commercial');
CREATE TYPE "CustomerTenantStatus" AS ENUM ('registered', 'consented', 'live_enabled', 'disabled');
CREATE TYPE "ScopeCategory" AS ENUM ('cui', 'security_protection', 'contractor_risk_managed', 'specialized', 'out_of_scope');
CREATE TYPE "BoundaryStatus" AS ENUM ('draft', 'confirmed', 'superseded');

CREATE TABLE organizations (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  legal_name    TEXT NOT NULL,
  dba_name      TEXT,
  uei           TEXT,
  cage          TEXT,
  website       TEXT,
  address       TEXT,
  primary_contact_name  TEXT,
  primary_contact_email TEXT,
  contract_clauses      TEXT[] NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'active',
  notes         TEXT,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX organizations_tenant_id_idx ON organizations(tenant_id);
CREATE UNIQUE INDEX organizations_tenant_legal_name_key ON organizations(tenant_id, legal_name);
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON organizations USING (tenant_id = current_setting('app.tenant_id', true));

CREATE TABLE customer_tenants (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  display_name    TEXT NOT NULL,
  entra_tenant_id TEXT,
  primary_domain  TEXT,
  cloud           "CustomerCloud" NOT NULL DEFAULT 'gcc_high',
  app_registration_id TEXT,
  certificate_thumbprint TEXT,
  status          "CustomerTenantStatus" NOT NULL DEFAULT 'registered',
  connection_status      TEXT,
  connection_tested_at   TIMESTAMPTZ,
  notes           TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX customer_tenants_tenant_id_idx ON customer_tenants(tenant_id);
CREATE INDEX customer_tenants_organization_id_idx ON customer_tenants(organization_id);
ALTER TABLE customer_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON customer_tenants USING (tenant_id = current_setting('app.tenant_id', true));

CREATE TABLE scope_assets (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  asset_type    TEXT NOT NULL,
  category      "ScopeCategory" NOT NULL,
  location      TEXT,
  owner         TEXT,
  external_provider BOOLEAN NOT NULL DEFAULT false,
  notes         TEXT,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX scope_assets_engagement_id_idx ON scope_assets(engagement_id);
ALTER TABLE scope_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE scope_assets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON scope_assets USING (tenant_id = current_setting('app.tenant_id', true));

CREATE TABLE scope_boundaries (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  status        "BoundaryStatus" NOT NULL DEFAULT 'draft',
  narrative     TEXT,
  data_flows    JSONB,
  asset_count   INTEGER NOT NULL DEFAULT 0,
  confirmed_by  TEXT,
  confirmed_at  TIMESTAMPTZ,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX scope_boundaries_engagement_version_key ON scope_boundaries(engagement_id, version);
ALTER TABLE scope_boundaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE scope_boundaries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON scope_boundaries USING (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE parties ADD COLUMN organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL;
