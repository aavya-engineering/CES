// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// RBAC-01: the permission catalogue (src/lib/permissions.ts) must match what
// the routes enforce. For every permission, one real route is called with a
// token for every role: a role in the catalogue must NOT get 403; a role not
// in it MUST get 403. If someone edits a requireRole list or the catalogue
// alone, this fails.
//
// Also: the platform-admin fence refuses platform_admin on every customer
// route, including one guarded only by bearerAuth (POST /api/sprs/score).
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'node:http';
import { createFakeUsersDb } from './support/fakeUsersDb.js';

// Customer-data models are not needed: allowed calls may fail later (400/404/500)
// — the test only asks whether authorization let them through.
const fake = createFakeUsersDb();
vi.mock('../src/lib/prisma.js', () => ({
  db: new Proxy(fake as unknown as Record<string, unknown>, {
    get(target, prop) {
      if (prop in target) return target[prop as string];
      return new Proxy({}, { get: () => async () => { throw new Error('not modelled in this test'); } });
    },
  }),
  withTenant: vi.fn(async () => { throw new Error('not modelled in this test'); }),
}));

const { createApp } = await import('../src/app.js');
const { mintToken } = await import('../src/lib/jwt.js');
const { PERMISSIONS, ROLES, permissionsFor } = await import('../src/lib/permissions.js');

const PROBES: Record<string, { method: string; path: string; body?: unknown }> = {
  'users.manage': { method: 'GET', path: '/api/users' },
  'audit.read': { method: 'GET', path: '/api/audit-events' },
  'engagements.read': { method: 'GET', path: '/api/engagements' },
  'engagements.create': { method: 'POST', path: '/api/engagements', body: {} },
  'portfolio.read': { method: 'GET', path: '/api/portfolio' },
  'interview.answer': { method: 'POST', path: '/api/interview/retro-confidence', body: {} },
  'sessions.read': { method: 'GET', path: '/api/sessions/probe' },
  'review.queue': { method: 'POST', path: '/api/hil/queue/probe/resolve', body: {} },
  'discovery.run': { method: 'POST', path: '/api/discovery/run', body: { not: 'valid' } },
  'live.enable': { method: 'PUT', path: '/api/live/engagements/probe/access', body: {} },
  'live.consent': { method: 'POST', path: '/api/live/engagements/probe/consent', body: {} },
  'plan.push': { method: 'POST', path: '/api/plan/push', body: {} },
  'plan.status': { method: 'GET', path: '/api/plan/status' },
  'plan.results': { method: 'POST', path: '/api/plan/results', body: {} },
  'contracts.read': { method: 'GET', path: '/api/contracts' },
  'contracts.manage': { method: 'POST', path: '/api/contracts', body: {} },
  'delivery.manage': { method: 'POST', path: '/api/delivery/artifacts', body: {} },
  'nudges.manage': { method: 'POST', path: '/api/nudges/tick', body: { not: 'valid' } },
  'shared.read': { method: 'GET', path: '/api/v1/ces-shared/families' },
  'shared.edit': { method: 'POST', path: '/api/v1/ces-shared/items/archetype', body: {} },
  'shared.approve': { method: 'POST', path: '/api/v1/ces-shared/items/archetype/EMX-PROBE-001/publish', body: {} },
};

let server: http.Server;
let base: string;

beforeAll(() => {
  process.env.CES_PIPELINE_ROOT ??= '/nonexistent-ces-pipeline-root-for-rbac-test';
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => server?.close());

async function status(role: string, probe: { method: string; path: string; body?: unknown }) {
  const token = mintToken({ sub: `u-${role}`, tenant_id: 't-probe', party_id: null, role });
  const res = await fetch(`${base}${probe.path}`, {
    method: probe.method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(probe.body !== undefined ? { body: JSON.stringify(probe.body) } : {}),
  });
  await res.text();
  return res.status;
}

describe('RBAC-01: catalogue matches the enforced routes', () => {
  test('every permission has a probe', () => {
    expect(Object.keys(PROBES).sort()).toEqual(PERMISSIONS.map((p) => p.id).sort());
  });

  for (const perm of PERMISSIONS) {
    for (const role of ROLES) {
      const allowed = (perm.roles as readonly string[]).includes(role);
      test(`${perm.id} · ${role} → ${allowed ? 'allowed' : '403'}`, async () => {
        const s = await status(role, PROBES[perm.id]);
        if (allowed) expect(s).not.toBe(403);
        else expect(s).toBe(403);
      });
    }
  }
});

describe('RBAC-01: platform administrator fence', () => {
  test('platform_admin is refused on a route guarded only by bearerAuth', async () => {
    const token = mintToken({ sub: 'pa', tenant_id: 't', party_id: null, role: 'platform_admin' });
    const res = await fetch(`${base}/api/sprs/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}',
    });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('PLATFORM_ADMIN_FENCED');
  });

  test('the same route still works for other roles (fence is role-specific)', async () => {
    const token = mintToken({ sub: 'op', tenant_id: 't', party_id: null, role: 'bhd_operator' });
    const res = await fetch(`${base}/api/sprs/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: '{}',
    });
    expect(res.status).not.toBe(403);
  });

  test('platform_admin holds only administration and CES-Shared permissions', () => {
    expect(permissionsFor('platform_admin').sort()).toEqual(['audit.read', 'portfolio.read', 'shared.approve', 'shared.edit', 'shared.read', 'users.manage']);
  });

  test('GET /auth/me lists the caller’s permissions; GET /auth/roles lists the catalogue', async () => {
    const token = mintToken({ sub: 'op', tenant_id: 't', party_id: null, role: 'bhd_operator' });
    const me = await (await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })).json();
    expect(me.role).toBe('bhd_operator');
    expect(me.permissions).toContain('live.enable');
    expect(me.permissions).not.toContain('users.manage');
    const roles = await (await fetch(`${base}/auth/roles`, { headers: { Authorization: `Bearer ${token}` } })).json();
    expect(roles.roles.map((r: { id: string }) => r.id)).toEqual([...ROLES]);
    expect(roles.permissions.length).toBe(PERMISSIONS.length);
  });
});
