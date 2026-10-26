// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// S1.1 (doc 26): CES-Shared API — reference data, governed draft/publish/retire,
// no self-approval, locked fields, references, atomic change log, roles.
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'node:http';
import { createFakeSharedDb } from './support/fakeSharedDb.js';
import { createCesSharedRouter } from '../src/routes/cesShared.js';
import { seedCesShared, seedItems } from '../src/cesShared/seed.js';
import { mintToken } from '../src/lib/jwt.js';

const fake = createFakeSharedDb();
let server: http.Server;
let base: string;

const tok = (sub: string, role: string) => mintToken({ sub, tenant_id: 't-bhd', party_id: null, role });
const ADMIN_A = tok('admin-a', 'platform_admin');
const ADMIN_B = tok('admin-b', 'platform_admin');
const OPERATOR = tok('op-1', 'bhd_operator');
const ASSESSOR = tok('as-1', 'assessor_read_only');

async function call(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text; // express's default HTML 500 page in this bare test app
  }
  return { status: res.status, body: parsed };
}

const archetype = (over: Record<string, unknown> = {}) => ({
  code: 'EMX-TEST-001',
  name: 'Test evidence',
  domain: 'IAM',
  description: 'An archetype made by the test.',
  assessor_methods: ['examine'],
  acceptable_forms: ['Export'],
  collection_notes: '',
  retention_notes_template: '',
  ...over,
});

