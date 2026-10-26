// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// MG-06 — the API refuses to start as a role that would bypass RLS.
import { describe, it, expect } from 'vitest';
import { checkDbRole, assertSafeDbRole, type RoleQueryClient, type DbRoleRow } from '../src/lib/dbRoleGuard.js';

const client = (rows: DbRoleRow[] | Error): RoleQueryClient => ({
  $queryRaw: (async () => {
    if (rows instanceof Error) throw rows;
    return rows;
  }) as RoleQueryClient['$queryRaw'],
});

describe('MG-06 DB role guard', () => {
  it('accepts a least-privilege role', async () => {
    const r = await checkDbRole(client([{ role: 'muster_app', rolsuper: false, rolbypassrls: false }]));
    expect(r).toEqual({ ok: true, role: 'muster_app' });
    await expect(assertSafeDbRole(client([{ role: 'muster_app', rolsuper: false, rolbypassrls: false }]))).resolves.toBe('muster_app');
  });

  it('refuses a superuser (e.g. postgres)', async () => {
    const r = await checkDbRole(client([{ role: 'postgres', rolsuper: true, rolbypassrls: true }]));
    expect(r).toMatchObject({ ok: false, reason: 'superuser', role: 'postgres' });
    await expect(assertSafeDbRole(client([{ role: 'postgres', rolsuper: true, rolbypassrls: true }]))).rejects.toThrow(/refuses to start \(superuser\)/);
  });

  it('refuses a non-superuser with BYPASSRLS', async () => {
    const r = await checkDbRole(client([{ role: 'ops', rolsuper: false, rolbypassrls: true }]));
    expect(r).toMatchObject({ ok: false, reason: 'bypassrls' });
  });

  it('fails closed when the role row is missing', async () => {
    expect(await checkDbRole(client([]))).toMatchObject({ ok: false, reason: 'role-not-found' });
  });

  it('fails closed when the check cannot run (DB down, engine missing)', async () => {
    const r = await checkDbRole(client(new Error('connect ECONNREFUSED')));
    expect(r).toMatchObject({ ok: false, reason: 'check-failed' });
    await expect(assertSafeDbRole(client(new Error('x')))).rejects.toThrow(/check-failed/);
  });
});
