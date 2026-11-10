// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// evidence.test.ts — Sprint 6 slice "Collect Evidence": validation engine
// (built-in checks + published EVR rule conditions), SoD review, versions,
// coverage from the mapping catalogue, requests generated for missing
// required archetypes, content download audited.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import express from 'express';
import { createEvidenceRouter } from '../src/routes/evidence.js';
import { coverage, sha256Of, validateEvidence, type Catalogue } from '../src/services/evidenceValidation.js';
import { mintToken } from '../src/lib/jwt.js';
import { createMockDb } from './helpers/mockDb.js';

const TENANT_A = '00000000-aaaa-0000-0000-000000000001';
const ENG_A = '00000000-0000-aaaa-0000-000000000001';

const CAT: Catalogue = {
  archetypes: [
    { code: 'EMX-IAM-005', name: 'Account inventory', domain: 'IAM', acceptable_forms: ['User list export (CSV/JSON)', 'Screenshot of admin centre'], assessor_methods: ['examine'] },
    { code: 'EMX-POLICY-001', name: 'Access control policy', domain: 'POLICY', acceptable_forms: ['Policy document (PDF/Word)'], assessor_methods: ['examine', 'interview'] },
  ],
  mappings: [
    { control_id: 'AC.L1-3.1.1', archetype_code: 'EMX-IAM-005', mapping_type: 'required', expected_strength: 'strong' },
    { control_id: 'AC.L1-3.1.1', archetype_code: 'EMX-POLICY-001', mapping_type: 'required', expected_strength: null },
    { control_id: 'AC.L1-3.1.2', archetype_code: 'EMX-POLICY-001', mapping_type: 'recommended', expected_strength: null },
  ],
  rules: [
    { code: 'EVR-AC.L1-3.1.1', name: 'Signal check', logic: { conditions: [], signals: [{ type: 'graph' }], operator: 'AND' }, applies_to: { requirements: ['AC.L1-3.1.1'], archetypes: [] }, output: { outcomes: ['met', 'not_met'], evidence_strength: [], message: 'tenant signal' } },
    { code: 'EVR-IAM-FRESH', name: 'Account export is fresh and owned', logic: { conditions: [{ check: 'evidence_current_within_days', value: '90' }, { check: 'attribute_present', value: 'exported_by' }], signals: [], operator: 'AND' }, applies_to: { requirements: [], archetypes: ['EMX-IAM-005'] }, output: { outcomes: ['met', 'partial', 'not_met'], evidence_strength: ['adequate'], message: 'Account exports older than 90 days or without an exporter are not accepted' } },
  ],
};
const CSV = Buffer.from('upn,enabled\nadmin@contoso.onmicrosoft.us,true\n');
const base64 = CSV.toString('base64');