beforeAll(async () => {
  await seedCesShared(fake);
  const app = express();
  app.use(express.json());
  app.use('/api/v1/ces-shared', createCesSharedRouter(fake));
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1/ces-shared`;
});
afterAll(() => server?.close());

describe('seed', () => {
  test('every seed item is valid: 50 archetypes, 450 mappings, 107 rules', () => {
    const items = seedItems();
    const count = (k: string) => items.filter((i) => i.kind === k).length;
    expect([count('archetype'), count('mapping'), count('rule')]).toEqual([50, 450, 107]);
    expect(items.filter((i) => i.kind === 'archetype').every((i) => /^EMX-[A-Z0-9]+-\d{3}$/.test(i.key))).toBe(true);
  });

  test('seeded as version 1, published, author "seed"; re-running changes nothing', async () => {
    const before = fake.items().length;
    expect(before).toBe(607);
    expect(fake.items().every((r) => r.status === 'published' && r.version === 1 && r.published_by === 'seed')).toBe(true);
    expect(await seedCesShared(fake)).toEqual({ created: 0, skipped: 607 });
    expect(fake.items().length).toBe(before);
  });
});

describe('reference data (locked)', () => {
  test('110 requirements with paging, filters and the V1.0 shapes', async () => {
    const all = await call(OPERATOR, 'GET', '/requirements?pageSize=200');
    expect(all.status).toBe(200);
    expect(all.body.pagination.totalItems).toBe(110);
    const r = all.body.data.find((x: { controlId: string }) => x.controlId === 'IA.L2-3.5.3');
    expect(r).toMatchObject({ nistRef: '3.5.3', level: 'L2', requirementType: 'Derived', sprs: { weight: 5, partialCredit: { weight: 3 } } });
    expect(r.nistText).toMatch(/multifactor/i);
    expect((await call(OPERATOR, 'GET', '/requirements?family=AC&pageSize=50')).body.pagination.totalItems).toBe(22);
    expect((await call(OPERATOR, 'GET', '/requirements?level=L1&pageSize=50')).body.pagination.totalItems).toBe(17);
    expect((await call(OPERATOR, 'GET', '/requirements?type=Basic&pageSize=50')).body.pagination.totalItems).toBe(30);
    expect((await call(OPERATOR, 'GET', '/requirements?page=2&pageSize=20')).body.data[0].controlId).toBe('AC.L2-3.1.21');
    expect((await call(OPERATOR, 'GET', '/families')).body.data).toHaveLength(14);
  });

  test('errors use the envelope; bad paging is 400; unknown requirement is 404', async () => {
    const bad = await call(OPERATOR, 'GET', '/requirements?pageSize=500');
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatchObject({ code: 'INVALID_PAGING' });
    const missing = await call(OPERATOR, 'GET', '/requirements/AC.L2-9.9.9');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('REQUIREMENT_NOT_FOUND');
    expect(missing.body.error.requestId).toBeTruthy();
  });

  test('requirement text and weight cannot be changed through metadata (strict schema)', async () => {
    const res = await call(ADMIN_A, 'POST', '/items/requirement_meta', {
      control_id: 'AC.L2-3.1.3',
      priority: 'high',
      modules: ['muster'],
      implementation_guidance: '',
      practice: 'rewritten',
      weight: 1,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('governed edits', () => {
  test('draft → no self-approval → second admin publishes → readers see it', async () => {
    const created = await call(ADMIN_A, 'POST', '/items/archetype', archetype());
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ version: 1, status: 'draft' });

    // Readers do not see drafts.
    expect((await call(OPERATOR, 'GET', '/items/archetype/EMX-TEST-001')).status).toBe(404);
    expect((await call(OPERATOR, 'GET', '/items/archetype')).body.data.some((v: { key: string }) => v.key === 'EMX-TEST-001')).toBe(false);

    const self = await call(ADMIN_A, 'POST', '/items/archetype/EMX-TEST-001/publish');
    expect(self.status).toBe(403);
    expect(self.body.error.code).toBe('SELF_APPROVAL');

    const pub = await call(ADMIN_B, 'POST', '/items/archetype/EMX-TEST-001/publish');
    expect(pub.status).toBe(200);
    expect(pub.body.data).toMatchObject({ status: 'published', published_by: 'admin-b' });
    const seen = await call(OPERATOR, 'GET', '/items/archetype/EMX-TEST-001');
    expect(seen.body.data.current.name).toBe('Test evidence');

    const log = await call(ADMIN_A, 'GET', '/changes?kind=archetype&key=EMX-TEST-001');
    expect(log.body.data.map((c: { action: string }) => c.action)).toEqual(['publish', 'draft.create']);
  });

  test('editing a published item makes version 2; version 1 stays current until 2 is published', async () => {
    const edit = await call(ADMIN_B, 'PUT', '/items/archetype/EMX-TEST-001', archetype({ name: 'Test evidence v2' }));
    expect(edit.body.data).toMatchObject({ version: 2, status: 'draft' });
    expect((await call(OPERATOR, 'GET', '/items/archetype/EMX-TEST-001')).body.data.current.name).toBe('Test evidence');
    // Second save updates the same draft, not a third version.
    expect((await call(ADMIN_B, 'PUT', '/items/archetype/EMX-TEST-001', archetype({ name: 'Test evidence v2b' }))).body.data.version).toBe(2);
    expect((await call(ADMIN_A, 'POST', '/items/archetype/EMX-TEST-001/publish')).status).toBe(200);
    const item = (await call(ADMIN_A, 'GET', '/items/archetype/EMX-TEST-001')).body.data;
    expect(item.current.name).toBe('Test evidence v2b');
    expect(item.versions.map((v: { version: number; status: string }) => `${v.version}:${v.status}`)).toEqual(['2:published', '1:retired']);
  });

  test('the identifying code cannot change; creating an existing item is 409', async () => {
    const changed = await call(ADMIN_A, 'PUT', '/items/archetype/EMX-TEST-001', archetype({ code: 'EMX-TEST-002' }));
    expect(changed.status).toBe(400);
    expect(changed.body.error.code).toBe('KEY_CHANGED');
    expect((await call(ADMIN_A, 'POST', '/items/archetype', archetype())).status).toBe(409);
    expect((await call(ADMIN_A, 'POST', '/items/archetype', archetype({ code: 'emx-test-003' }))).status).toBe(400);
  });

  test('references are checked: unknown requirement or archetype is refused', async () => {
    const m = { archetype_code: 'EMX-TEST-001', mapping_type: 'required', expected_strength: 'strong', assessor_methods: ['examine'], rationale: 'r', truth_tag: 'FACT', anti_patterns: [] };
    expect((await call(ADMIN_A, 'POST', '/items/mapping', { ...m, control_id: 'AC.L2-3.9.99' })).body.error.code).toBe('UNKNOWN_REQUIREMENT');
    expect((await call(ADMIN_A, 'POST', '/items/mapping', { ...m, control_id: 'AC.L2-3.1.3', archetype_code: 'EMX-NOPE-001' })).body.error.code).toBe('UNKNOWN_ARCHETYPE');
    const ok = await call(ADMIN_A, 'POST', '/items/mapping', { ...m, control_id: 'AC.L2-3.1.3' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.item_key).toBe('AC.L2-3.1.3::EMX-TEST-001');
    expect((await call(ADMIN_B, 'POST', `/items/mapping/${encodeURIComponent('AC.L2-3.1.3::EMX-TEST-001')}/publish`)).status).toBe(200);
  });

  test('an archetype in use by a published mapping cannot be retired', async () => {
    const res = await call(ADMIN_A, 'POST', '/items/archetype/EMX-TEST-001/retire');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('IN_USE');
    const key = encodeURIComponent('AC.L2-3.1.3::EMX-TEST-001');
    expect((await call(ADMIN_A, 'POST', `/items/mapping/${key}/retire`)).status).toBe(200);
    expect((await call(ADMIN_A, 'POST', '/items/archetype/EMX-TEST-001/retire')).status).toBe(200);
    expect((await call(OPERATOR, 'GET', '/items/archetype/EMX-TEST-001')).status).toBe(404);
  });

  test('a draft can be discarded; published versions cannot be deleted', async () => {
    await call(ADMIN_A, 'PUT', '/items/rule/EVR-AC.L2-3.1.3', {
      ...(await call(ADMIN_A, 'GET', '/items/rule/EVR-AC.L2-3.1.3')).body.data.current,
      name: 'Changed name',
    });
    expect((await call(ADMIN_A, 'DELETE', '/items/rule/EVR-AC.L2-3.1.3/draft')).status).toBe(204);
    expect((await call(ADMIN_A, 'DELETE', '/items/rule/EVR-AC.L2-3.1.3/draft')).status).toBe(404);
    expect((await call(OPERATOR, 'GET', '/items/rule/EVR-AC.L2-3.1.3')).body.data.current.name).toBe('Signal check — AC.L2-3.1.3');
    await expect(fake.sharedItem.delete({ where: { id: fake.items().find((r) => r.status === 'published')!.id } })).rejects.toThrow('only drafts');
  });

  test('rules: logic is data only; dates must be in order', async () => {
    const rule = (await call(ADMIN_A, 'GET', '/items/rule/EVR-AC.L2-3.1.3')).body.data.current;
    const code = await call(ADMIN_A, 'PUT', '/items/rule/EVR-AC.L2-3.1.3', { ...rule, logic: { ...rule.logic, script: 'process.exit()' } });
    expect(code.body.error.code).toBe('VALIDATION_FAILED');
    const dates = await call(ADMIN_A, 'PUT', '/items/rule/EVR-AC.L2-3.1.3', { ...rule, effective_from: '2026-12-01', effective_to: '2026-01-01' });
    expect(dates.body.error.details.issues[0].path).toBe('effective_to');
  });

  test('if the change log cannot be written, the draft is not saved either', async () => {
    const before = fake.items().length;
    fake.failNextChange();
    const res = await call(ADMIN_A, 'POST', '/items/archetype', archetype({ code: 'EMX-TEST-009' }));
    expect(res.status).toBe(500);
    expect(fake.items().length).toBe(before);
  });
});

describe('roles', () => {
  test('readers can read; only platform administrators can edit, publish or export', async () => {
    expect((await call(ASSESSOR, 'GET', '/summary')).status).toBe(200);
    for (const [m, p] of [
      ['POST', '/items/archetype'],
      ['PUT', '/items/archetype/EMX-BOUNDARY-001'],
      ['POST', '/items/archetype/EMX-BOUNDARY-001/publish'],
      ['POST', '/items/archetype/EMX-BOUNDARY-001/retire'],
      ['DELETE', '/items/archetype/EMX-BOUNDARY-001/draft'],
      ['GET', '/export'],
    ]) {
      expect((await call(OPERATOR, m, p, m === 'GET' || m === 'DELETE' ? undefined : archetype())).status).toBe(403);
    }
    const noAuth = await fetch(`${base}/summary`);
    expect(noAuth.status).toBe(401);
  });

  test('export holds published content only', async () => {
    await call(ADMIN_A, 'POST', '/items/archetype', archetype({ code: 'EMX-TEST-005' }));
    const exp = await call(ADMIN_B, 'GET', '/export');
    expect(exp.status).toBe(200);
    expect(exp.body.artifact).toBe('ces-shared-governed-release');
    const codes = exp.body.items.archetype.map((a: { code: string }) => a.code);
    expect(codes).not.toContain('EMX-TEST-005');
    expect(codes).toContain('EMX-BOUNDARY-001');
    expect(exp.body.items.mapping).toHaveLength(450);
  });

  test('summary counts', async () => {
    const s = (await call(OPERATOR, 'GET', '/summary')).body.data;
    expect(s.requirements).toBe(110);
    expect(s.items.rule.published).toBe(107);
    expect(s.items.archetype.draft).toBe(1);
  });
});
