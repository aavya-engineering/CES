-- 014_platform_roles — Sprint 1 Foundation (S1-DB-02, 2026-11-10).
-- Adds the five PLATFORM roles of the unified lifecycle UI to the Role enum.
-- The five engine roles stay; a platform role inherits engine roles in
-- muster-api/src/lib/permissions.ts (ROLE_INHERITS), so no route changes.
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block on older
-- PostgreSQL; Prisma runs each migration file in its own transaction on PG 12+,
-- where this is allowed. Values are append-only and never removed.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'org_admin';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'compliance_manager';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'it_security_admin';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'evidence_reviewer';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'senior_approver';
