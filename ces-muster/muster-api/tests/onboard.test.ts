// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// onboard.test.ts — Sprint 3 slice "Onboard": organisations, customer tenant
// registrations and the compliance scope. RBAC (read vs write roles, platform
// roles by inheritance), tenant isolation, validation, audit rows and the
// boundary confirm rules.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import express from 'express';
import { createOrganizationsRouter, createCustomerTenantsRouter, createScopeRouter } from '../src/routes/onboard.js';
import { mintToken } from '../src/lib/jwt.js';
import { createMockDb } from './helpers/mockDb.js';

const TENANT_A = '00000000-aaaa-0000-0000-000000000001';
const TENANT_B = '00000000-bbbb-0000-0000-000000000002';
const ENG_A = '00000000-0000-aaaa-0000-000000000001';
const ENG_B = '00000000-0000-bbbb-0000-000000000002';

let db: ReturnType<typeof createMockDb>;
let server: http.Server;
let base: string;

const token = (role: string, tenant = TENANT_A) => mintToken({ sub: `${role}-1`, tenant_id: tenant, party_id: null, role });
const H = (role: string, tenant = TENANT_A) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token(role, tenant)}` });
const call = (method: string, path: string, role: string, body?: unknown, tenant = TENANT_A) =>
  fetch(`${base}${path}`, { method, headers: H(role, tenant), body: body === undefined ? undefined : JSON.stringify(body) });

beforeAll(async () => {
  db = createMockDb();
  const app = express();
  app.use(express.json());
  app.use('/api/organizations', createOrganizationsRouter(db));
  app.use('/api/customer-tenants', createCustomerTenantsRouter(db));
  app.use('/api/engagements/:engagementId/scope', createScopeRouter(db));
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, () => r()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(async () => {
  for (const m of ['organization', 'customerTenant', 'scopeAsset', 'scopeBoundary', 'auditEvent', 'engagement'] as const) db[m]._records.length = 0;
  await db.engagement.create({ data: { id: ENG_A, tenant_id: TENANT_A, engagement_kind: 'prime_only' } });
  await db.engagement.create({ data: { id: ENG_B, tenant_id: TENANT_B, engagement_kind: 'prime_only' } });
});

const ORG = { legal_name: 'Contoso Defense LLC', uei: 'ABCDE1234567', cage: '1ABC2', contract_clauses: ['DFARS 252.204-7012', 'DFARS 252.204-7021'] };

describe('organisations', () => {
  it('prime creates, assessor reads, evidence_reviewer cannot write, unauthenticated is 401', async () => {
    const created = await call('POST', '/api/organizations', 'prime', ORG);
    expect(created.status).toBe(201);
    const org = await created.json();
    expect(org.legal_name).toBe(ORG.legal_name);
    expect(org.tenant_id).toBe(TENANT_A);

    expect((await call('GET', '/api/organizations', 'assessor_read_only')).status).toBe(200);
    expect((await call('POST', '/api/organizations', 'evidence_reviewer', { ...ORG, legal_name: 'X Corp' })).status).toBe(403);
    expect((await call('POST', '/api/organizations', 'compliance_manager', { ...ORG, legal_name: 'Y Corp' })).status).toBe(201); // inherits prime
    expect((await fetch(`${base}/api/organizations`)).status).toBe(401);
    expect(db.auditEvent._records.map((r) => r.action)).toEqual(['organization.create', 'organization.create']);
  });

  it('validates UEI/CAGE, rejects duplicate legal names and hides other tenants’ rows', async () => {
    const bad = await call('POST', '/api/organizations', 'prime', { ...ORG, uei: 'short' });
    expect(bad.status).toBe(422);
    expect((await call('POST', '/api/organizations', 'prime', ORG)).status).toBe(201);
    expect((await call('POST', '/api/organizations', 'prime', ORG)).status).toBe(409);
    const other = await (await call('GET', '/api/organizations', 'prime', undefined, TENANT_B)).json();
    expect(other).toEqual([]);
    const id = (await (await call('GET', '/api/organizations', 'prime')).json())[0].id;
    expect((await call('GET', `/api/organizations/${id}`, 'prime', undefined, TENANT_B)).status).toBe(404);
  });

  it('refuses to delete an organisation that still has tenant registrations', async () => {
    const org = await (await call('POST', '/api/organizations', 'bhd_operator', ORG)).json();
    expect((await call('POST', '/api/customer-tenants', 'bhd_operator', { display_name: 'Contoso GCC High', organization_id: org.id })).status).toBe(201);
    expect((await call('DELETE', `/api/organizations/${org.id}`, 'bhd_operator')).status).toBe(409);
    const detail = await (await call('GET', `/api/organizations/${org.id}`, 'prime')).json();
    expect(detail.customer_tenants).toHaveLength(1);
  });
});

describe('customer tenant registrations', () => {
  it('registers with validation, test-connection reports prerequisites without contacting the tenant', async () => {
    expect((await call('POST', '/api/customer-tenants', 'prime', { display_name: 'C', certificate_thumbprint: 'nothex' })).status).toBe(422);
    const t = await (await call('POST', '/api/customer-tenants', 'prime', { display_name: 'Contoso GCC High', primary_domain: 'contoso.onmicrosoft.us', entra_tenant_id: '11111111-1111-1111-1111-111111111111' })).json();
    expect(t.cloud).toBe('gcc_high');
    expect(t.status).toBe('registered');

    const test = await (await call('POST', `/api/customer-tenants/${t.id}/test-connection`, 'bhd_operator')).json();
    expect(test.connection_status).toBe('prerequisites_missing');
    expect(test.checks.find((c: { id: string }) => c.id === 'app_registration').ok).toBe(false);
    expect(test.checks.find((c: { id: string }) => c.id === 'runner').ok).toBe(false);

    await call('PATCH', `/api/customer-tenants/${t.id}`, 'prime', { app_registration_id: '22222222-2222-2222-2222-222222222222', certificate_thumbprint: 'A'.repeat(40) });
    const again = await (await call('POST', `/api/customer-tenants/${t.id}/test-connection`, 'bhd_operator')).json();
    expect(again.connection_status).toBe('prerequisites_complete');
    expect(db.auditEvent._records.filter((r) => r.action === 'customer_tenant.test_connection')).toHaveLength(2);
  });

  it('a live-enabled registration cannot be deleted', async () => {
    const t = await (await call('POST', '/api/customer-tenants', 'prime', { display_name: 'Live', status: 'live_enabled' })).json();
    expect((await call('DELETE', `/api/customer-tenants/${t.id}`, 'prime')).status).toBe(409);
    await call('PATCH', `/api/customer-tenants/${t.id}`, 'prime', { status: 'disabled' });
    expect((await call('DELETE', `/api/customer-tenants/${t.id}`, 'prime')).status).toBe(204);
  });
});

describe('compliance scope', () => {
  const ASSET = { name: 'FS-01', asset_type: 'file_server', category: 'cui' };

  it('assets are per engagement, tenant-checked, and the sub role may read but not write', async () => {
    expect((await call('POST', `/api/engagements/${ENG_B}/scope/assets`, 'prime', ASSET)).status).toBe(404);
    expect((await call('POST', `/api/engagements/${ENG_A}/scope/assets`, 'sub', ASSET)).status).toBe(403);
    expect((await call('POST', `/api/engagements/${ENG_A}/scope/assets`, 'prime', { ...ASSET, category: 'unknown' })).status).toBe(422);
    const a = await (await call('POST', `/api/engagements/${ENG_A}/scope/assets`, 'it_security_admin', ASSET)).json();
    expect(a.category).toBe('cui');
    expect(await (await call('GET', `/api/engagements/${ENG_A}/scope/assets`, 'sub')).json()).toHaveLength(1);
    expect((await call('DELETE', `/api/engagements/${ENG_A}/scope/assets/${a.id}`, 'prime')).status).toBe(204);
  });

  it('boundary: draft → confirm needs assets, is a human act, and supersedes the previous version', async () => {
    const empty = await (await call('POST', `/api/engagements/${ENG_A}/scope/boundaries`, 'prime', { narrative: 'v1' })).json();
    expect(empty.version).toBe(1);
    expect(empty.status).toBe('draft');
    expect((await call('POST', `/api/engagements/${ENG_A}/scope/boundaries/${empty.id}/confirm`, 'prime')).status).toBe(409);

    await call('POST', `/api/engagements/${ENG_A}/scope/assets`, 'prime', ASSET);
    const ok = await (await call('POST', `/api/engagements/${ENG_A}/scope/boundaries/${empty.id}/confirm`, 'prime')).json();
    expect(ok.status).toBe('confirmed');
    expect(ok.confirmed_by).toBe('prime-1');
    expect(ok.asset_count).toBe(1);
    expect((await call('POST', `/api/engagements/${ENG_A}/scope/boundaries/${empty.id}/confirm`, 'prime')).status).toBe(409);

    const v2 = await (await call('POST', `/api/engagements/${ENG_A}/scope/boundaries`, 'prime', {})).json();
    expect(v2.version).toBe(2);
    await call('POST', `/api/engagements/${ENG_A}/scope/boundaries/${v2.id}/confirm`, 'bhd_operator');
    const list = await (await call('GET', `/api/engagements/${ENG_A}/scope/boundaries`, 'assessor_read_only')).json();
    expect(list.map((b: { version: number; status: string }) => [b.version, b.status]).sort()).toEqual([[1, 'superseded'], [2, 'confirmed']]);
    expect(db.auditEvent._records.filter((r) => r.action === 'scope.boundary.confirm')).toHaveLength(2);
  });
});
