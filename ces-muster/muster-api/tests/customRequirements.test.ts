// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// S1.9 (demo feedback 2026-10-27): organisation-defined requirements — create,
// edit, publish by a second administrator, delete/retire — and the extra
// metadata fields on the 110. The 110 NIST IDs stay reserved.
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'node:http';
import { createFakeSharedDb } from './support/fakeSharedDb.js';
import { createCesSharedRouter } from '../src/routes/cesShared.js';
import { mintToken } from '../src/lib/jwt.js';

const fake = createFakeSharedDb();
let server: http.Server;
let base: string;
const tok = (sub: string, role: string) => mintToken({ sub, tenant_id: 't-bhd', party_id: null, role });
const A = tok('admin-a', 'platform_admin');
const B = tok('admin-b', 'platform_admin');
const OP = tok('op-1', 'bhd_operator');

async function call(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const custom = (over: Record<string, unknown> = {}) => ({
  control_id: 'ORG-AC-01',
  title: 'Visitor access log',
  family: 'PE',
  priority: 'medium',
  description: 'Keep a log of visitors to areas where CUI is handled.',
  source_standard: 'Organization-defined',
  source_section: '',
  modules: ['muster', 'evidenceops'],
  implementation_guidance: '',
  assessment_criteria: 'Log reviewed monthly.',
  related: ['PE.L1-3.10.3'],
  dependent: [],
  references: ['https://example.com/policy'],
  status: 'active',
  effective_date: '2026-11-01',
  ...over,
});

beforeAll(() => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/ces-shared', createCesSharedRouter(fake));
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1/ces-shared`;
});
afterAll(() => server?.close());

describe('organisation-defined requirements', () => {
  test('create is a draft; IDs of the 110, unknown families and unknown links are refused', async () => {
    expect((await call(A, 'POST', '/items/custom_requirement', custom({ control_id: 'AC.L1-3.1.1' }))).body.error.code).toBe('RESERVED_REQUIREMENT_ID');
    expect((await call(A, 'POST', '/items/custom_requirement', custom({ family: 'ZZ' }))).body.error.code).toBe('UNKNOWN_FAMILY');
    expect((await call(A, 'POST', '/items/custom_requirement', custom({ related: ['NOPE-1'] }))).body.error.code).toBe('UNKNOWN_REQUIREMENT');
    expect((await call(A, 'POST', '/items/custom_requirement', custom({ references: ['javascript:alert(1)'] }))).status).toBe(400);
    expect((await call(OP, 'POST', '/items/custom_requirement', custom())).status).toBe(403);
    const ok = await call(A, 'POST', '/items/custom_requirement', custom());
    expect(ok.status).toBe(201);
    expect(ok.body.data.status).toBe('draft');
  });

  test('the author cannot publish; a second administrator can; a published one is retired, not deleted', async () => {
    expect((await call(A, 'POST', '/items/custom_requirement/ORG-AC-01/publish')).status).toBe(403);
    expect((await call(B, 'POST', '/items/custom_requirement/ORG-AC-01/publish')).status).toBe(200);
    const edit = await call(A, 'PUT', '/items/custom_requirement/ORG-AC-01', custom({ title: 'Visitor access log (updated)' }));
    expect(edit.status).toBe(200);
    expect((await call(A, 'DELETE', '/items/custom_requirement/ORG-AC-01/draft')).status).toBe(204);
    expect((await call(B, 'POST', '/items/custom_requirement/ORG-AC-01/retire')).status).toBe(200);
  });

  test('the 110 accept the new metadata fields, and older drafts without them stay valid', async () => {
    const meta = { control_id: 'AC.L1-3.1.1', priority: 'high', modules: ['muster'], implementation_guidance: '' };
    expect((await call(A, 'POST', '/items/requirement_meta', meta)).status).toBe(201);
    const more = await call(A, 'PUT', '/items/requirement_meta/AC.L1-3.1.1', { ...meta, assessment_criteria: 'MFA on all accounts', related: ['AC.L1-3.1.2'], references: [], status: 'active', effective_date: null });
    expect(more.status).toBe(200);
  });
});
