// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// assessments.test.ts — Sprint 3/4 slice "Assess": ingesting a readiness-result
// record gives 110 rows + one SPRS; gaps are heaviest-first; a human override
// keeps the engine status, needs a reason, is audited and re-scores the run;
// the Delivery-lane artifact path validates kind and shape.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import express from 'express';
import { createAssessmentsRouter, combinePostures, deriveRows, summarise } from '../src/routes/assessments.js';
import { mintToken } from '../src/lib/jwt.js';
import { createMockDb } from './helpers/mockDb.js';

const TENANT_A = '00000000-aaaa-0000-0000-000000000001';
const TENANT_B = '00000000-bbbb-0000-0000-000000000002';
const ENG_A = '00000000-0000-aaaa-0000-000000000001';
const ARTIFACT = '00000000-0000-0000-cccc-000000000001';

const RECORD = {
  schema_version: 'readiness-result/1.1.0',
  manifest: { session_mode: 'self-hosted' },
  observations: [
    { control_id: 'AC.L1-3.1.1', objective_ids: ['AC.L1-3.1.1[a]'], confidence: 'high', ran_entry_ids: ['tenant:AC.L2-3.1.1.operator-discover'], derived_posture: 'met' },
    { control_id: 'AC.L1-3.1.1', objective_ids: ['AC.L1-3.1.1[b]'], confidence: 'medium', ran_entry_ids: [], derived_posture: 'partial' },
    { control_id: 'IA.L2-3.5.3', objective_ids: [], confidence: 'high', ran_entry_ids: ['tenant:IA.L2-3.5.3.mfa'], derived_posture: 'not_met' },
    { control_id: 'SC.L2-3.13.11', objective_ids: [], confidence: 'high', ran_entry_ids: [], derived_posture: 'met' },
  ],
  derived: { gaps: [{ requirement_id: 'IA.L2-3.5.3', weight: 5, fix_entry_ids: ['tenant:IA.L2-3.5.3.mfa.set'], fixable: 'registry' }] },
  provenance: { engine: { name: 'ces-tester', version: '2.2.3' }, generated_at: '2026-11-01T10:00:00.000Z' },
};

