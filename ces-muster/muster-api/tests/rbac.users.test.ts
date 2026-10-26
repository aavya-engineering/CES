// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// RBAC-01: user administration and the password lifecycle, through the real
// createApp() with an in-memory user/tenant/audit store.
//   - only platform_admin manages users; others get 403
//   - create returns a temporary password once; no hash ever leaves the API
//   - the user must change it: the temporary token opens only /auth/*
//   - self role change, self disable, last-admin removal are refused
//   - disabled users cannot sign in; every change is audited; an audit failure
//     fails the change
import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import http from 'node:http';
import bcrypt from 'bcryptjs';
import { createFakeUsersDb } from './support/fakeUsersDb.js';

const fake = createFakeUsersDb();
vi.mock('../src/lib/prisma.js', () => ({ db: fake, withTenant: vi.fn() }));

const { createApp } = await import('../src/app.js');
const { mintToken, verifyToken } = await import('../src/lib/jwt.js');
const { resetLoginAttempts } = await import('../src/lib/loginAttempts.js');

let server: http.Server;
let base: string;
let ORG: string;
let ADMIN_ID: string;
const ADMIN_PW = 'admin-password-for-tests';

function tokenFor(id: string, role: string) {
  return mintToken({ sub: id, tenant_id: ORG, party_id: null, role });
}

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, raw: text };
}