let db: ReturnType<typeof createMockDb>;
let server: http.Server;
let base: string;
const H = (role: string, sub = `${role}-1`) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${mintToken({ sub, tenant_id: TENANT_A, party_id: null, role })}` });
const call = (method: string, path: string, role: string, body?: unknown, sub?: string) =>
  fetch(`${base}/api/engagements/${ENG_A}/evidence${path}`, { method, headers: H(role, sub), body: body === undefined ? undefined : JSON.stringify(body) });

beforeAll(async () => {
  db = createMockDb();
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  app.use('/api/engagements/:engagementId/evidence', createEvidenceRouter(db));
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, () => r()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(async () => {
  for (const m of ['evidenceItem', 'evidenceRequest', 'sharedItem', 'auditEvent', 'engagement', 'assessmentResult'] as const) db[m]._records.length = 0;
  await db.engagement.create({ data: { id: ENG_A, tenant_id: TENANT_A, engagement_kind: 'prime_only' } });
  for (const a of CAT.archetypes) await db.sharedItem.create({ data: { kind: 'archetype', item_key: a.code, version: 1, status: 'published', data: a } });
  for (const m of CAT.mappings) await db.sharedItem.create({ data: { kind: 'mapping', item_key: `${m.control_id}|${m.archetype_code}`, version: 1, status: 'published', data: m } });
  for (const r of CAT.rules) await db.sharedItem.create({ data: { kind: 'rule', item_key: r.code, version: 1, status: 'published', data: r } });
  await db.sharedItem.create({ data: { kind: 'rule', item_key: 'EVR-DRAFT', version: 1, status: 'draft', data: { ...CAT.rules[1], code: 'EVR-DRAFT' } } });
});

const GOOD = { title: 'Entra user list export — November 2026', requirement_ids: ['AC.L1-3.1.1'], archetype_code: 'EMX-IAM-005', form: 'User list export (CSV/JSON)', kind: 'export', file_name: 'users.csv', content_type: 'text/csv', content_base64: base64, owner: 'IT admin', classification: 'internal', metadata: { exported_by: 'cis-1' } };

describe('validation engine (pure)', () => {
  it('passes a complete, mapped, fresh export and evaluates EVR conditions; signal-only rules are runtime', () => {
    const rep = validateEvidence({ ...GOOD, size_bytes: CSV.length, sha256: sha256Of(CSV), content: CSV, collected_at: new Date(), status: 'draft', description: null } as never, CAT);
    expect(rep.passed).toBe(true);
    expect(rep.strength).toBe('adequate');
    expect(rep.mapping).toEqual({ type: 'required', expected_strength: 'strong' });
    expect(rep.rules.find((r) => r.code === 'EVR-AC.L1-3.1.1')?.outcome).toBe('runtime');
    expect(rep.rules.find((r) => r.code === 'EVR-IAM-FRESH')?.outcome).toBe('met');
  });
  it('fails on wrong format, missing form, stale date, tampered hash, and partial rule', () => {
    const stale = validateEvidence({ ...GOOD, content_type: 'image/png', form: null, size_bytes: CSV.length, sha256: 'deadbeef', content: CSV, collected_at: new Date(Date.now() - 200 * 86_400_000), status: 'draft', metadata: {} } as never, CAT);
    expect(stale.passed).toBe(false);
    expect(stale.strength).toBe('weak');
    expect(stale.checks.filter((c) => !c.ok).map((c) => c.id).sort()).toEqual(['form', 'format', 'integrity']);
    expect(stale.rules.find((r) => r.code === 'EVR-IAM-FRESH')?.outcome).toBe('not_met');
    const unmapped = validateEvidence({ ...GOOD, requirement_ids: ['AC.L1-3.1.2'], size_bytes: 1, sha256: sha256Of(Buffer.from('a')), content: Buffer.from('a'), collected_at: new Date(), status: 'draft' } as never, CAT);
    expect(unmapped.checks.find((c) => c.id === 'mapping')?.ok).toBe(false);
    expect(unmapped.passed).toBe(true); // mapping is advisory, not blocking
  });
  it('coverage counts required archetypes per requirement', () => {
    const cov = coverage(['AC.L1-3.1.1', 'AC.L1-3.1.2', 'AC.L2-3.1.3'], CAT, [{ requirement_ids: ['AC.L1-3.1.1'], archetype_code: 'EMX-IAM-005', status: 'validated' }, { requirement_ids: ['AC.L1-3.1.1'], archetype_code: 'EMX-POLICY-001', status: 'submitted' }]);
    expect(cov[0]).toMatchObject({ required: 2, covered: 1, pending: 1, missing: [], state: 'partial' });
    expect(cov[1]).toMatchObject({ required: 0, recommended: 1, state: 'none_required' });
    expect(cov[2].state).toBe('none_required');
  });
});

describe('items', () => {
  it('CIS admin uploads (validated at once), submits; the submitter cannot review; the reviewer approves; request fulfilled; download audited', async () => {
    expect((await call('POST', '/items', 'assessor_read_only', GOOD)).status).toBe(403);
    const created = await call('POST', '/items', 'it_security_admin', GOOD, 'cis-1');
    expect(created.status).toBe(201);
    const item = await created.json();
    expect(item.status).toBe('draft');
    expect(item.content).toBeUndefined();
    expect(item.sha256).toBe(sha256Of(CSV));
    expect(item.validation.passed).toBe(true);
    await db.evidenceRequest.create({ data: { tenant_id: TENANT_A, engagement_id: ENG_A, requirement_id: 'AC.L1-3.1.1', archetype_code: 'EMX-IAM-005', title: 'x', status: 'open', evidence_item_id: item.id } });

    const submitted = await (await call('POST', `/items/${item.id}/submit`, 'it_security_admin', undefined, 'cis-1')).json();
    expect(submitted.status).toBe('submitted');
    expect(db.evidenceRequest._records[0].status).toBe('submitted');
    expect((await call('POST', `/items/${item.id}/review`, 'compliance_manager', { decision: 'approve', notes: 'looks fine' })).status).toBe(403);
    // the same person acting as reviewer is refused (SoD)
    expect((await (await call('POST', `/items/${item.id}/review`, 'evidence_reviewer', { decision: 'approve', notes: 'self review' }, 'cis-1')).json()).code).toBe('SOD_SAME_PERSON');
    const approved = await (await call('POST', `/items/${item.id}/review`, 'evidence_reviewer', { decision: 'approve', notes: 'Export matches the admin centre count' }, 'rev-1')).json();
    expect(approved).toMatchObject({ status: 'validated', reviewed_by: 'rev-1' });
    expect(approved.validation.strength).toBe('strong');
    expect(db.evidenceRequest._records[0].status).toBe('fulfilled');
    expect((await call('PATCH', `/items/${item.id}`, 'it_security_admin', { title: 'edit after approval' })).status).toBe(409);

    const dl = await call('GET', `/items/${item.id}/content`, 'assessor_read_only');
    expect(dl.status).toBe(200);
    expect(dl.headers.get('content-type')).toContain('text/csv');
    expect(Buffer.from(await dl.arrayBuffer()).equals(CSV)).toBe(true);
    expect(db.auditEvent._records.map((a) => a.action)).toEqual(['evidence.create', 'evidence.submit', 'evidence.approve', 'evidence.download']);
  });

  it('a failing item cannot be submitted; after a fix it can; reject sends it back to draft on edit; new version archives the old', async () => {
    const bad = await (await call('POST', '/items', 'prime', { ...GOOD, form: null, content_type: 'image/png' })).json();
    expect(bad.validation.passed).toBe(false);
    const refused = await call('POST', `/items/${bad.id}/submit`, 'prime');
    expect(refused.status).toBe(422);
    expect((await refused.json()).code).toBe('VALIDATION_FAILED');
    const fixed = await (await call('PATCH', `/items/${bad.id}`, 'prime', { form: 'User list export (CSV/JSON)', kind: 'other' })).json();
    expect(fixed.validation.passed).toBe(true);
    await call('POST', `/items/${bad.id}/submit`, 'prime');
    const rejected = await (await call('POST', `/items/${bad.id}/review`, 'bhd_operator', { decision: 'reject', notes: 'Export is of the wrong tenant' })).json();
    expect(rejected.status).toBe('rejected');
    const v2 = await (await call('POST', `/items/${bad.id}/new-version`, 'prime', { content_base64: base64, content_type: 'text/csv', file_name: 'users-v2.csv', kind: 'export' })).json();
    expect(v2).toMatchObject({ version: 2, supersedes_id: bad.id, status: 'draft' });
    expect((await (await call('GET', `/items/${bad.id}`, 'prime')).json()).status).toBe('archived');
    expect((await (await call('GET', `/items/${v2.id}`, 'prime')).json()).related_versions).toHaveLength(1);
  });

  it('rejects oversize content and unknown requirement ids', async () => {
    expect((await call('POST', '/items', 'prime', { ...GOOD, requirement_ids: ['XX-1'] })).status).toBe(422);
    expect((await call('POST', '/items', 'prime', { ...GOOD, content_base64: Buffer.alloc(11 * 1024 * 1024).toString('base64') })).status).toBe(413);
  });
});

describe('requests, coverage and summary', () => {
  it('generate creates one request per missing required archetype (none for covered), summary reflects everything', async () => {
    const item = await (await call('POST', '/items', 'prime', GOOD)).json();
    await call('POST', `/items/${item.id}/submit`, 'prime');
    await call('POST', `/items/${item.id}/review`, 'evidence_reviewer', { decision: 'approve', notes: 'Verified against tenant' }, 'rev-1');
    const gen = await (await call('POST', '/requests/generate', 'prime', { requirement_ids: ['AC.L1-3.1.1', 'AC.L1-3.1.2'], assignee: 'IT admin', due_date: '2026-12-15' })).json();
    expect(gen.created).toBe(1); // EMX-POLICY-001 for 3.1.1; 3.1.2 only has a recommended mapping
    expect(gen.requests[0]).toMatchObject({ requirement_id: 'AC.L1-3.1.1', archetype_code: 'EMX-POLICY-001', assignee: 'IT admin' });
    expect((await (await call('POST', '/requests/generate', 'prime', { requirement_ids: ['AC.L1-3.1.1'] })).json()).created).toBe(0);
    const cov = await (await call('GET', '/coverage', 'assessor_read_only')).json();
    expect(cov.find((c: { requirement_id: string }) => c.requirement_id === 'AC.L1-3.1.1')).toMatchObject({ required: 2, covered: 1, state: 'partial' });
    const s = await (await call('GET', '/summary', 'sub')).json();
    expect(s.items).toMatchObject({ total: 1, pending_review: 0 });
    expect(s.coverage.partial).toBe(1);
    expect(s.requests).toMatchObject({ total: 1, open: 1 });
    expect(s.catalogue).toEqual({ archetypes: 2, mappings: 3, rules: 2 }); // the draft rule is not used
    const cat = await (await call('GET', '/catalog', 'sub')).json();
    expect(cat.archetypes).toHaveLength(2);
  });
});
