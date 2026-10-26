-- Migration: 010_ces_shared_governed (Sprint 1 S1.1, Aavya 2026-10-24)
--
-- Governed editing of CES-Shared content (doc 26 D1 "governed edits"):
--   requirement metadata, evidence archetypes, requirement-to-evidence mappings
--   and evaluation rules. The 110 requirements, their text and the DoD SPRS
--   weights are NOT stored here: they stay in ces-shared JSON (PRD SH-FR-04) and
--   are served read-only.
--
-- shared_items: one row per version of an item. Status draft -> published ->

-- S1.8 (doc 28, decision D4 + D-6): engagement details the Home / Portfolio
-- dashboard and the engagement screens need, and engagement milestones.
-- Existing rows keep working: every new engagement column is optional except
-- status, which defaults to 'planned'.

ALTER TABLE engagements ADD COLUMN name          TEXT;
ALTER TABLE engagements ADD COLUMN reference_id  TEXT;
ALTER TABLE engagements ADD COLUMN cmmc_level    SMALLINT;
ALTER TABLE engagements ADD COLUMN status        TEXT NOT NULL DEFAULT 'planned';
ALTER TABLE engagements ADD COLUMN start_date    DATE;
ALTER TABLE engagements ADD COLUMN target_date   DATE;
ALTER TABLE engagements ADD COLUMN updated_at    TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE engagements ADD CONSTRAINT engagements_cmmc_level_check CHECK (cmmc_level IS NULL OR cmmc_level IN (1, 2));
ALTER TABLE engagements ADD CONSTRAINT engagements_status_check CHECK (status IN ('planned', 'in_progress', 'on_hold', 'closed'));
ALTER TABLE engagements ADD CONSTRAINT engagements_dates_check CHECK (start_date IS NULL OR target_date IS NULL OR target_date >= start_date);

CREATE TABLE engagement_milestones (
  id            TEXT PRIMARY KEY,
  tenant_id     TEXT NOT NULL REFERENCES tenants(id),
  engagement_id TEXT NOT NULL REFERENCES engagements(id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (length(trim(name)) > 0),
  due_date      DATE NOT NULL,
  completed_at  TIMESTAMPTZ,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX engagement_milestones_engagement_idx ON engagement_milestones (engagement_id, due_date);

-- Tenant isolation, as on parties (004): fail-closed when app.tenant_id is unset.
ALTER TABLE engagement_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_milestones FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON engagement_milestones
  USING (tenant_id = current_setting('app.tenant_id', true));
