// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// S1.9: POST /auth/refresh — an active user swaps a valid token for a fresh
// one; no token, a disabled user or a pending password change get 401.
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'node:http';

const USER = { id: 'u-r1', email: 'op@refresh.test', tenant_id: 't-1', party_id: null, role: 'bhd_operator', display_name: 'Op', disabled_at: null as Date | null, must_change_password: false };
vi.mock('../src/lib/prisma.js', () => ({
  db: { user: { findUnique: vi.fn(async ({ where }: { where: { id: string } }) => (where.id === USER.id ? USER : null)) } },
  withTenant: vi.fn(),
}));
const { createApp } = await import('../src/app.js');
const { mintToken, verifyToken } = await import('../src/lib/jwt.js');

let server: http.Server;
let base: string;
beforeAll(() => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => server?.close());

const refresh = (token?: string) => fetch(`${base}/auth/refresh`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });

describe('POST /auth/refresh', () => {
  test('a valid token gets a fresh token for the same user', async () => {
    const old = mintToken({ sub: USER.id, tenant_id: USER.tenant_id, party_id: null, role: USER.role }, { expiresIn: 60 });
    const res = await refresh(old);
    expect(res.status).toBe(200);
    const claims = verifyToken((await res.json()).token);
    expect(claims).toMatchObject({ sub: USER.id, role: 'bhd_operator', email: USER.email });
    expect(claims.exp! - claims.iat!).toBeGreaterThan(60);
  });
  test('no token, an expired token, a disabled user or a pending password change → 401', async () => {
    expect((await refresh()).status).toBe(401);
    expect((await refresh(mintToken({ sub: USER.id, tenant_id: 't-1', party_id: null, role: USER.role }, { expiresIn: -10 }))).status).toBe(401);
    const t = mintToken({ sub: USER.id, tenant_id: 't-1', party_id: null, role: USER.role });
    USER.disabled_at = new Date();
    expect((await refresh(t)).status).toBe(401);
    USER.disabled_at = null;
    USER.must_change_password = true;
    expect((await refresh(t)).status).toBe(401);
    USER.must_change_password = false;
  });
});
