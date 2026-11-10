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
  app.use('/api/engagements/:engagementId/assessments', createAssessmentsRouter(db));
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, () => r()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(async () => {
  for (const m of ['assessmentRun', 'assessmentResult', 'auditEvent', 'engagement', 'deliveryArtifact'] as const) db[m]._records.length = 0;
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

  it('ingests a delivered readiness_result artifact and refuses other kinds', async () => {
    await db.deliveryArtifact.create({ data: { id: ARTIFACT, tenant_id: TENANT_A, engagement_id: ENG_A, kind: 'readiness_result', filename: 'r.json', content: Buffer.from(JSON.stringify(RECORD)), content_sha256: 'x', purged_at: null } });
    const run = await (await call('POST', `/from-artifact/${ARTIFACT}`, 'bhd_operator')).json();
    expect(run).toMatchObject({ source: 'delivery_artifact', delivery_artifact_id: ARTIFACT });
    await db.deliveryArtifact.update({ where: { id: ARTIFACT }, data: { kind: 'capture' } });
    expect((await call('POST', `/from-artifact/${ARTIFACT}`, 'bhd_operator')).status).toBe(409);
  });
});
