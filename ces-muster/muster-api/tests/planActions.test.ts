// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// planActions.test.ts — Sprint 4 slice "Plan": actions generated from a run's
// gaps (priority = SPRS weight, no duplicates), manual actions, status
// lifecycle with closed_at, POA&M from actions with poam_prohibited flagged,
// summary projection, RBAC and tenant isolation.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import express from 'express';
import { createPlanActionsRouter, poamAllowed, priorityForWeight } from '../src/routes/planActions.js';
import { createAssessmentsRouter } from '../src/routes/assessments.js';
import { mintToken } from '../src/lib/jwt.js';
import { createMockDb } from './helpers/mockDb.js';

const TENANT_A = '00000000-aaaa-0000-0000-000000000001';
const TENANT_B = '00000000-bbbb-0000-0000-000000000002';
const ENG_A = '00000000-0000-aaaa-0000-000000000001';

const RECORD = {
  schema_version: 'readiness-result/1.1.0',
  observations: [
    { control_id: 'IA.L2-3.5.3', derived_posture: 'not_met', confidence: 'high', objective_ids: [], ran_entry_ids: [] },      // weight 5
    { control_id: 'AC.L2-3.1.5', derived_posture: 'partial', confidence: 'medium', objective_ids: [], ran_entry_ids: [] },    // weight 3
    { control_id: 'CA.L2-3.12.4', derived_posture: 'not_met', confidence: 'high', objective_ids: [], ran_entry_ids: [] },    // poam_prohibited (SSP)
  ],
  derived: { gaps: [{ requirement_id: 'IA.L2-3.5.3', fix_entry_ids: ['tenant:IA.L2-3.5.3.mfa.set'], fixable: 'registry' }] },
};

