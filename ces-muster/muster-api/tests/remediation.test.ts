// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// remediation.test.ts — Sprint 5 slice "Remediate": gates (HELD, sim rail,
// DP-1 cost, DP-2 two-person), module access (Stamper BHD-only, AdminOps by
// the CIS admin + senior approver), simulate execution records a plan without
// touching a tenant, live stays queued, verification closes the action.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import express from 'express';
import { createRemediationRouter, evaluateGates, STAMPER_ENTRIES, ADMIN_OPS } from '../src/routes/remediation.js';
import { mintToken } from '../src/lib/jwt.js';
import { createMockDb } from './helpers/mockDb.js';

const TENANT_A = '00000000-aaaa-0000-0000-000000000001';
const ENG_A = '00000000-0000-aaaa-0000-000000000001';
const ACTION = '00000000-0000-0000-dddd-000000000001';

let db: ReturnType<typeof createMockDb>;
let server: http.Server;
let base: string;
const H = (role: string, sub = `${role}-1`) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${mintToken({ sub, tenant_id: TENANT_A, party_id: null, role })}` });
const call = (method: string, path: string, role: string, body?: unknown, sub?: string) =>
  fetch(`${base}/api/engagements/${ENG_A}/remediation${path}`, { method, headers: H(role, sub), body: body === undefined ? undefined : JSON.stringify(body) });

const SET_ENTRY = STAMPER_ENTRIES.find((e) => e.has_set && !e.manual_only)!;
const GET_ENTRY = STAMPER_ENTRIES.find((e) => !e.has_set && !e.manual_only)!;
const HELD_ENTRY = STAMPER_ENTRIES.find((e) => e.manual_only)!;
const OP = ADMIN_OPS.find((o) => o.id === 'A-01')!;

beforeAll(async () => {
  db = createMockDb();
  const app = express();
  app.use(express.json());
  app.use('/api/engagements/:engagementId/remediation', createRemediationRouter(db));
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, () => r()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(async () => {
  for (const m of ['remediationRun', 'planAction', 'auditEvent', 'engagement', 'evidenceItem'] as const) db[m]._records.length = 0;
  await db.engagement.create({ data: { id: ENG_A, tenant_id: TENANT_A, engagement_kind: 'prime_only', live_access_enabled: false } });
  await db.planAction.create({ data: { id: ACTION, tenant_id: TENANT_A, engagement_id: ENG_A, title: 'MFA', status: 'open', weight: 5 } });
});

describe('gates (pure)', () => {
  it('vendored registries are present', () => {
    expect(STAMPER_ENTRIES.length).toBe(223);
    expect(ADMIN_OPS.length).toBe(95);
    expect(SET_ENTRY && GET_ENTRY && HELD_ENTRY && OP).toBeTruthy();
  });
  it('HELD entries block; a get-only simulate needs no approval; a set needs DP-2; live needs the live flag', () => {
    const held = evaluateGates({ module: 'stamper', mode: 'simulate', entry_ids: [HELD_ENTRY.entry_id], justification: 'manual entry test' }, { live_access_enabled: false });
    expect(held.blocked).toBe(true);
    const get = evaluateGates({ module: 'stamper', mode: 'simulate', entry_ids: [GET_ENTRY.entry_id], justification: 'evidence read only' }, { live_access_enabled: false });
    expect(get).toMatchObject({ blocked: false, requiresApproval: false, cost: 1 });
    const set = evaluateGates({ module: 'stamper', mode: 'simulate', entry_ids: [SET_ENTRY.entry_id, GET_ENTRY.entry_id], justification: 'configuration change' }, { live_access_enabled: false });
    expect(set).toMatchObject({ blocked: false, requiresApproval: true, cost: 4 });
    const live = evaluateGates({ module: 'stamper', mode: 'live', entry_ids: [GET_ENTRY.entry_id], justification: 'live evidence read' }, { live_access_enabled: false });
    expect(live.blocked).toBe(true);
    expect(live.gates.find((g) => g.id === 'sim_rail')?.ok).toBe(false);
    const unknown = evaluateGates({ module: 'stamper', mode: 'simulate', entry_ids: ['nope.entry'], justification: 'unknown entry id' }, { live_access_enabled: true });
    expect(unknown.errors[0]).toMatch(/Unknown registry entries/);
  });
  it('AdminOps: missing required parameters block; every change needs two persons', () => {
    const g = evaluateGates({ module: 'adminops', mode: 'simulate', op_id: 'A-01', parameters: {}, justification: 'new starter onboarding' }, { live_access_enabled: false });
    expect(g.blocked).toBe(true);
    expect(g.requiresApproval).toBe(true);
    const ok = evaluateGates({ module: 'adminops', mode: 'simulate', op_id: 'A-01', parameters: { upn: 'a@b.onmicrosoft.us', displayName: 'A B' }, justification: 'new starter onboarding' }, { live_access_enabled: false });
    expect(ok.blocked).toBe(false);
  });
});

describe('Stamper runs (BHD only)', () => {
  it('a customer cannot request Stamper; BHD requests, a second BHD operator approves, simulate records a plan, a person verifies and the action closes', async () => {
    expect((await call('POST', '/runs', 'it_security_admin', { module: 'stamper', entry_ids: [SET_ENTRY.entry_id], justification: 'customer trying stamper' })).status).toBe(403);
    const req = await call('POST', '/runs', 'bhd_operator', { module: 'stamper', entry_ids: [SET_ENTRY.entry_id, GET_ENTRY.entry_id], action_id: ACTION, requirement_id: SET_ENTRY.control_ids[0], justification: 'Apply the baseline per the remediation plan' }, 'op-vaibhav');
    expect(req.status).toBe(201);
    const run = await req.json();
    expect(run.status).toBe('requested');
    expect(run.cost_estimate).toBe(4);
    expect((await call('POST', `/runs/${run.id}/execute`, 'bhd_operator', undefined, 'op-vaibhav')).status).toBe(409);         // approval pending
    expect((await (await call('POST', `/runs/${run.id}/approve`, 'bhd_operator', undefined, 'op-vaibhav')).json()).code).toBe('SOD_SAME_PERSON');
    expect((await call('POST', `/runs/${run.id}/approve`, 'senior_approver')).status).toBe(404);                                 // customers never see (let alone approve) Stamper runs
    const approved = await (await call('POST', `/runs/${run.id}/approve`, 'bhd_operator', undefined, 'op-sunny')).json();
    expect(approved).toMatchObject({ status: 'approved', approved_by: 'op-sunny' });
    const done = await (await call('POST', `/runs/${run.id}/execute`, 'bhd_operator', undefined, 'op-vaibhav')).json();
    expect(done.status).toBe('succeeded');
    expect(done.result).toMatchObject({ simulated: true, tenant_touched: false });
    expect(done.result.steps).toHaveLength(2);
    expect(done.result.steps[0].kind).toBe('set');
    expect((await call('GET', `/runs/${run.id}`, 'assessor_read_only')).status).toBe(404); // Stamper runs are invisible to customers and assessors
    const detail = await (await call('GET', `/runs/${run.id}`, 'bhd_operator', undefined, 'op-vaibhav')).json();
    expect(detail.entries[0].entry_id).toBe(SET_ENTRY.entry_id);
    const v = await (await call('POST', `/runs/${run.id}/verify`, 'bhd_operator', { verified: true, notes: 'Policy visible in the tenant after the run' }, 'op-vaibhav')).json();
    expect(v.run.status).toBe('verified');
    expect(v.action.status).toBe('done');
    expect(db.auditEvent._records.map((a) => a.action)).toEqual(['remediation.run.request', 'remediation.run.approve', 'remediation.run.execute', 'remediation.run.verify']);
  });

  it('a get-only simulate is auto-approved; a live run is blocked until live access, then queues for the runner', async () => {
    const get = await (await call('POST', '/runs', 'bhd_operator', { module: 'stamper', entry_ids: [GET_ENTRY.entry_id], justification: 'Evidence read, no change' })).json();
    expect(get.status).toBe('approved');
    expect(get.requires_approval).toBe(false);
    const blocked = await (await call('POST', '/runs', 'bhd_operator', { module: 'stamper', mode: 'live', entry_ids: [GET_ENTRY.entry_id], justification: 'Live evidence read' })).json();
    expect(blocked.status).toBe('blocked');
    await db.engagement.update({ where: { id: ENG_A }, data: { live_access_enabled: true } });
    const live = await (await call('POST', '/runs', 'bhd_operator', { module: 'stamper', mode: 'live', entry_ids: [GET_ENTRY.entry_id], justification: 'Live evidence read' }, 'op-a')).json();
    expect(live.status).toBe('requested');
    await call('POST', `/runs/${live.id}/approve`, 'bhd_operator', undefined, 'op-b');
    const queued = await call('POST', `/runs/${live.id}/execute`, 'bhd_operator', undefined, 'op-a');
    expect(queued.status).toBe(202);
    expect((await queued.json()).status).toBe('queued');
  });

  it('RUNNER: BHD runner lists the queue, claims (only from queued), posts the result; captures become draft evidence linked to the run; a person still verifies', async () => {
    await db.engagement.update({ where: { id: ENG_A }, data: { live_access_enabled: true } });
    const live = await (await call('POST', '/runs', 'bhd_operator', { module: 'stamper', mode: 'live', entry_ids: [GET_ENTRY.entry_id], requirement_id: 'AC.L2-3.1.5', justification: 'Live evidence read' }, 'op-a')).json();
    await call('POST', `/runs/${live.id}/approve`, 'bhd_operator', undefined, 'op-b');
    expect((await call('GET', '/runner/queue', 'prime')).status).toBe(403); // customers never see the runner queue
    expect(await (await call('GET', '/runner/queue', 'bhd_operator', undefined, 'runner:bhd-win-01')).json()).toEqual([]); // not queued yet
    expect((await call('POST', `/runs/${live.id}/claim`, 'bhd_operator', { runner: 'bhd-win-01' }, 'runner:bhd-win-01')).status).toBe(409);
    await call('POST', `/runs/${live.id}/execute`, 'bhd_operator', undefined, 'op-a');
    const queue = await (await call('GET', '/runner/queue', 'bhd_operator', undefined, 'runner:bhd-win-01')).json();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ id: live.id, module: 'stamper', entry_ids: [GET_ENTRY.entry_id] });
    expect(Object.keys(queue[0])).not.toContain('result'); // nothing beyond what the runner needs
    const claimed = await (await call('POST', `/runs/${live.id}/claim`, 'bhd_operator', { runner: 'bhd-win-01' }, 'runner:bhd-win-01')).json();
    expect(claimed.status).toBe('running');
    expect(claimed.result.claimed_by).toBe('bhd-win-01');
    expect((await call('POST', `/runs/${live.id}/claim`, 'bhd_operator', { runner: 'bhd-win-02' }, 'runner:bhd-win-02')).status).toBe(409); // claimed once
    // Two runners racing for the same queued run: the status-guarded update lets exactly one win.
    const race = await (await call('POST', '/runs', 'bhd_operator', { module: 'stamper', mode: 'live', entry_ids: [GET_ENTRY.entry_id], justification: 'Second live read for the race test' }, 'op-a')).json();
    await call('POST', `/runs/${race.id}/approve`, 'bhd_operator', undefined, 'op-b');
    await call('POST', `/runs/${race.id}/execute`, 'bhd_operator', undefined, 'op-a');
    const both = await Promise.all([1, 2].map((n) => call('POST', `/runs/${race.id}/claim`, 'bhd_operator', { runner: `bhd-win-0${n}` }, `runner:bhd-win-0${n}`)));
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    // Live access switched off after queueing → the runner is not handed the run.
    const off = await (await call('POST', '/runs', 'bhd_operator', { module: 'stamper', mode: 'live', entry_ids: [GET_ENTRY.entry_id], justification: 'Live read, access later revoked' }, 'op-a')).json();
    await call('POST', `/runs/${off.id}/approve`, 'bhd_operator', undefined, 'op-b');
    await call('POST', `/runs/${off.id}/execute`, 'bhd_operator', undefined, 'op-a');
    await db.engagement.update({ where: { id: ENG_A }, data: { live_access_enabled: false } });
    expect((await (await call('POST', `/runs/${off.id}/claim`, 'bhd_operator', { runner: 'bhd-win-01' }, 'runner:bhd-win-01')).json()).code).toBe('LIVE_DISABLED');
    await db.engagement.update({ where: { id: ENG_A }, data: { live_access_enabled: true } });
    expect((await call('POST', `/runs/${live.id}/result`, 'bhd_operator', { outcome: 'succeeded', summary: 'x', runner: 'bhd-win-01' })).status).toBe(422); // summary too short
    const done = await (await call('POST', `/runs/${live.id}/result`, 'bhd_operator', {
      outcome: 'succeeded', runner: 'bhd-win-01', summary: 'Get-MgPolicy… returned 3 conditional access policies',
      steps: [{ step: 1, entry_id: GET_ENTRY.entry_id, outcome: 'ok', duration_ms: 1200 }],
      captures: [{ ref: 'captures/ca-policies.json', content: Buffer.from('{"value":[]}').toString('base64'), encoding: 'base64', content_type: 'application/json', entry_id: GET_ENTRY.entry_id }],
    }, 'runner:bhd-win-01')).json();
    expect(done.status).toBe('succeeded');
    expect(done.result).toMatchObject({ tenant_touched: true, simulated: false, runner: 'bhd-win-01' });
    expect(done.evidence_ids).toHaveLength(1);
    const ev = db.evidenceItem._records[0];
    expect(ev).toMatchObject({ source: 'stamper', status: 'draft', run_id: live.id, requirement_ids: ['AC.L2-3.1.5'], content_type: 'application/json', size_bytes: 12 });
    expect(ev.sha256).toHaveLength(64);
    expect((await call('POST', `/runs/${live.id}/result`, 'bhd_operator', { outcome: 'failed', runner: 'bhd-win-01', summary: 'late duplicate result' }, 'runner:bhd-win-01')).status).toBe(409);
    expect(db.auditEvent._records.map((a) => a.action)).toEqual(expect.arrayContaining(['remediation.run.queue', 'remediation.run.claim', 'evidence.capture', 'remediation.run.result']));
    // The engine never verifies: a person does.
    const v = await (await call('POST', `/runs/${live.id}/verify`, 'bhd_operator', { verified: true, notes: 'Policies match the SSP' }, 'op-b')).json();
    expect(v.run.status).toBe('verified');
  });
});

describe('AdminOps runs (customer CIS admin + senior approver)', () => {
  it('CIS admin requests, approver must differ and be senior_approver or BHD, reject needs a reason, cancel by requester', async () => {
    const bad = await call('POST', '/runs', 'it_security_admin', { module: 'adminops', op_id: 'A-01', parameters: {}, justification: 'Onboard the new engineer' });
    expect((await bad.json()).status).toBe('blocked'); // missing parameters — recorded, not refused
    const req = await (await call('POST', '/runs', 'it_security_admin', { module: 'adminops', op_id: 'A-01', parameters: { upn: 'new@contoso.onmicrosoft.us', displayName: 'New Engineer' }, justification: 'Onboard the new engineer' }, 'cis-1')).json();
    expect(req.status).toBe('requested');
    expect(req.gates.find((g: { id: string }) => g.id === 'sod').label).toMatch(/Tier 2/);
    expect((await call('POST', `/runs/${req.id}/approve`, 'evidence_reviewer')).status).toBe(403);
    expect((await call('POST', `/runs/${req.id}/reject`, 'senior_approver', { reason: 'x' })).status).toBe(422);
    const approved = await (await call('POST', `/runs/${req.id}/approve`, 'senior_approver', undefined, 'ciso-1')).json();
    expect(approved.status).toBe('approved');
    const exec = await (await call('POST', `/runs/${req.id}/execute`, 'it_security_admin', undefined, 'cis-1')).json();
    expect(exec.result.steps[0]).toMatchObject({ op_id: 'A-01', simulated: true });
    const other = await (await call('POST', '/runs', 'it_security_admin', { module: 'adminops', op_id: 'A-01', parameters: { upn: 'x@contoso.onmicrosoft.us', displayName: 'X' }, justification: 'Second request to cancel' }, 'cis-1')).json();
    expect((await call('POST', `/runs/${other.id}/cancel`, 'it_security_admin', undefined, 'cis-2')).status).toBe(403);
    expect((await (await call('POST', `/runs/${other.id}/cancel`, 'it_security_admin', undefined, 'cis-1')).json()).status).toBe('cancelled');
    const summary = await (await call('GET', '/summary', 'assessor_read_only')).json();
    expect(summary.runs).toMatchObject({ total: 3, pending_verification: 1, by_module: { stamper: 0, adminops: 3 } });
    expect(summary.registry).toMatchObject({ stamper_entries: 223, adminops_operations: 95 });
    expect((await (await call('GET', '/registry/adminops?domain=A', 'sub')).json()).every((o: { domain: string }) => o.domain === 'A')).toBe(true);
    expect((await (await call('GET', `/registry/stamper?control=${SET_ENTRY.control_ids[0]}`, 'sub')).json()).some((e: { entry_id: string }) => e.entry_id === SET_ENTRY.entry_id)).toBe(true);
  });
});