beforeAll(async () => {
  const org = await fake.tenant.create({ data: { name: 'Blue Heron Defense' } });
  ORG = org.id;
  const admin = await fake.user.create({
    data: { email: 'admin@bhd.test', role: 'platform_admin', tenant_id: ORG, password_hash: await bcrypt.hash(ADMIN_PW, 4) },
  });
  ADMIN_ID = admin.id;
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => server?.close());
beforeEach(() => {
  resetLoginAttempts();
  fake.setAuditFailure(false);
});

describe('RBAC-01: who may manage users', () => {
  test.each(['bhd_operator', 'prime', 'sub', 'assessor_read_only'])('%s gets 403 on /api/users', async (role) => {
    expect((await call('GET', '/api/users', tokenFor('someone', role))).status).toBe(403);
    expect((await call('POST', '/api/users', tokenFor('someone', role), { email: 'x@y.test', role: 'sub', tenant_id: ORG })).status).toBe(403);
    expect((await call('GET', '/api/audit-events', tokenFor('someone', role))).status).toBe(403);
  });

  test('no token gets 401', async () => {
    expect((await call('GET', '/api/users')).status).toBe(401);
  });

  test('platform_admin lists users without password hashes', async () => {
    const r = await call('GET', '/api/users', tokenFor(ADMIN_ID, 'platform_admin'));
    expect(r.status).toBe(200);
    expect(r.body.users.length).toBeGreaterThan(0);
    expect(r.raw).not.toContain('password_hash');
    expect(r.raw).not.toContain('$2');
    expect(r.body.users[0]).toMatchObject({ email: 'admin@bhd.test', organization: 'Blue Heron Defense', disabled: false });
  });
});

describe('RBAC-01: create → temporary password → forced change', () => {
  test('full lifecycle', async () => {
    const admin = tokenFor(ADMIN_ID, 'platform_admin');
    const created = await call('POST', '/api/users', admin, {
      email: 'IT.Admin@Acme.test',
      display_name: 'Acme IT',
      role: 'sub',
      organization_name: 'Acme Defense LLC',
    });
    expect(created.status).toBe(201);
    expect(created.body.user).toMatchObject({ email: 'it.admin@acme.test', role: 'sub', must_change_password: true, organization: 'Acme Defense LLC' });
    expect(created.raw).not.toContain('password_hash');
    const temp: string = created.body.temporary_password;
    expect(temp).toMatch(/^[A-Za-z2-9]{5}(-[A-Za-z2-9]{5}){3}$/);
    expect(fake.events.map((e) => e.action)).toEqual(expect.arrayContaining(['organization.created', 'user.created']));
    // The temporary password is not in the audit log.
    expect(JSON.stringify(fake.events)).not.toContain(temp);

    // Same email again (any case) → 409.
    expect((await call('POST', '/api/users', admin, { email: 'it.admin@acme.test', role: 'sub', tenant_id: ORG })).status).toBe(409);

    // Sign in with the temporary password: token works only on /auth/*.
    const login = await call('POST', '/auth/login', undefined, { email: 'it.admin@acme.test', password: temp });
    expect(login.status).toBe(200);
    expect(login.body.must_change_password).toBe(true);
    const tempToken: string = login.body.token;
    expect(verifyToken(tempToken).pwd_change_required).toBe(true);
    expect((await call('GET', '/api/engagements', tempToken)).body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await call('GET', '/auth/me', tempToken)).status).toBe(200);

    // Rule checks.
    expect((await call('POST', '/auth/change-password', tempToken, { current_password: 'wrong', new_password: 'a-long-enough-password' })).body.code).toBe('CURRENT_PASSWORD_WRONG');
    expect((await call('POST', '/auth/change-password', tempToken, { current_password: temp, new_password: 'short' })).body.code).toBe('PASSWORD_RULE');
    expect((await call('POST', '/auth/change-password', tempToken, { current_password: temp, new_password: 'it.admin-is-my-password' })).body.code).toBe('PASSWORD_RULE');

    const changed = await call('POST', '/auth/change-password', tempToken, { current_password: temp, new_password: 'correct horse battery staple' });
    expect(changed.status).toBe(200);
    const full = verifyToken(changed.body.token);
    expect(full.pwd_change_required).toBeUndefined();
    expect(full).toMatchObject({ role: 'sub', email: 'it.admin@acme.test', name: 'Acme IT' });
    expect(fake.events.some((e) => e.action === 'user.password_changed')).toBe(true);

    // The old temporary password no longer works; the new one does, without the flag.
    expect((await call('POST', '/auth/login', undefined, { email: 'it.admin@acme.test', password: temp })).status).toBe(401);
    const again = await call('POST', '/auth/login', undefined, { email: 'it.admin@acme.test', password: 'correct horse battery staple' });
    expect(again.body.must_change_password).toBe(false);
  });

  test('bad input: unknown organisation, both / neither organisation fields, unknown role', async () => {
    const admin = tokenFor(ADMIN_ID, 'platform_admin');
    expect((await call('POST', '/api/users', admin, { email: 'a1@x.test', role: 'sub', tenant_id: 'nope' })).body.code).toBe('UNKNOWN_ORGANIZATION');
    expect((await call('POST', '/api/users', admin, { email: 'a2@x.test', role: 'sub' })).status).toBe(400);
    expect((await call('POST', '/api/users', admin, { email: 'a3@x.test', role: 'sub', tenant_id: ORG, organization_name: 'X' })).status).toBe(400);
    expect((await call('POST', '/api/users', admin, { email: 'a4@x.test', role: 'superuser', tenant_id: ORG })).status).toBe(400);
  });
});

