// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// prepare.test.ts — Sprint 6 slice "Prepare for Assessment": readiness
// checklist, SSP statements (drafts, edit, approve, export), evidence packages
// (frozen manifest, validation, SoD sign-off, drift), assessor workspace and
// requests, sign-offs with the final gate, reports in json / csv / md.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import express from 'express';
import { createPrepareRouter } from '../src/routes/prepare.js';
import { mintToken } from '../src/lib/jwt.js';
import { createMockDb } from './helpers/mockDb.js';

const TENANT_A = '00000000-aaaa-0000-0000-000000000001';
const ENG_A = '00000000-0000-aaaa-0000-000000000001';
const RUN = '00000000-0000-0000-eeee-000000000001';
const E1 = '00000000-0000-0000-ffff-000000000001';

let db: ReturnType<typeof createMockDb>;
let server: http.Server;
let base: string;
const H = (role: string, sub = `${role}-1`) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${mintToken({ sub, tenant_id: TENANT_A, party_id: null, role })}` });
const call = (method: string, path: string, role: string, body?: unknown, sub?: string) => fetch(`${base}/api/engagements/${ENG_A}/prepare${path}`, { method, headers: H(role, sub), body: body === undefined ? undefined : JSON.stringify(body) });

beforeAll(async () => {
  db = createMockDb();
  const app = express();
  app.use(express.json());
  app.use('/api/engagements/:engagementId/prepare', createPrepareRouter(db));
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, () => r()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(async () => {
  for (const m of ['implementationStatement', 'evidencePackage', 'assessorRequest', 'assessmentSignOff', 'assessmentRun', 'assessmentResult', 'evidenceItem', 'poamItem', 'planAction', 'scopeBoundary', 'scopeAsset', 'organization', 'customerTenant', 'monitorFinding', 'sharedItem', 'auditEvent', 'engagement'] as const) db[m]._records.length = 0;
  await db.engagement.create({ data: { id: ENG_A, tenant_id: TENANT_A, engagement_kind: 'prime_only' } });
  await db.organization.create({ data: { tenant_id: TENANT_A, legal_name: 'Contoso Defense LLC', uei: 'ABCDE1234567', cage: '1ABC2', contract_clauses: ['DFARS 252.204-7021'] } });
  await db.scopeBoundary.create({ data: { tenant_id: TENANT_A, engagement_id: ENG_A, version: 1, status: 'confirmed', confirmed_by: 'cm-1', confirmed_at: new Date(), narrative: 'GCC High enclave', asset_count: 1 } });
  await db.scopeAsset.create({ data: { tenant_id: TENANT_A, engagement_id: ENG_A, name: 'FS-01', asset_type: 'file server', category: 'cui', external_provider: false } });
  await db.assessmentRun.create({ data: { id: RUN, tenant_id: TENANT_A, engagement_id: ENG_A, sprs_now: 105, sprs_after: 110, met_count: 108, partial_count: 0, not_met_count: 1, unknown_count: 1, created_at: new Date() } });
  await db.assessmentResult.create({ data: { tenant_id: TENANT_A, run_id: RUN, requirement_id: 'AC.L1-3.1.1', family: 'AC', weight: 5, status: 'met', engine_status: 'met', fix_entry_ids: [] } });
  await db.assessmentResult.create({ data: { tenant_id: TENANT_A, run_id: RUN, requirement_id: 'AC.L2-3.1.9', family: 'AC', weight: 1, status: 'not_met', engine_status: 'not_met', fixable: 'manual', fix_entry_ids: [] } });
  await db.assessmentResult.create({ data: { tenant_id: TENANT_A, run_id: RUN, requirement_id: 'CA.L2-3.12.4', family: 'CA', weight: 0, status: 'met', engine_status: 'met', fix_entry_ids: [] } });
  await db.evidenceItem.create({ data: { id: E1, tenant_id: TENANT_A, engagement_id: ENG_A, title: 'Entra user export', requirement_ids: ['AC.L1-3.1.1'], objective_ids: [], archetype_code: 'EMX-IAM-005', form: 'User list export (CSV/JSON)', kind: 'export', source: 'upload', status: 'validated', sha256: 'abc', size_bytes: 10, collected_at: new Date(), updated_at: new Date(), classification: 'internal', version: 1, validation: { strength: 'strong' }, reviewed_by: 'rev-1', created_by: 'cis-1' } });
  await db.sharedItem.create({ data: { kind: 'archetype', item_key: 'EMX-IAM-005', version: 1, status: 'published', data: { code: 'EMX-IAM-005', name: 'Account inventory', domain: 'IAM', acceptable_forms: ['User list export (CSV/JSON)'], assessor_methods: ['examine'] } } });
  await db.sharedItem.create({ data: { kind: 'mapping', item_key: 'm1', version: 1, status: 'published', data: { control_id: 'AC.L1-3.1.1', archetype_code: 'EMX-IAM-005', mapping_type: 'required', expected_strength: null } } });
  await db.sharedItem.create({ data: { kind: 'mapping', item_key: 'm2', version: 1, status: 'published', data: { control_id: 'AC.L2-3.1.9', archetype_code: 'EMX-IAM-005', mapping_type: 'required', expected_strength: null } } });
  await db.poamItem.create({ data: { tenant_id: TENANT_A, engagement_id: ENG_A, requirement_id: 'AC.L2-3.1.9', weight: 1, poam_allowed: true, weakness: 'No sign-in banner', status: 'open' } });
});

describe('readiness checklist', () => {
  it('computes 15 items with routes; some green from the seeded state, statements red until written', async () => {
    const c = await (await call('GET', '/readiness', 'assessor_read_only')).json();
    expect(c.items).toHaveLength(15);
    const by = Object.fromEntries(c.items.map((i: { id: string; ok: boolean }) => [i.id, i.ok]));
    expect(by).toMatchObject({ org: true, boundary: true, scope: true, run: true, ssp_control: true, gaps: true, poam: true, actions: true, review: true, findings: true, statements: false, package: false, final: false });
    expect(c.ready).toBe(false);
    expect(c.outstanding.missing_statements.length).toBeGreaterThan(100);
    expect(c.outstanding.open_gaps).toEqual([{ requirement_id: 'AC.L2-3.1.9', status: 'not_met', weight: 1 }]);
  });
});

describe('SSP statements', () => {
  it('generates drafts for all 110 from run + evidence, a draft cannot be approved until edited, export renders md and json', async () => {
    const gen = await (await call('POST', '/ssp/statements/generate-drafts', 'compliance_manager')).json();
    expect(gen.created).toBe(110);
    const list = await (await call('GET', '/ssp/statements', 'assessor_read_only')).json();
    expect(list).toHaveLength(110);
    const ac = list.find((s: { requirement_id: string }) => s.requirement_id === 'AC.L1-3.1.1');
    expect(ac.statement.status).toBe('implemented');
    expect(ac.statement.statement).toContain('Entra user export');
    expect(ac.statement.source).toBe('generated_draft');
    expect(ac.validated_evidence).toHaveLength(1);
    expect(list.find((s: { requirement_id: string }) => s.requirement_id === 'AC.L2-3.1.9').statement.status).toBe('planned');
    expect((await call('POST', '/ssp/statements/AC.L1-3.1.1/approve', 'prime')).status).toBe(409);
    const saved = await (await call('PUT', '/ssp/statements/AC.L1-3.1.1', 'it_security_admin', { status: 'implemented', statement: 'All accounts are provisioned through Entra ID with Conditional Access; quarterly access reviews are evidenced by the user export.', responsible_role: 'CIS administrator', systems: ['Entra ID'], evidence_item_ids: [E1] })).json();
    expect(saved.version).toBe(2);
    expect(saved.approved_by).toBeNull();
    const approved = await (await call('POST', '/ssp/statements/AC.L1-3.1.1/approve', 'compliance_manager')).json();
    expect(approved.approved_by).toBe('compliance_manager-1');
    expect((await call('PUT', '/ssp/statements/XX.L9-9.9.9', 'prime', { status: 'planned' })).status).toBe(422);
    expect((await call('PUT', '/ssp/statements/AC.L1-3.1.1', 'assessor_read_only', { status: 'planned' })).status).toBe(403);
    const md = await call('GET', '/ssp/export?format=md', 'assessor_read_only');
    expect(md.headers.get('content-type')).toContain('text/markdown');
    const text = await md.text();
    expect(text).toContain('# System Security Plan');
    expect(text).toContain('Contoso Defense LLC');
    expect(text).toContain('#### AC.L1-3.1.1 (L1) — implemented ✓');
    const json = await (await call('GET', '/ssp/export', 'prime')).json();
    expect(json.requirements).toHaveLength(110);
    expect(json.sprs.score).toBe(105);
    expect(json.poam[0]).toMatchObject({ requirement_id: 'AC.L2-3.1.9', eligible: true });
  });
});

describe('evidence packages', () => {
  it('builds a frozen manifest, validates coverage, SoD on sign-off, exports csv, and detects drift after a hash change', async () => {
    const built = await (await call('POST', '/packages', 'it_security_admin', { name: 'Assessment package Q4', scope_type: 'requirement', scope_values: ['AC.L1-3.1.1'], run_id: RUN }, 'cis-1')).json();
    expect(built).toMatchObject({ status: 'validated', item_count: 1, version: 1 });
    const full = await (await call('GET', `/packages/${built.id}`, 'assessor_read_only')).json();
    expect(full.manifest.items[0]).toMatchObject({ id: E1, sha256: 'abc', strength: 'strong' });
    expect(full.validation.passed).toBe(true);
    const whole = await (await call('POST', '/packages', 'prime', { name: 'Everything', scope_type: 'all' })).json();
    expect(whole.status).toBe('draft'); // AC.L2-3.1.9 requires an archetype nobody provided → coverage missing
    expect((await call('POST', `/packages/${built.id}/sign-off`, 'it_security_admin', { notes: 'self sign' }, 'cis-1')).status).toBe(403);
    expect((await (await call('POST', `/packages/${built.id}/sign-off`, 'compliance_manager', { notes: 'I built it too' }, 'cis-1')).json()).code).toBe('SOD_SAME_PERSON');
    expect((await call('POST', `/packages/${whole.id}/sign-off`, 'senior_approver', { notes: 'Not validated yet' })).status).toBe(409);
    const signed = await (await call('POST', `/packages/${built.id}/sign-off`, 'senior_approver', { notes: 'Reviewed every item against the requirement' }, 'ciso-1')).json();
    expect(signed).toMatchObject({ status: 'signed_off', signed_off_by: 'ciso-1' });
    const csv = await (await call('GET', `/packages/${built.id}/export?format=csv`, 'assessor_read_only')).text();
    expect(csv.split('\n')).toHaveLength(2);
    expect(csv).toContain('Entra user export');
    await db.evidenceItem.update({ where: { id: E1 }, data: { sha256: 'changed' } });
    const re = await (await call('POST', `/packages/${built.id}/validate`, 'prime')).json();
    expect(re.validation.drifted_items).toEqual([E1]);
    expect(re.status).toBe('draft'); // signed-off package drops back when its items drift
    const v2 = await (await call('POST', '/packages', 'prime', { name: 'Assessment package Q4', scope_type: 'requirement', scope_values: ['AC.L1-3.1.1'], supersedes_id: built.id })).json();
    expect(v2.version).toBe(2);
    expect((await (await call('GET', `/packages/${built.id}`, 'prime')).json()).status).toBe('superseded');
    const signoffs = await (await call('GET', '/sign-offs', 'prime')).json();
    expect(signoffs.map((s: { kind: string }) => s.kind)).toEqual(['package']);
  });
});

describe('assessor workspace, requests, sign-offs, reports', () => {
  it('assessor sees per-requirement statement + validated evidence + package flag, asks, customer answers; final sign-off gated by the checklist; reports export', async () => {
    const pkg = await (await call('POST', '/packages', 'prime', { name: 'C3PAO package', scope_type: 'requirement', scope_values: ['AC.L1-3.1.1'] }, 'cis-1')).json();
    const so = await call('POST', `/packages/${pkg.id}/sign-off`, 'senior_approver', { notes: 'Reviewed and accepted' });
    expect(so.status, await so.text()).toBe(200);
    const ov = await (await call('GET', '/assessor/overview', 'assessor_read_only')).json();
    expect(ov.packages).toHaveLength(1);
    const ac = ov.requirements.find((q: { requirement_id: string }) => q.requirement_id === 'AC.L1-3.1.1');
    expect(ac.assessed).toBe('met');
    expect(ac.evidence[0]).toMatchObject({ id: E1, in_signed_package: true });
    expect(ov.requirements.find((q: { requirement_id: string }) => q.requirement_id === 'AC.L2-3.1.9').poam).toMatchObject({ status: 'open', eligible: true });

    expect((await call('POST', '/assessor/requests', 'it_security_admin', { question: 'Can I ask?' })).status).toBe(403); // sub/prime-only roles don't ask as assessors (it_security_admin inherits prime → allowed? no: prime is in ASK)
    const ask = await (await call('POST', '/assessor/requests', 'assessor_read_only', { question: 'Please provide the access review minutes for Q3', requirement_id: 'AC.L1-3.1.1' }, 'c3pao-1')).json();
    expect(ask.status).toBe('open');
    expect((await call('POST', `/assessor/requests/${ask.id}/answer`, 'assessor_read_only', { answer: 'nope' })).status).toBe(403);
    const ans = await (await call('POST', `/assessor/requests/${ask.id}/answer`, 'compliance_manager', { answer: 'Attached as evidence item', evidence_item_ids: [E1] })).json();
    expect(ans).toMatchObject({ status: 'answered', answered_by: 'compliance_manager-1' });
    expect((await (await call('POST', `/assessor/requests/${ask.id}/close`, 'assessor_read_only', undefined, 'c3pao-1')).json()).status).toBe('closed');

    expect((await call('POST', '/sign-offs', 'it_security_admin', { kind: 'internal_review', decision: 'approved', notes: 'reviewed' })).status).toBe(403);
    const ir = await (await call('POST', '/sign-offs', 'compliance_manager', { kind: 'internal_review', decision: 'approved', notes: 'Internal review complete' })).json();
    expect(ir.readiness.items).toHaveLength(15);
    const fin = await call('POST', '/sign-offs', 'senior_approver', { kind: 'final', decision: 'approved', notes: 'Ready for C3PAO' });
    expect(fin.status).toBe(409); // statements missing
    expect((await fin.json()).code).toBe('CHECKLIST_INCOMPLETE');

    for (const k of ['readiness', 'coverage', 'gaps', 'sprs', 'poam', 'evidence-inventory']) {
      const j = await (await call('GET', `/reports/${k}`, 'assessor_read_only')).json();
      expect(j.columns.length).toBeGreaterThan(1);
      const c = await call('GET', `/reports/${k}?format=csv`, 'assessor_read_only');
      expect(c.headers.get('content-type')).toContain('text/csv');
    }
    const md = await (await call('GET', '/reports/sprs?format=md', 'prime')).text();
    expect(md).toContain('# SPRS report');
    expect(md).toContain('- score: 105');
    expect((await call('GET', '/reports/nope', 'prime')).status).toBe(404);
  });
});
