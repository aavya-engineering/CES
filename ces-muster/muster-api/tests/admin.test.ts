// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// admin.test.ts — Administration (settings, access requests / reviews, health)
// and Onboard leftovers (systems registry, onboarding checklist).

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import express from 'express';
import { createAdminRouter } from '../src/routes/admin.js';
import { createOnboardChecklistRouter, createSystemsRouter } from '../src/routes/systems.js';
import { mintToken } from '../src/lib/jwt.js';
import { createMockDb } from './helpers/mockDb.js';

const TENANT_A = '00000000-aaaa-0000-0000-000000000001';
const ENG_A = '00000000-0000-aaaa-0000-000000000001';
let db: ReturnType<typeof createMockDb>;
let server: http.Server;
let base: string;
const H = (role: string, sub = `${role}-1`) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${mintToken({ sub, tenant_id: TENANT_A, party_id: null, role })}` });
const call = (method: string, path: string, role: string, body?: unknown, sub?: string) => fetch(`${base}${path}`, { method, headers: H(role, sub), body: body === undefined ? undefined : JSON.stringify(body) });

beforeAll(async () => {
  db = createMockDb();
  (db as unknown as { $queryRaw: () => Promise<unknown[]> }).$queryRaw = async () => [{ '?column?': 1 }];
  const app = express();
  app.use(express.json());
  app.use('/api/admin', createAdminRouter(db));
  app.use('/api/engagements/:engagementId/systems', createSystemsRouter(db));
  app.use('/api/engagements/:engagementId/onboard', createOnboardChecklistRouter(db));
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, () => r()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(async () => {
  for (const m of ['tenantSettings', 'accessRequest', 'accessReview', 'systemRecord', 'user', 'organization', 'customerTenant', 'party', 'contract', 'scopeAsset', 'scopeBoundary', 'monitorSnapshot', 'auditEvent', 'engagement'] as const) db[m]._records.length = 0;
  await db.engagement.create({ data: { id: ENG_A, tenant_id: TENANT_A, engagement_kind: 'prime_only', name: 'Contoso L2', cmmc_level: 2, target_date: new Date('2027-03-01'), live_access_enabled: false, live_access_set_at: null } });
  await db.user.create({ data: { id: 'org_admin-1', tenant_id: TENANT_A, email: 'admin@contoso.com', role: 'org_admin', password_hash: 'x' } });
  await db.user.create({ data: { id: 'cis-1', tenant_id: TENANT_A, email: 'cis@contoso.com', role: 'it_security_admin', password_hash: 'x', last_login_at: new Date() } });
  await db.user.create({ data: { id: 'cm-1', tenant_id: TENANT_A, email: 'cm@contoso.com', role: 'compliance_manager', password_hash: 'x' } });
});

describe('settings', () => {
  it('defaults merge, org_admin saves a section (versioned, audited), evidence reviewer cannot', async () => {
    const d = await (await call('GET', '/api/admin/settings', 'it_security_admin')).json();
    expect(d.system.monitoring_cadence_hours).toBe(24);
    expect(d.version).toBe(0);
    expect(d.editable).toBe(false);
    expect((await call('PUT', '/api/admin/settings', 'it_security_admin', { system: { monitoring_cadence_hours: 6 } })).status).toBe(403);
    expect((await call('PUT', '/api/admin/settings', 'org_admin', { system: { monitoring_cadence_hours: 0 } })).status).toBe(422);
    const saved = await (await call('PUT', '/api/admin/settings', 'org_admin', { system: { monitoring_cadence_hours: 6 }, notifications: { recipients: ['ciso@contoso.com'] } })).json();
    expect(saved.version).toBe(1);
    const again = await (await call('PUT', '/api/admin/settings', 'org_admin', { retention: { evidence_days: 2000 } })).json();
    expect(again.version).toBe(2);
    expect(again.system.monitoring_cadence_hours).toBe(6); // earlier section kept
    const read = await (await call('GET', '/api/admin/settings', 'org_admin')).json();
    expect(read.retention.evidence_days).toBe(2000);
    expect(read.retention.audit_days).toBe(2555); // default still filled
    expect(db.auditEvent._records.filter((a) => a.action === 'settings.update')).toHaveLength(2);
  });
});

describe('access requests and reviews', () => {
  it('a request is decided by a different org admin; platform_admin is not requestable; the note says who sets the role', async () => {
    expect((await call('POST', '/api/admin/access/requests', 'it_security_admin', { subject_email: 'new@contoso.com', requested_role: 'platform_admin', justification: 'wants everything' })).status).toBe(422);
    const q = await (await call('POST', '/api/admin/access/requests', 'it_security_admin', { subject_email: 'new@contoso.com', requested_role: 'evidence_reviewer', justification: 'Joins the compliance team as reviewer' }, 'cis-1')).json();
    expect(q.status).toBe('open');
    expect((await call('POST', `/api/admin/access/requests/${q.id}/decide`, 'it_security_admin', { decision: 'approved', notes: 'self-approval attempt' }, 'cis-1')).status).toBe(403);
    const d = await (await call('POST', `/api/admin/access/requests/${q.id}/decide`, 'org_admin', { decision: 'approved', notes: 'Approved by CISO' })).json();
    expect(d.status).toBe('approved');
    expect(d.note).toMatch(/Access management/);
    const list = await (await call('GET', '/api/admin/access/requests', 'sub')).json();
    expect(list).toHaveLength(1);
  });

  it('an access review snapshots users, needs every other user attested (never yourself), then completes', async () => {
    const users = await (await call('GET', '/api/admin/access/users', 'compliance_manager')).json();
    expect(users).toHaveLength(3);
    expect(users[0].password_hash).toBeUndefined();
    const rv = await (await call('POST', '/api/admin/access/reviews', 'org_admin', { title: 'Q4 2026 access review' })).json();
    expect(rv.snapshot).toHaveLength(3);
    expect((await (await call('POST', `/api/admin/access/reviews/${rv.id}/decide`, 'org_admin', { user_id: 'org_admin-1', decision: 'keep' })).json()).code).toBe('SOD_SAME_PERSON');
    expect((await call('POST', `/api/admin/access/reviews/${rv.id}/complete`, 'org_admin')).status).toBe(409);
    await call('POST', `/api/admin/access/reviews/${rv.id}/decide`, 'org_admin', { user_id: 'cis-1', decision: 'keep' });
    await call('POST', `/api/admin/access/reviews/${rv.id}/decide`, 'org_admin', { user_id: 'cm-1', decision: 'change_role', note: 'Now senior approver' });
    const stillOpen = await (await call('POST', `/api/admin/access/reviews/${rv.id}/complete`, 'org_admin')).json();
    expect(stillOpen.code).toBe('REVIEW_INCOMPLETE'); // the completer's own account is not attested yet
    expect(stillOpen.error).toMatch(/your own account/);
    await call('POST', `/api/admin/access/reviews/${rv.id}/decide`, 'bhd_operator', { user_id: 'org_admin-1', decision: 'keep' }); // BHD attests the admin
    const done = await (await call('POST', `/api/admin/access/reviews/${rv.id}/complete`, 'org_admin')).json();
    expect(done.status).toBe('completed');
    expect(done.decisions).toHaveLength(3);
    expect(db.auditEvent._records.filter((a) => a.action === 'access.review.decide')).toHaveLength(3);
    expect((await call('POST', `/api/admin/access/reviews/${rv.id}/decide`, 'org_admin', { user_id: 'cis-1', decision: 'remove' })).status).toBe(409);
  });
});

describe('health, systems, onboarding checklist', () => {
  it('health reports db, records and integrations', async () => {
    const h = await (await call('GET', '/api/admin/health', 'sub')).json();
    expect(h.database.status).toBe('ok');
    expect(h.records.engagements).toBe(1);
    expect(h.integrations.find((i: { id: string }) => i.id === 'tenant_runner').status).toBe('not_wired');
    expect(h.integrations.find((i: { id: string }) => i.id === 'stamper_registry').note).toMatch(/223 entries/);
  });

  it('systems CRUD with scope-asset link and the onboarding checklist', async () => {
    const asset = await db.scopeAsset.create({ data: { tenant_id: TENANT_A, engagement_id: ENG_A, name: 'FS-01', asset_type: 'file server', category: 'cui' } });
    expect((await call('POST', `/api/engagements/${ENG_A}/systems`, 'prime', { name: 'x', scope_asset_id: '00000000-0000-0000-0000-000000000099' })).status).toBe(422);
    const s = await (await call('POST', `/api/engagements/${ENG_A}/systems`, 'it_security_admin', { name: 'File services', kind: 'system', environment: 'production', hosting: 'gcc_high', handles_cui: true, scope_asset_id: asset.id as string })).json();
    expect(s.handles_cui).toBe(true);
    await call('PATCH', `/api/engagements/${ENG_A}/systems/${s.id}`, 'prime', { owner: 'IT' });
    expect((await (await call('GET', `/api/engagements/${ENG_A}/systems`, 'assessor_read_only')).json())[0].owner).toBe('IT');
    const before = await (await call('GET', `/api/engagements/${ENG_A}/onboard/checklist`, 'prime')).json();
    expect(before.sections).toHaveLength(3);
    expect(before.sections[2].items.find((i: { id: string }) => i.id === 'systems').ok).toBe(true);
    expect(before.sections[0].items.find((i: { id: string }) => i.id === 'org').ok).toBe(false);
    expect(before.sections[0].items.find((i: { id: string }) => i.id === 'roles').ok).toBe(true);
    expect(before.ready).toBe(false);
    expect((await call('DELETE', `/api/engagements/${ENG_A}/systems/${s.id}`, 'evidence_reviewer')).status).toBe(403);
    expect((await call('DELETE', `/api/engagements/${ENG_A}/systems/${s.id}`, 'prime')).status).toBe(204);
  });
});

describe('org-scoped user administration', () => {
  it('org_admin creates / changes / resets accounts in its own tenant only, never platform or BHD roles; SoD and last-admin guards; fulfils an approved request', async () => {
    expect((await call('POST', '/api/admin/access/users', 'compliance_manager', { email: 'x@contoso.com', role: 'evidence_reviewer' })).status).toBe(403);
    expect((await call('POST', '/api/admin/access/users', 'org_admin', { email: 'x@contoso.com', role: 'platform_admin' })).status).toBe(422);
    expect((await call('POST', '/api/admin/access/users', 'org_admin', { email: 'x@contoso.com', role: 'bhd_operator' })).status).toBe(422);
    const q = await (await call('POST', '/api/admin/access/requests', 'it_security_admin', { subject_email: 'new@contoso.com', requested_role: 'evidence_reviewer', justification: 'Joins the compliance team as reviewer' }, 'cis-1')).json();
    expect((await call('POST', '/api/admin/access/users', 'org_admin', { email: 'new@contoso.com', role: 'evidence_reviewer', access_request_id: q.id })).status).toBe(409); // not approved yet
    await call('POST', `/api/admin/access/requests/${q.id}/decide`, 'org_admin', { decision: 'approved', notes: 'Approved by CISO' });
    expect((await call('POST', '/api/admin/access/users', 'org_admin', { email: 'new@contoso.com', role: 'senior_approver', access_request_id: q.id })).status).toBe(409); // role must match
    const made = await (await call('POST', '/api/admin/access/users', 'org_admin', { email: 'new@contoso.com', display_name: 'New Reviewer', role: 'evidence_reviewer', access_request_id: q.id })).json();
    expect(made.user).toMatchObject({ email: 'new@contoso.com', role: 'evidence_reviewer' });
    expect(made.temporary_password).toHaveLength(made.temporary_password.length); // returned once
    expect(made.user.password_hash).toBeUndefined();
    expect(db.accessRequest._records[0].status).toBe('fulfilled');
    expect(db.user._records.find((u) => u.email === 'new@contoso.com')!.tenant_id).toBe(TENANT_A);
    expect((await call('POST', '/api/admin/access/users', 'org_admin', { email: 'new@contoso.com', role: 'evidence_reviewer' })).status).toBe(409); // EMAIL_TAKEN
    // change role, disable; guards
    const changed = await (await call('PATCH', `/api/admin/access/users/${made.user.id}`, 'org_admin', { role: 'senior_approver' })).json();
    expect(changed.role).toBe('senior_approver');
    expect((await (await call('PATCH', '/api/admin/access/users/org_admin-1', 'org_admin', { disabled: true })).json()).code).toBe('SOD_SAME_PERSON');
    expect((await (await call('PATCH', '/api/admin/access/users/org_admin-1', 'bhd_operator', { role: 'compliance_manager' })).json()).code).toBe('LAST_ORG_ADMIN');
    await db.user.create({ data: { id: 'pa-1', tenant_id: TENANT_A, email: 'pa@contoso.com', role: 'platform_admin', password_hash: 'x' } });
    expect((await call('PATCH', '/api/admin/access/users/pa-1', 'org_admin', { disabled: true })).status).toBe(403); // NOT_ORG_SCOPED
    await db.user.create({ data: { id: 'other-1', tenant_id: '00000000-aaaa-0000-0000-000000000002', email: 'o@fabrikam.com', role: 'org_admin', password_hash: 'x' } });
    expect((await call('PATCH', '/api/admin/access/users/other-1', 'org_admin', { disabled: true })).status).toBe(404); // other tenant invisible
    const reset = await (await call('POST', `/api/admin/access/users/${made.user.id}/reset-password`, 'org_admin')).json();
    expect(reset.temporary_password).toBeTruthy();
    expect(db.auditEvent._records.map((a) => a.action)).toEqual(expect.arrayContaining(['user.created', 'user.role_changed', 'user.password_reset']));
  });
});