let db: ReturnType<typeof createMockDb>;
let server: http.Server;
let base: string;
const H = (role: string, tenant = TENANT_A) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${mintToken({ sub: `${role}-1`, tenant_id: tenant, party_id: null, role })}` });
const call = (method: string, path: string, role: string, body?: unknown, tenant = TENANT_A) =>
  fetch(`${base}/api/engagements/${ENG_A}/assessments${path}`, { method, headers: H(role, tenant), body: body === undefined ? undefined : JSON.stringify(body) });

beforeAll(async () => {
  db = createMockDb();
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/engagements/:engagementId/assessments', createAssessmentsRouter(db, {
    // Engine seam: the simulator walk returns our RECORD as its envelope; the live path has no gate → refused.
    readCapture: (abs) => (abs.endsWith('captures/ac-3.1.1.txt') ? Buffer.from('Get-MgPolicy… (sim output)') : null),
    runSim: async ({ slug }) => (slug === 'broken' ? { ok: false, code: 'sim_unreachable', message: 'ledger down' } : slug === 'dead' ? { ok: true, envelope: RECORD, stats: { entries: 4, ran: 4, failed: 4 }, postures: { met: 0, unknown: 4, not_met: 0 } } : { ok: true, envelope: { ...RECORD, observations: RECORD.observations.map((o, i) => ({ ...o, raw_capture_ref: i < 2 ? 'captures/ac-3.1.1.txt' : i === 2 ? 'captures/missing.txt' : undefined })), provenance: { engine: { name: 'muster-api discovery', version: 'sim' }, generated_at: new Date().toISOString() } }, stats: { entries: 4 }, postures: { met: 2, unknown: 0, not_met: 1 } }),
  }));
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, () => r()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(async () => {
  for (const m of ['assessmentRun', 'assessmentResult', 'auditEvent', 'engagement', 'deliveryArtifact', 'evidenceItem', 'engineJob'] as const) db[m]._records.length = 0;
  await db.engagement.create({ data: { id: ENG_A, tenant_id: TENANT_A, engagement_kind: 'prime_only' } });
});

describe('derivation (pure)', () => {
  it('worst observation wins and a control without observation is unknown', () => {
    expect(combinePostures(['met', 'partial'])).toBe('partial');
    expect(combinePostures(['met', 'not_met', 'partial'])).toBe('not_met');
    expect(combinePostures([])).toBe('unknown');
  });

  it('gives 110 rows, weights from sprs-weights, fix path from derived.gaps', () => {
    const rows = deriveRows(RECORD as never);
    expect(rows).toHaveLength(110);
    const ia = rows.find((r) => r.requirement_id === 'IA.L2-3.5.3')!;
    expect(ia).toMatchObject({ status: 'not_met', weight: 5, family: 'IA', fixable: 'registry', fix_entry_ids: ['tenant:IA.L2-3.5.3.mfa.set'] });
    expect(rows.find((r) => r.requirement_id === 'AC.L1-3.1.1')).toMatchObject({ status: 'partial', confidence: 'medium', fixable: 'manual' });
    const s = summarise(rows);
    expect(s.counts.met).toBe(1);
    expect(s.counts.unknown).toBe(107);
    expect(s.sprs_after).toBe(s.sprs_now + 5); // only the registry-fixable gap is projected
  });
});

describe('runs', () => {
  it('prime ingests; assessor reads runs, results and gaps (heaviest first); sub cannot ingest', async () => {
    expect((await call('POST', '', 'sub', RECORD)).status).toBe(403);
    const created = await call('POST', '', 'compliance_manager', RECORD);
    expect(created.status).toBe(201);
    const run = await created.json();
    expect(run.source).toBe('readiness_result');
    expect(run.met_count).toBe(1);
    expect(run.by_family.find((f: { family: string }) => f.family === 'IA')).toMatchObject({ not_met: 1, name: 'Identification & Authentication' });

    const runs = await (await call('GET', '', 'assessor_read_only')).json();
    expect(runs).toHaveLength(1);
    const results = await (await call('GET', `/${run.id}/results`, 'assessor_read_only')).json();
    expect(results).toHaveLength(110);
    const gaps = await (await call('GET', `/${run.id}/gaps`, 'assessor_read_only')).json();
    expect(gaps.gap_count).toBe(109);
    expect(gaps.gaps[0].weight).toBe(5);
    expect(gaps.registry_fixable).toBe(1);
    expect(gaps.sprs_after - gaps.sprs_now).toBe(5);
    expect(db.auditEvent._records.map((a) => a.action)).toEqual(['assessment.ingest']);
  });

  it('rejects a record without observations or with an unknown schema, and hides other tenants', async () => {
    expect((await call('POST', '', 'prime', { ...RECORD, observations: [] })).status).toBe(422);
    expect((await call('POST', '', 'prime', { ...RECORD, schema_version: 'readiness-result/9.0.0' })).status).toBe(422);
    const run = await (await call('POST', '', 'prime', RECORD)).json();
    expect((await call('GET', `/${run.id}`, 'prime', undefined, TENANT_B)).status).toBe(404);
  });

  it('override keeps the engine status, needs a reason, re-scores and is audited', async () => {
    const run = await (await call('POST', '', 'prime', RECORD)).json();
    expect((await call('PATCH', `/${run.id}/results/IA.L2-3.5.3`, 'prime', { status: 'met', reason: 'short' })).status).toBe(422);
    expect((await call('PATCH', `/${run.id}/results/IA.L2-3.5.3`, 'evidence_reviewer', { status: 'met', reason: 'Reviewed the MFA policy export' })).status).toBe(403);
    const ok = await (await call('PATCH', `/${run.id}/results/IA.L2-3.5.3`, 'prime', { status: 'met', reason: 'Conditional Access MFA policy verified in the tenant on 2026-11-09' })).json();
    expect(ok.result).toMatchObject({ status: 'met', engine_status: 'not_met', override_by: 'prime-1' });
    expect(ok.run.sprs_now).toBe(run.sprs_now + 5);
    expect(ok.run.not_met_count).toBe(0);
    expect(db.auditEvent._records.at(-1)).toMatchObject({ action: 'assessment.override', detail: { from: 'not_met', to: 'met', requirement_id: 'IA.L2-3.5.3' } });
    expect((await call('PATCH', `/${run.id}/results/XX.L9-9.9.9`, 'prime', { status: 'met', reason: 'does not exist anywhere' })).status).toBe(404);
  });

  it('ENGINE: POST /run walks the registry (simulator) and persists the outcome as an engine_run; live is refused without the gate; failures are reported on the job', async () => {
    expect((await call('POST', '/run', 'evidence_reviewer', { mode: 'sim' })).status).toBe(403);
    const started = await call('POST', '/run', 'compliance_manager', { mode: 'sim', tenant_slug: 'mp', label: 'Nightly sim' });
    expect(started.status).toBe(202);
    const { job_id } = await started.json();
    let job: { status: string; run_id?: string; error?: string } = { status: 'running' };
    for (let i = 0; i < 20 && job.status === 'running'; i++) { await new Promise((r) => setTimeout(r, 10)); job = await (await call('GET', `/jobs/${job_id}`, 'assessor_read_only')).json(); }
    expect(job.status).toBe('done');
    const run = await (await call('GET', `/${job.run_id}`, 'prime')).json();
    expect(run).toMatchObject({ source: 'engine_run', label: 'Nightly sim', met_count: 1 });
    expect(run.engine.name).toBe('muster-api discovery');
    expect(db.auditEvent._records.map((a) => a.action)).toEqual(['assessment.run.start', 'assessment.ingest', 'evidence.capture']);
    // Captures → Collect Evidence: one draft item per capture file (two observations shared one), the missing file is counted, nothing inlined into the run.
    expect((job as { evidence?: unknown }).evidence).toMatchObject({ created: 1, missing_files: 1, skipped_no_ref: 1 });
    const items = db.evidenceItem._records;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ source: 'discovery', status: 'draft', kind: 'config_capture', classification: 'internal', requirement_ids: ['AC.L1-3.1.1'], objective_ids: ['AC.L1-3.1.1[a]', 'AC.L1-3.1.1[b]'] });
    expect(items[0].sha256).toHaveLength(64);
    expect((items[0].metadata as { assessment_run_id: string }).assessment_run_id).toBe(job.run_id);

    const live = await call('POST', '/run', 'bhd_operator', { mode: 'live' });
    expect(live.status).toBeGreaterThanOrEqual(400); // no Live gate configured → refused, never a silent sim fallback
    expect((await live.json()).code).toBe('LIVE_REFUSED');

    // All registry commands failed to execute (no PowerShell on the host): nothing is recorded, the job says why.
    const dead = await (await call('POST', '/run', 'prime', { mode: 'sim', tenant_slug: 'dead' })).json();
    let deadJob: { status: string; error?: string } = { status: 'running' };
    for (let i = 0; i < 20 && deadJob.status === 'running'; i++) { await new Promise((r) => setTimeout(r, 10)); deadJob = await (await call('GET', `/jobs/${dead.job_id}`, 'prime')).json(); }
    expect(deadJob.status).toBe('failed');
    expect(deadJob.error).toMatch(/engine_unavailable/);
    expect(db.assessmentRun._records).toHaveLength(1); // only the good run
    const bad = await (await call('POST', '/run', 'prime', { mode: 'sim', tenant_slug: 'broken' })).json();
    let failed: { status: string; error?: string } = { status: 'running' };
    for (let i = 0; i < 20 && failed.status === 'running'; i++) { await new Promise((r) => setTimeout(r, 10)); failed = await (await call('GET', `/jobs/${bad.job_id}`, 'prime')).json(); }
    expect(failed.status).toBe('failed');
    expect(failed.error).toMatch(/sim_unreachable/);
    expect((await call('GET', '/jobs/00000000-0000-0000-0000-000000000000', 'prime')).status).toBe(404);
  });

  it('ingests a delivered readiness_result artifact and refuses other kinds', async () => {
    await db.deliveryArtifact.create({ data: { id: ARTIFACT, tenant_id: TENANT_A, engagement_id: ENG_A, kind: 'readiness_result', filename: 'r.json', content: Buffer.from(JSON.stringify(RECORD)), content_sha256: 'x', purged_at: null } });
    const run = await (await call('POST', `/from-artifact/${ARTIFACT}`, 'bhd_operator')).json();
    expect(run).toMatchObject({ source: 'delivery_artifact', delivery_artifact_id: ARTIFACT });
    await db.deliveryArtifact.update({ where: { id: ARTIFACT }, data: { kind: 'capture' } });
    expect((await call('POST', `/from-artifact/${ARTIFACT}`, 'bhd_operator')).status).toBe(409);
  });
});

describe('ENGINE via the Windows runner (no local engine)', () => {
  let server2: http.Server; let base2: string;
  const call2 = (method: string, path: string, role: string, body?: unknown, sub?: string) => fetch(`${base2}/api/engagements/${ENG_A}/assessments${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mintToken({ sub: sub ?? `${role}-1`, tenant_id: TENANT_A, party_id: null, role })}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  beforeAll(async () => { const app2 = express(); app2.use(express.json({ limit: '5mb' })); app2.use('/api/engagements/:engagementId/assessments', createAssessmentsRouter(db, {})); server2 = http.createServer(app2); await new Promise<void>((r) => server2.listen(0, () => r())); base2 = `http://127.0.0.1:${(server2.address() as { port: number }).port}`; });
  afterAll(() => new Promise<void>((r) => server2.close(() => r())));

  it('queues on a non-Windows host; the runner lists, claims (once), posts the envelope + captures; a run and discovery evidence land', async () => {
    if (process.platform === 'win32') return; // on Windows the engine runs in-process (covered above)
    const q = await (await call2('POST', '/run', 'compliance_manager', { mode: 'sim', tenant_slug: 'muster-partial' })).json();
    expect(q.status).toBe('queued');
    expect((await (await call2('GET', `/jobs/${q.job_id}`, 'assessor_read_only')).json()).status).toBe('queued');
    const list = await call2('GET', '/jobs', 'compliance_manager'); // literal path must not be swallowed by GET /:runId
    expect(list.status).toBe(200);
    expect((await list.json()).map((j: { id: string }) => j.id)).toContain(q.job_id);
    expect((await call2('GET', '/runner/queue', 'prime')).status).toBe(403);
    const queue = await (await call2('GET', '/runner/queue', 'bhd_operator', undefined, 'runner:win-01')).json();
    expect(queue.map((j: { id: string }) => j.id)).toContain(q.job_id);
    const claims = await Promise.all(['win-01', 'win-02'].map((r) => call2('POST', `/jobs/${q.job_id}/claim`, 'bhd_operator', { runner: r }, `runner:${r}`)));
    expect(claims.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await call2('POST', `/jobs/${q.job_id}/cancel`, 'compliance_manager')).status).toBe(409); // running, not cancellable
    const done = await (await call2('POST', `/jobs/${q.job_id}/result`, 'bhd_operator', { runner: 'win-01', outcome: 'succeeded', envelope: { ...RECORD, provenance: { engine: { name: 'ces-stamper discovery', version: '2.2.3' } } }, stats: { entries: 4, ran: 4, failed: 0 }, captures: [{ ref: 'captures/ac-3.1.1.txt', content: 'Get-MgUser (runner output)', entry_id: 'AC.L2-3.1.1.operator-discover', requirement_ids: ['AC.L1-3.1.1'], objective_ids: ['AC.L1-3.1.1[a]'] }] }, 'runner:win-01')).json();
    expect(done.status).toBe('done');
    expect(done.run_id).toBeTruthy();
    expect(done.evidence).toEqual({ created: 1, missing_files: 0 });
    const run = await (await call2('GET', `/${done.run_id}`, 'prime')).json();
    expect(run.source).toBe('engine_run');
    expect(db.evidenceItem._records.at(-1)).toMatchObject({ source: 'discovery', status: 'draft', requirement_ids: ['AC.L1-3.1.1'] });
    expect((await call2('POST', `/jobs/${q.job_id}/result`, 'bhd_operator', { runner: 'win-01', outcome: 'succeeded', envelope: RECORD }, 'runner:win-01')).status).toBe(409); // late duplicate
    const q2 = await (await call2('POST', '/run', 'compliance_manager', { mode: 'sim' })).json();
    expect((await (await call2('POST', `/jobs/${q2.job_id}/cancel`, 'compliance_manager')).json()).status).toBe('cancelled');
    const q3 = await (await call2('POST', '/run', 'compliance_manager', { mode: 'sim' })).json();
    await call2('POST', `/jobs/${q3.job_id}/claim`, 'bhd_operator', { runner: 'win-01' }, 'runner:win-01');
    const failed = await (await call2('POST', `/jobs/${q3.job_id}/result`, 'bhd_operator', { runner: 'win-01', outcome: 'failed', error: 'sim_unreachable' }, 'runner:win-01')).json();
    expect(failed).toMatchObject({ status: 'failed', error: 'sim_unreachable' });
    expect(db.auditEvent._records.map((a) => a.action)).toEqual(expect.arrayContaining(['assessment.run.claim', 'assessment.run.result', 'assessment.run.cancel']));
  });
});