describe('RBAC-01: guard rails', () => {
  test('admin cannot change own role, disable self, or reset own password', async () => {
    const admin = tokenFor(ADMIN_ID, 'platform_admin');
    expect((await call('PATCH', `/api/users/${ADMIN_ID}`, admin, { role: 'bhd_operator' })).body.code).toBe('SELF_ROLE_CHANGE');
    expect((await call('PATCH', `/api/users/${ADMIN_ID}`, admin, { disabled: true })).body.code).toBe('SELF_DISABLE');
    expect((await call('POST', `/api/users/${ADMIN_ID}/reset-password`, admin)).body.code).toBe('SELF_RESET');
  });

  test('the last enabled platform admin cannot be demoted or disabled by another admin', async () => {
    const other = await fake.user.create({ data: { email: 'admin2@bhd.test', role: 'platform_admin', tenant_id: ORG, password_hash: 'x', disabled_at: new Date() } });
    // `other` is disabled, so ADMIN is the last enabled admin; `other` acts.
    const r = await call('PATCH', `/api/users/${ADMIN_ID}`, tokenFor(other.id, 'platform_admin'), { disabled: true });
    expect(r.body.code).toBe('LAST_PLATFORM_ADMIN');
  });

  test('disable → sign-in refused with ACCOUNT_DISABLED; enable → works; both audited', async () => {
    const admin = tokenFor(ADMIN_ID, 'platform_admin');
    const u = await fake.user.create({ data: { email: 'op@bhd.test', role: 'bhd_operator', tenant_id: ORG, password_hash: await bcrypt.hash('operator-password-1', 4) } });
    expect((await call('PATCH', `/api/users/${u.id}`, admin, { disabled: true })).body.user.disabled).toBe(true);
    const refused = await call('POST', '/auth/login', undefined, { email: 'op@bhd.test', password: 'operator-password-1' });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('ACCOUNT_DISABLED');
    // A wrong password on a disabled account still gets the generic 401.
    expect((await call('POST', '/auth/login', undefined, { email: 'op@bhd.test', password: 'nope' })).status).toBe(401);
    expect((await call('PATCH', `/api/users/${u.id}`, admin, { disabled: false })).body.user.disabled).toBe(false);
    expect((await call('POST', '/auth/login', undefined, { email: 'op@bhd.test', password: 'operator-password-1' })).status).toBe(200);
    const actions = fake.events.filter((e) => e.target_id === u.id).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['user.disabled', 'auth.login_refused_disabled', 'user.enabled', 'auth.login']));
  });

  test('role change and reset are audited; reset forces a change at next sign-in', async () => {
    const admin = tokenFor(ADMIN_ID, 'platform_admin');
    const u = await fake.user.create({ data: { email: 'p@prime.test', role: 'sub', tenant_id: ORG, password_hash: 'x' } });
    expect((await call('PATCH', `/api/users/${u.id}`, admin, { role: 'prime' })).body.user.role).toBe('prime');
    const reset = await call('POST', `/api/users/${u.id}/reset-password`, admin);
    expect(reset.status).toBe(200);
    const login = await call('POST', '/auth/login', undefined, { email: 'p@prime.test', password: reset.body.temporary_password });
    expect(login.body.must_change_password).toBe(true);
    const ev = fake.events.filter((e) => e.target_id === u.id);
    expect(ev.find((e) => e.action === 'user.role_changed')?.detail).toMatchObject({ from: 'sub', to: 'prime' });
    expect(ev.some((e) => e.action === 'user.password_reset')).toBe(true);
  });

  test('if the audit write fails, the change fails (500) — nothing changes silently', async () => {
    const admin = tokenFor(ADMIN_ID, 'platform_admin');
    fake.setAuditFailure(true);
    const before = fake.users.length;
    const r = await call('POST', '/api/users', admin, { email: 'noaudit@x.test', role: 'sub', tenant_id: ORG });
    expect(r.status).toBe(500);
    // One transaction: the user row is rolled back with the failed audit write.
    expect(fake.users.length).toBe(before);
    expect(fake.users.some((u) => u.email === 'noaudit@x.test')).toBe(false);
  });

  test('audit events are readable by platform_admin, newest first', async () => {
    const r = await call('GET', '/api/audit-events?limit=3', tokenFor(ADMIN_ID, 'platform_admin'));
    expect(r.status).toBe(200);
    expect(r.body.events.length).toBe(3);
    expect(new Date(r.body.events[0].at).getTime()).toBeGreaterThanOrEqual(new Date(r.body.events[2].at).getTime());
  });
});

describe('RBAC-01: browser access', () => {
  test('CORS preflight allows PATCH from the Vite origin (user edits)', async () => {
    const res = await fetch(`${base}/api/users/x`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'PATCH' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-methods')).toContain('PATCH');
  });
});