let db: ReturnType<typeof createMockDb>;
let server: http.Server;
let base: string;
const H = (role: string, tenant = TENANT_A) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${mintToken({ sub: `${role}-1`, tenant_id: tenant, party_id: null, role })}` });
const call = (method: string, path: string, role: string, body?: unknown, tenant = TENANT_A) =>
  fetch(`${base}/api/engagements/${ENG_A}/plan${path}`, { method, headers: H(role, tenant), body: body === undefined ? undefined : JSON.stringify(body) });

beforeAll(async () => {
  db = createMockDb();
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/engagements/:engagementId/assessments', createAssessmentsRouter(db));
  app.use('/api/engagements/:engagementId/plan', createPlanActionsRouter(db));
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, () => r()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

let runId = '';
beforeEach(async () => {
  for (const m of ['assessmentRun', 'assessmentResult', 'planAction', 'poamItem', 'auditEvent', 'engagement'] as const) db[m]._records.length = 0;
  await db.engagement.create({ data: { id: ENG_A, tenant_id: TENANT_A, engagement_kind: 'prime_only' } });
  const res = await fetch(`${base}/api/engagements/${ENG_A}/assessments`, { method: 'POST', headers: H('prime'), body: JSON.stringify(RECORD) });
  runId = (await res.json()).id;
});

describe('rules (pure)', () => {
  it('priority follows SPRS weight; poam_prohibited comes from sprs-weights.json', () => {
    expect(priorityForWeight(5)).toBe('critical');
    expect(priorityForWeight(3)).toBe('high');
    expect(priorityForWeight(1)).toBe('medium');
    expect(priorityForWeight(0)).toBe('low');
    expect(poamAllowed('AC.L2-3.1.9')).toBe(true);   // 1-point
    expect(poamAllowed('IA.L2-3.5.3')).toBe(false);  // 5-point: never on a POA&M (32 CFR 170.21)
    expect(poamAllowed('CA.L2-3.12.4')).toBe(false); // prohibited list (SSP prerequisite)
    expect(poamAllowed('AC.L2-3.1.20')).toBe(false);
    expect(priorityForWeight(0, 'CA.L2-3.12.4')).toBe('critical'); // no SSP, no score
  });
});

describe('actions', () => {
  it('generate from a run: one action per not_met/partial gap, priority by weight, no duplicates on re-run', async () => {
    expect((await call('POST', '/actions/generate', 'sub', { run_id: runId })).status).toBe(403);
    const first = await (await call('POST', '/actions/generate', 'compliance_manager', { run_id: runId })).json();
    expect(first.created).toBe(3);
    const ia = first.actions.find((a: { requirement_id: string }) => a.requirement_id === 'IA.L2-3.5.3');
    expect(ia).toMatchObject({ priority: 'critical', weight: 5, fix_kind: 'registry', source: 'gap', status: 'open', run_id: runId });
    expect(first.actions.find((a: { requirement_id: string }) => a.requirement_id === 'AC.L2-3.1.5')).toMatchObject({ priority: 'high', fix_kind: 'manual' });
    const again = await (await call('POST', '/actions/generate', 'prime', { run_id: runId })).json();
    expect(again).toMatchObject({ created: 0, skipped: 3 });
    const list = await (await call('GET', '/actions', 'assessor_read_only')).json();
    expect(list.map((a: { requirement_id: string }) => a.requirement_id)).toEqual(['IA.L2-3.5.3', 'CA.L2-3.12.4', 'AC.L2-3.1.5']); // critical first, then weight
    expect((await call('GET', '/actions?status=nope', 'prime')).status).toBe(422);
  });

  it('manual action, status lifecycle with closed_at, delete, tenant isolation', async () => {
    const bad = await call('POST', '/actions', 'prime', { title: 'x', requirement_id: 'nope' });
    expect(bad.status).toBe(422);
    const a = await (await call('POST', '/actions', 'prime', { title: 'Write the incident response plan', requirement_id: 'IR.L2-3.6.1', owner: 'CISO', due_date: '2026-12-15' })).json();
    expect(a).toMatchObject({ priority: 'critical', weight: 5, family: 'IR', source: 'manual' });
    expect(a.closed_at ?? null).toBeNull();
    const done = await (await call('PATCH', `/actions/${a.id}`, 'it_security_admin', { status: 'done' })).json();
    expect(done.status).toBe('done');
    expect(done.closed_at).toBeTruthy();
    expect((await call('PATCH', `/actions/${a.id}`, 'prime', { status: 'open' }, TENANT_B)).status).toBe(404);
    expect((await call('DELETE', `/actions/${a.id}`, 'evidence_reviewer')).status).toBe(403);
    expect((await call('DELETE', `/actions/${a.id}`, 'bhd_operator')).status).toBe(204);
    expect(db.auditEvent._records.map((e) => e.action)).toEqual(expect.arrayContaining(['plan.action.create', 'plan.action.update', 'plan.action.delete']));
  });
});

describe('POA&M and summary', () => {
  it('from-actions creates one item per open requirement, flags prohibited ones, and the summary projects SPRS', async () => {
    await call('POST', '/actions/generate', 'prime', { run_id: runId });
    const made = await (await call('POST', '/poam/from-actions', 'prime')).json();
    expect(made.created).toBe(3);
    const ca = made.items.find((p: { requirement_id: string }) => p.requirement_id === 'CA.L2-3.12.4');
    expect(ca.poam_allowed).toBe(false);
    expect(ca.milestones).toHaveLength(1);
    expect((await (await call('POST', '/poam/from-actions', 'prime')).json()).created).toBe(0);

    // A prohibited item cannot be closed without a recorded mitigation.
    expect((await call('PATCH', `/poam/${ca.id}`, 'prime', { status: 'completed' })).status).toBe(409);
    const closed = await (await call('PATCH', `/poam/${ca.id}`, 'prime', { status: 'completed', mitigation: 'SSP v2 published and approved 2026-11-09' })).json();
    expect(closed.completed_at).toBeTruthy();

    const summary = await (await call('GET', '/summary', 'assessor_read_only')).json();
    expect(summary.actions.total).toBe(3);
    expect(summary.actions.by_priority.critical).toBe(2);
    expect(summary.poam).toMatchObject({ total: 3, prohibited: 3 }); // 5-, 3-point and the SSP: none may sit on a POA&M
    expect(summary.latest_run.id).toBe(runId);
    expect(summary.sprs_if_all_actions_done).toBeGreaterThan(summary.latest_run.sprs_now);
  });

  it('manual POA&M item validates the requirement id and carries weight', async () => {
    expect((await call('POST', '/poam', 'prime', { requirement_id: 'bad', weakness: 'x' })).status).toBe(422);
    const p = await (await call('POST', '/poam', 'prime', { requirement_id: 'AC.L2-3.1.9', weakness: 'Privacy and security notices not displayed at sign-in', scheduled_completion: '2027-01-31', milestones: [{ title: 'Configure sign-in banner', due_date: '2026-12-31' }] })).json();
    expect(p).toMatchObject({ weight: 1, poam_allowed: true, status: 'open' });
    expect((await (await call('GET', '/poam', 'sub')).json())).toHaveLength(1);
  });
});
