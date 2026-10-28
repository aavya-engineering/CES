-- S1.9 (decision D3, demo feedback 2026-10-27): self-service password reset.
-- One row per reset link. Only the SHA-256 of the token is stored, so a
-- database read cannot be turned into a working link. A link works once and
-- for 30 minutes (expires_at); used_at marks it spent.
CREATE TABLE password_resets (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX password_resets_user_idx ON password_resets (user_id);
