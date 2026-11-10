// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// monitor.test.ts — Sprint 6 slice "Monitor": deterministic findings from the
// engagement's records, idempotent evaluate (dedupe / auto-clear), evidence
// expiry as the only state change, ack / resolve / escalate, snapshots, activity.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import express from 'express';
import { createMonitorRouter } from '../src/routes/monitor.js';
import { deriveFindings } from '../src/services/monitorEngine.js';
import { mintToken } from '../src/lib/jwt.js';
import { createMockDb } from './helpers/mockDb.js';

const TENANT_A = '00000000-aaaa-0000-0000-000000000001';
const ENG_A = '00000000-0000-aaaa-0000-000000000001';
const NOW = new Date('2026-11-10T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const EMPTY = { now: NOW, runs: [], resultsByRun: {}, actions: [], poam: [], remediationRuns: [], evidence: [], coverage: [], boundaries: [], scopeAssets: [], tenants: [], requests: [] };

describe('monitor engine (pure)', () => {
  it('score regression, control drift, stale run, overdue action, ineligible POA&M, stale and expiring evidence, scope change, tenant prerequisites', () => {
    const f = deriveFindings({
      ...EMPTY,
      runs: [{ id: 'r2', sprs_now: 70, created_at: daysAgo(100) }, { id: 'r1', sprs_now: 85, created_at: daysAgo(200) }],
      resultsByRun: { r2: [{ requirement_id: 'IA.L2-3.5.3', status: 'not_met', weight: 5 }, { requirement_id: 'AC.L2-3.1.5', status: 'met', weight: 3 }], r1: [{ requirement_id: 'IA.L2-3.5.3', status: 'met', weight: 5 }, { requirement_id: 'AC.L2-3.1.5', status: 'met', weight: 3 }] },
      actions: [{ id: 'a1', title: 'MFA', status: 'open', due_date: daysAgo(3), requirement_id: 'IA.L2-3.5.3', priority: 'critical' }, { id: 'a2', title: 'ok', status: 'done', due_date: daysAgo(3), requirement_id: null, priority: 'low' }],
      poam: [{ id: 'p1', requirement_id: 'IA.L2-3.5.3', status: 'open', scheduled_completion: null, poam_allowed: false }],
      remediationRuns: [{ id: 'x1', module: 'stamper', status: 'failed', requirement_id: 'IA.L2-3.5.3', requested_at: daysAgo(2), requested_by: 'op' }],
      evidence: [{ id: 'e1', title: 'Old export', status: 'validated', collected_at: daysAgo(400), retention_until: null, requirement_ids: ['AC.L1-3.1.1'], updated_at: daysAgo(400), created_by: 'u' }, { id: 'e2', title: 'Expiring policy', status: 'validated', collected_at: daysAgo(10), retention_until: new Date(NOW.getTime() + 10 * 86_400_000), requirement_ids: [], updated_at: daysAgo(10), created_by: 'u' }, { id: 'e3', title: 'Stuck', status: 'submitted', collected_at: daysAgo(10), retention_until: null, requirement_ids: [], updated_at: daysAgo(9), created_by: 'u' }],
      coverage: [{ requirement_id: 'AC.L2-3.1.3', state: 'missing', missing: ['EMX-X-001'] }, { requirement_id: 'AC.L1-3.1.1', state: 'covered', missing: [] }],
      boundaries: [{ id: 'b1', version: 1, status: 'confirmed', created_at: daysAgo(30), confirmed_at: daysAgo(30) }],
      scopeAssets: [{ id: 's1', created_at: daysAgo(5), updated_at: daysAgo(5) }],
      tenants: [{ id: 't1', display_name: 'Contoso', status: 'live_enabled', connection_status: null }],
      requests: [{ id: 'q1', requirement_id: 'AC.L2-3.1.3', status: 'open', due_date: daysAgo(1) }],
    });
    const keys = f.map((x) => x.key);
    expect(keys).toEqual(expect.arrayContaining(['score.regression:r2', 'control.regression:IA.L2-3.5.3', 'score.stale', 'remediation.failed:x1', 'plan.overdue:a1', 'plan.poam_ineligible:p1', 'evidence.stale:e1', 'evidence.expiring:e2', 'evidence.review_stuck:e3', 'evidence.missing:AC.L2-3.1.3', 'evidence.request_overdue:q1', 'scope.changed:b1', 'tenant.prereq:t1']));
    expect(keys).not.toContain('control.regression:AC.L2-3.1.5');
    expect(keys).not.toContain('plan.overdue:a2');
    expect(f.find((x) => x.key === 'score.regression:r2')?.severity).toBe('critical'); // fell by 15
    expect(f.find((x) => x.key === 'control.regression:IA.L2-3.5.3')?.severity).toBe('critical');
  });
  it('an empty engagement reports no run and no boundary, nothing else', () => {
    expect(deriveFindings(EMPTY).map((x) => x.key).sort()).toEqual(['scope.unconfirmed', 'score.none']);
  });
});

let db: ReturnType<typeof createMockDb>;
let server: http.Server;
let base: string;
const H = (role: string, sub = `${role}-1`) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${mintToken({ sub, tenant_id: TENANT_A, party_id: null, role })}` });
const call = (method: string, path: string, role: string, body?: unknown) => fetch(`${base}/api/engagements/${ENG_A}/monitor${path}`, { method, headers: H(role), body: body === undefined ? undefined : JSON.stringify(body) });

beforeAll(async () => {
  db = createMockDb();
  const app = express();
  app.use(express.json());
  app.use('/api/engagements/:engagementId/monitor', createMonitorRouter(db));
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, () => r()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(async () => {
  for (const m of ['monitorFinding', 'monitorSnapshot', 'assessmentRun', 'assessmentResult', 'planAction', 'poamItem', 'remediationRun', 'evidenceItem', 'evidenceRequest', 'scopeBoundary', 'scopeAsset', 'customerTenant', 'sharedItem', 'auditEvent', 'engagement'] as const) db[m]._records.length = 0;
  await db.engagement.create({ data: { id: ENG_A, tenant_id: TENANT_A, engagement_kind: 'prime_only' } });
  await db.planAction.create({ data: { id: 'a1', tenant_id: TENANT_A, engagement_id: ENG_A, title: 'Overdue MFA', status: 'open', due_date: daysAgo(5), priority: 'critical', requirement_id: 'IA.L2-3.5.3', weight: 5 } });
  await db.evidenceItem.create({ data: { id: 'e1', tenant_id: TENANT_A, engagement_id: ENG_A, title: 'Old export', status: 'validated', collected_at: daysAgo(400), updated_at: daysAgo(400), requirement_ids: ['AC.L1-3.1.1'], retention_until: null, created_by: 'u' } });
});

describe('evaluate / findings / snapshots', () => {
  it('evaluate creates findings, expires stale evidence, is idempotent, and clears findings that disappear', async () => {
    expect((await call('POST', '/evaluate', 'assessor_read_only')).status).toBe(403);
    const first = await (await call('POST', '/evaluate', 'compliance_manager')).json();
    expect(first.expired_evidence).toBe(1);
    expect(first.created).toBeGreaterThanOrEqual(4); // overdue action, stale evidence, no run, no boundary
    expect(db.evidenceItem._records[0].status).toBe('expired');
    const again = await (await call('POST', '/evaluate', 'compliance_manager')).json();
    expect(again).toMatchObject({ created: 0, cleared: 0 });
    expect(again.updated).toBe(first.created);
    const list = await (await call('GET', '/findings?status=open', 'assessor_read_only')).json();
    expect(list[0].severity).toBe('critical'); // overdue critical action first
    expect(list.find((f: { key: string }) => f.key === 'plan.overdue:a1').seen_count).toBe(2);

    await db.planAction.update({ where: { id: 'a1' }, data: { status: 'done' } });
    const third = await (await call('POST', '/evaluate', 'bhd_operator')).json();
    expect(third.cleared).toBe(1);
    const resolved = await (await call('GET', '/findings?status=resolved', 'prime')).json();
    expect(resolved.map((f: { key: string }) => f.key)).toEqual(['plan.overdue:a1']);
    expect(resolved[0].resolution).toBe('cleared');
    const snaps = await (await call('GET', '/snapshots', 'prime')).json();
    expect(snaps).toHaveLength(3);
    expect(snaps[2].open_actions).toBe(0);
    expect(snaps[0].open_actions).toBe(1);
    expect((await call('GET', '/findings?severity=nope', 'prime')).status).toBe(422);
  });

  it('ack / escalate / resolve by people, summary and activity', async () => {
    await call('POST', '/evaluate', 'prime');
    const f = (await (await call('GET', '/findings', 'prime')).json())[0];
    expect((await call('POST', `/findings/${f.id}/ack`, 'prime', { notes: 'x' })).status).toBe(422);
    const ack = await (await call('POST', `/findings/${f.id}/ack`, 'it_security_admin', { notes: 'Owner informed, fix planned for Friday' })).json();
    expect(ack).toMatchObject({ status: 'acknowledged', acknowledged_by: 'it_security_admin-1' });
    const esc = await (await call('POST', `/findings/${f.id}/escalate`, 'prime', { to: 'CISO' })).json();
    expect(esc.status).toBe('escalated');
    const res = await (await call('POST', `/findings/${f.id}/resolve`, 'bhd_operator', { resolution: 'MFA policy applied and verified' })).json();
    expect(res).toMatchObject({ status: 'resolved', resolved_by: 'bhd_operator-1' });
    const s = await (await call('GET', '/summary', 'assessor_read_only')).json();
    expect(s.snapshots).toBe(1);
    expect(s.by_status.resolved).toBe(1);
    expect(s.latest.findings_open).toBeGreaterThan(0);
    const act = await (await call('GET', '/activity?q=monitor', 'prime')).json();
    expect(act.map((a: { action: string }) => a.action)).toEqual(['monitor.finding.resolve', 'monitor.finding.escalate', 'monitor.finding.ack', 'monitor.evaluate']);
  });
});
