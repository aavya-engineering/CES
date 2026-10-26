-- SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
-- SPDX-License-Identifier: LicenseRef-BHD-Proprietary
-- CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
-- Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
-- Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
-- Submitting a change to this repository means you accept TERMS.md.
-- Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
-- See LICENSE and TERMS.md.

-- MG-06 — least-privilege application role for muster-api (resolves B13).
-- Run as a superuser AFTER `prisma migrate deploy` (migrations run as postgres):
--   psql -U postgres -d muster_db -v ON_ERROR_STOP=1 \
--        -v app_password="'<APP_DB_PASSWORD>'" -f scripts/bootstrap-app-role.sql
-- Then set DATABASE_URL=postgresql://muster_app:<APP_DB_PASSWORD>@host:5432/muster_db
-- The API refuses to start if it connects as a superuser or a BYPASSRLS role.
-- Idempotent: safe to re-run after new migrations.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'muster_app') THEN
    CREATE ROLE muster_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

ALTER ROLE muster_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD :app_password;

GRANT CONNECT ON DATABASE muster_db TO muster_app;
GRANT USAGE ON SCHEMA public TO muster_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO muster_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO muster_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO muster_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO muster_app;
-- The app never needs the migration ledger.
REVOKE ALL ON TABLE public._prisma_migrations FROM muster_app;
