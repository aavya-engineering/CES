// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.


// MG-06 — the API must never run as a role that skips row-level security.
// Migration 001 grants `postgres` BYPASSRLS, and every tenant-scoped table
// relies on RLS (withTenant) for isolation. If DATABASE_URL points at a
// superuser or a BYPASSRLS role, isolation silently disappears, so the server
// refuses to start. Fail closed: if the role cannot be checked, it refuses too.

export interface DbRoleRow {
  role: string;
  rolsuper: boolean;
  rolbypassrls: boolean;
}

export type DbRoleCheck =
  | { ok: true; role: string }
  | { ok: false; role?: string; reason: 'superuser' | 'bypassrls' | 'role-not-found' | 'check-failed'; detail: string };

/** Minimal client surface (PrismaClient satisfies it; tests pass a stub). */
export interface RoleQueryClient {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

export async function checkDbRole(client: RoleQueryClient): Promise<DbRoleCheck> {
  let rows: DbRoleRow[];
  try {
    rows = await client.$queryRaw<DbRoleRow[]>`
      SELECT current_user::text AS role, r.rolsuper, r.rolbypassrls
      FROM pg_roles r WHERE r.rolname = current_user`;
  } catch (e) {
    return { ok: false, reason: 'check-failed', detail: e instanceof Error ? e.message : String(e) };
  }
  const row = rows?.[0];
  if (!row) return { ok: false, reason: 'role-not-found', detail: 'current_user has no pg_roles row' };
  if (row.rolsuper) {
    return { ok: false, role: row.role, reason: 'superuser', detail: `role "${row.role}" is a superuser (bypasses RLS)` };
  }
  if (row.rolbypassrls) {
    return { ok: false, role: row.role, reason: 'bypassrls', detail: `role "${row.role}" has BYPASSRLS` };
  }
  return { ok: true, role: row.role };
}

/** Throws with a named reason when the connection role would bypass RLS. */
export async function assertSafeDbRole(client: RoleQueryClient): Promise<string> {
  const r = await checkDbRole(client);
  if (!r.ok) {
    throw new Error(
      `muster-api refuses to start (${r.reason}): ${r.detail}. ` +
        'Connect DATABASE_URL as the least-privilege app role (see scripts/bootstrap-app-role.sql), never as postgres.'
    );
  }
  return r.role;
}
