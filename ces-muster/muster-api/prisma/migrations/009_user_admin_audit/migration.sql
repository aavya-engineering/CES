-- Migration: 009_user_admin_audit (RBAC-01, Aavya 2026-10-24)
--
-- 1. User administration fields. users has no RLS (001_init); user management
--    is limited to platform_admin in the API.
-- 2. audit_events: append-only log of sign-ins, user and role changes
--    (NIST SP 800-171 3.3.1, 3.3.8; BHD role review PB-10). UPDATE and DELETE
--    are refused by a trigger, so the app role cannot rewrite history.

ALTER TABLE users ADD COLUMN display_name          TEXT;
ALTER TABLE users ADD COLUMN disabled_at           TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN must_change_password  BOOLEAN     NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN password_changed_at   TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN last_login_at         TIMESTAMPTZ;

CREATE TABLE audit_events (
  id             TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id  TEXT,
  actor_role     TEXT,
  action         TEXT        NOT NULL,
  target_type    TEXT,
  target_id      TEXT,
  tenant_id      TEXT,
  detail         JSONB
);
CREATE INDEX audit_events_at_idx ON audit_events (at DESC);

CREATE FUNCTION audit_events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
