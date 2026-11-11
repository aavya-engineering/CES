// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// roleMatrix.test.ts — the platform-role matrix is enforced server-side (review I3).
// The guard sits in app.ts before each lifecycle router and answers 403 ROLE_MATRIX
// before any database access, so these probes need no database.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { mintToken } from '../src/lib/jwt.js';
import { actionFor } from '../src/middleware/auth.js';

const ENG = '00000000-0000-aaaa-0000-000000000001';
const ID = '00000000-0000-bbbb-0000-000000000001';
let server: http.Server; let base: string;
const call = (role: string, method: string, path: string, body?: unknown) => fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mintToken({ sub: `${role}-1`, tenant_id: ENG, party_id: null, role })}` }, body: body === undefined ? undefined : JSON.stringify(body) });
const denied = async (role: string, method: string, path: string, body?: unknown) => { const r = await call(role, method, path, body); const j = await r.json().catch(() => ({})); return r.status === 403 && (j as { code?: string }).code === 'ROLE_MATRIX' ? `${(j as { scope: string }).scope}:${(j as { action: string }).action}` : `passed(${r.status})`; };

beforeAll(async () => { server = createApp().listen(0); await new Promise<void>((r) => server.once('listening', () => r())); base = `http://127.0.0.1:${(server.address() as { port: number }).port}`; });
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('actionFor', () => {
  it('maps method + path to the matrix action', () => {
    expect(actionFor('GET', '/runs')).toBe('view');
    expect(actionFor('POST', '/items')).toBe('edit');
    expect(actionFor('POST', '/runs/x/approve', { approve: [/\/approve$/] })).toBe('approve');
    expect(actionFor('POST', '/evaluate', { execute: [/^\/evaluate$/] })).toBe('execute');
    expect(actionFor('POST', '/nist-catalog/validate', { view: [/\/validate$/] })).toBe('view');
  });
});

describe('platform roles are held to the matrix the UI shows', () => {
  const E = `/api/engagements/${ENG}`;
  it('org_admin: view-only outside Onboard/Admin — cannot execute AdminOps, override results, evaluate monitoring, submit evidence', async () => {
    expect(await denied('org_admin', 'POST', `${E}/remediation/runs`, { module: 'adminops' })).toBe('remediate.adminops:execute');
    expect(await denied('org_admin', 'POST', `${E}/remediation/runs/${ID}/execute`, {})).toBe('remediate.stamper:execute'); // no remediate scope gives org_admin execute
    expect(await denied('org_admin', 'PATCH', `${E}/assessments/${ID}/results/AC.L1-3.1.1`, { status: 'met', reason: 'x' })).toBe('assess:approve');
    expect(await denied('org_admin', 'POST', `${E}/monitor/evaluate`, {})).toBe('monitor:edit');
    expect(await denied('org_admin', 'POST', `${E}/evidence/items`, {})).toBe('evidence:edit');
    expect(await denied('org_admin', 'POST', `${E}/plan/actions`, {})).toBe('plan:edit');
    expect(await denied('org_admin', 'POST', `${E}/scope/boundaries/${ID}/confirm`, {})).toBe('passed(500)'); // onboard: VEA → allowed past the guard (fails later only because no DB here)
  });
  it('evidence_reviewer approves evidence but never edits it; senior_approver approves plan/monitor/adminops, never executes', async () => {
    expect(await denied('evidence_reviewer', 'POST', `${E}/evidence/items`, {})).toBe('evidence:edit');
    expect((await denied('evidence_reviewer', 'POST', `${E}/evidence/items/${ID}/review`, {})).startsWith('passed')).toBe(true);
    expect(await denied('senior_approver', 'POST', `${E}/remediation/runs`, { module: 'adminops' })).toBe('remediate.adminops:execute');
    expect((await denied('senior_approver', 'POST', `${E}/remediation/runs/${ID}/approve`, {})).startsWith('passed')).toBe(true);
    expect(await denied('senior_approver', 'POST', `${E}/monitor/evaluate`, {})).toBe('monitor:edit');
    expect((await denied('compliance_manager', 'POST', `${E}/plan/actions/generate`, {})).startsWith('passed')).toBe(true); // deriving a plan is editing, not executing
  });
  it('Stamper and the runner protocol are BHD-only; customers and assessors never reach them', async () => {
    expect(await denied('it_security_admin', 'POST', `${E}/remediation/runs`, { module: 'stamper' })).toBe('remediate.stamper:execute');
    expect(await denied('compliance_manager', 'GET', `${E}/remediation/runner/queue`)).toBe('remediate.stamper:view');
    expect(await denied('assessor_read_only', 'POST', `${E}/remediation/runs/${ID}/claim`, { runner: 'x' })).toBe('remediate.stamper:execute');
    expect((await denied('bhd_operator', 'GET', `${E}/remediation/runner/queue`)).startsWith('passed')).toBe(true);
  });
  it('assessor_read_only: Prepare view only; nothing in Onboard/Evidence writes', async () => {
    expect(await denied('assessor_read_only', 'POST', `${E}/prepare/packages`, {})).toBe('prepare:edit');
    expect(await denied('assessor_read_only', 'POST', `${E}/evidence/items`, {})).toBe('evidence:edit');
    expect(await denied('assessor_read_only', 'GET', `${E}/scope/assets`)).toBe('onboard:view');
  });
  it('admin: platform_admin all, org_admin edit (not approve), bhd_operator view', async () => {
    expect(await denied('bhd_operator', 'PUT', '/api/admin/settings', {})).toBe('admin:edit');
    expect(await denied('org_admin', 'POST', `/api/admin/access/requests/${ID}/decide`, {})).toBe('admin:approve');
    expect(await denied('compliance_manager', 'GET', '/api/admin/settings')).toBe('admin:view');
  });
});
