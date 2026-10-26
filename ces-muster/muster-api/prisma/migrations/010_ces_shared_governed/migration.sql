-- Migration: 010_ces_shared_governed (Sprint 1 S1.1, Aavya 2026-10-24)
--
-- Governed editing of CES-Shared content (doc 26 D1 "governed edits"):
--   requirement metadata, evidence archetypes, requirement-to-evidence mappings
--   and evaluation rules. The 110 requirements, their text and the DoD SPRS
--   weights are NOT stored here: they stay in ces-shared JSON (PRD SH-FR-04) and
--   are served read-only.
--
-- shared_items: one row per version of an item. Status draft -> published ->
--   retired. At most one draft and one published row per item. A published or
--   retired row cannot change its content, and only drafts can be deleted
--   (trigger below), so history is kept at the database layer.
-- shared_changes: append-only change log (NIST SP 800-171 3.3.1, 3.3.8;
--   PRD SH-FR-05). UPDATE and DELETE are refused by a trigger.
--
-- No tenant column: CES-Shared content is reference data shared by every
-- engagement and holds no customer data (SYS-FR-01 applies to runtime rows).

CREATE TABLE shared_items (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  kind          TEXT        NOT NULL CHECK (kind IN ('requirement_meta', 'archetype', 'mapping', 'rule')),
  item_key      TEXT        NOT NULL,
  version       INTEGER     NOT NULL CHECK (version >= 1),
  status        TEXT        NOT NULL CHECK (status IN ('draft', 'published', 'retired')),
  data          JSONB       NOT NULL,
  created_by    TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    TEXT        NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by  TEXT,
  published_at  TIMESTAMPTZ,
  retired_by    TEXT,
  retired_at    TIMESTAMPTZ,
  UNIQUE (kind, item_key, version)
);
CREATE UNIQUE INDEX shared_items_one_draft ON shared_items (kind, item_key) WHERE status = 'draft';
CREATE UNIQUE INDEX shared_items_one_published ON shared_items (kind, item_key) WHERE status = 'published';
CREATE INDEX shared_items_kind_status ON shared_items (kind, status);

CREATE FUNCTION shared_items_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'shared_items: only drafts can be deleted';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status <> 'draft' THEN
    IF NEW.data IS DISTINCT FROM OLD.data OR NEW.version <> OLD.version
       OR NEW.kind <> OLD.kind OR NEW.item_key <> OLD.item_key THEN
      RAISE EXCEPTION 'shared_items: a published or retired version cannot be changed';
    END IF;
    IF NOT (OLD.status = 'published' AND NEW.status = 'retired') THEN
      RAISE EXCEPTION 'shared_items: only published -> retired is allowed after publishing';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shared_items_guard
  BEFORE UPDATE OR DELETE ON shared_items
  FOR EACH ROW EXECUTE FUNCTION shared_items_guard();

CREATE TABLE shared_changes (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id TEXT        NOT NULL,
  actor_role    TEXT,
  action        TEXT        NOT NULL,
  kind          TEXT        NOT NULL,
  item_key      TEXT        NOT NULL,
  version       INTEGER,
  detail        JSONB
);
CREATE INDEX shared_changes_at_idx ON shared_changes (at DESC);
CREATE INDEX shared_changes_item_idx ON shared_changes (kind, item_key);

CREATE FUNCTION shared_changes_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'shared_changes is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shared_changes_no_update_delete
  BEFORE UPDATE OR DELETE ON shared_changes
  FOR EACH ROW EXECUTE FUNCTION shared_changes_append_only();
