// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// PRD v5 MU-FR-16 (Must): push only to a tenant in the ces-tenant registry;
// refuse any other push with a named error, and write nothing.
//
// Part 1 drives lookupRegisteredTenant() over every read location ces-tenant's
// FileTenantRegistry.get() uses. Part 2 drives the real createPlanRouter().
import { describe, test, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import express from 'express';
import { lookupRegisteredTenant } from '../src/lib/tenantRegistryGate.js';
import { createPlanRouter } from '../src/routes/plan.js';
import { mintToken } from '../src/lib/jwt.js';
import { registerTestTenant } from './support/tenantRegistry';

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf-8');
}

describe('MU-FR-16 lookupRegisteredTenant — read order and fail-closed rules', () => {
  let root: string;
  let registryRoot: string;
  let planData: string;
  let homeDir: string;
  const opts = () => ({
    registryRoot,
    stamperTenantRoot: (slug: string) => path.join(planData, slug),
    homeDir,
  });

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'muster-registry-gate-'));
    registryRoot = path.join(root, 'registry');
    planData = path.join(root, 'plan-data');
    homeDir = path.join(root, 'home');
  });

  test('an unknown slug is not registered', () => {
    expect(lookupRegisteredTenant('nobody-here', opts())).toEqual({ status: 'not_registered' });
  });

  test('registry root: live and sim namespaces give their kind and tenant id', () => {
    registerTestTenant(registryRoot, 'acme-live', 'live', '11111111-2222-4333-8444-555555555555');
    registerTestTenant(registryRoot, 'acme-sim', 'sim');
    const live = lookupRegisteredTenant('acme-live', opts());
    expect(live).toMatchObject({
      status: 'registered',
      tenant: { kind: 'live', tenantId: '11111111-2222-4333-8444-555555555555', source: 'registry' },
    });
    expect(lookupRegisteredTenant('acme-sim', opts())).toMatchObject({
      status: 'registered',
      tenant: { kind: 'sim', source: 'registry' },
    });
  });

  test('a slug in BOTH namespaces is the A9 collision → invalid (never guessed)', () => {
    registerTestTenant(registryRoot, 'twice', 'live');
    registerTestTenant(registryRoot, 'twice', 'sim');
    expect(lookupRegisteredTenant('twice', opts())).toMatchObject({ status: 'invalid' });
  });

  test('a record whose kind disagrees with its namespace → invalid', () => {
    writeJson(path.join(registryRoot, 'live', 'miskinded.json'), {
      kind: 'sim',
      tenant: { tenant_id: '00000000-0000-4000-8000-000000000001' },
    });
    expect(lookupRegisteredTenant('miskinded', opts())).toMatchObject({ status: 'invalid' });
  });

  test('a record without tenant.tenant_id, or not JSON, → invalid', () => {
    writeJson(path.join(registryRoot, 'sim', 'no-tid.json'), { kind: 'sim', tenant: {} });
    fs.mkdirSync(path.join(registryRoot, 'live'), { recursive: true });
    fs.writeFileSync(path.join(registryRoot, 'live', 'garbled.json'), '{not json', 'utf-8');
    expect(lookupRegisteredTenant('no-tid', opts())).toMatchObject({ status: 'invalid' });
    expect(lookupRegisteredTenant('garbled', opts())).toMatchObject({ status: 'invalid' });
  });

  test('Stamper plan-data tenant object (stacksim --emit-plan-data) counts; gcc-high-sim → sim', () => {
    writeJson(path.join(planData, 'stacksim-emitted', 'stacksim-emitted.json'), {
      client: { slug: 'stacksim-emitted' },
      tenant: { tenant_id: '00000000-0000-4000-8000-000000000002', environment: 'gcc-high-sim' },
    });
    expect(lookupRegisteredTenant('stacksim-emitted', opts())).toMatchObject({
      status: 'registered',
      tenant: { kind: 'sim', source: 'plan-data' },
    });
  });

  test('a plan-data folder holding only pushed plans is NOT a registration', () => {
    fs.mkdirSync(path.join(planData, 'pushed-only', 'plans'), { recursive: true });
    fs.mkdirSync(path.join(planData, 'pushed-only', 'state'), { recursive: true });
    expect(lookupRegisteredTenant('pushed-only', opts())).toEqual({ status: 'not_registered' });
  });

  test('legacy ~/.stamper/tenants (flat, then nested) counts; no kind → live', () => {
    writeJson(path.join(homeDir, '.stamper', 'tenants', 'old-flat.json'), {
      tenant: { tenant_id: '00000000-0000-4000-8000-000000000003' },
    });
    writeJson(path.join(homeDir, '.stamper', 'tenants', 'old-nested', 'old-nested.json'), {
      tenant: { tenant_id: '00000000-0000-4000-8000-000000000004' },
    });
    expect(lookupRegisteredTenant('old-flat', opts())).toMatchObject({
      status: 'registered',
      tenant: { kind: 'live', source: 'legacy' },
    });
    expect(lookupRegisteredTenant('old-nested', opts())).toMatchObject({
      status: 'registered',
      tenant: { source: 'legacy' },
    });
  });

  test('the lookup writes nothing (no migrate-forward into the registry)', () => {
    writeJson(path.join(homeDir, '.stamper', 'tenants', 'old-flat.json'), {
      tenant: { tenant_id: '00000000-0000-4000-8000-000000000003' },
    });
    lookupRegisteredTenant('old-flat', opts());
    expect(fs.existsSync(registryRoot)).toBe(false);
  });
});

describe('MU-FR-16 POST /api/plan/push — only registered tenants receive a plan', () => {
  const FIXTURE_DIR = path.resolve(__dirname, '../../src/features/plan/__fixtures__');
  const mp = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'manual-mission-plan.json'), 'utf8'));
  const tm = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'tenant-manifest.json'), 'utf8'));

  const TENANT_A = '00000000-aaaa-0000-0000-0000000mufr1';
  const TENANT_B = '00000000-bbbb-0000-0000-0000000mufr2';
  const A_OPERATOR = mintToken({ sub: 'u-op-a', tenant_id: TENANT_A, party_id: null, role: 'bhd_operator' });
  const B_PRIME = mintToken({ sub: 'u-prime-b', tenant_id: TENANT_B, party_id: null, role: 'prime' });

  const REGISTERED = 'mufr16-registered';
  const UNREGISTERED = 'mufr16-not-registered';
  const BROKEN = 'mufr16-broken';

  let server: http.Server;
  let base: string;
  let pipelineRoot: string;
  let savedPipelineRoot: string | undefined;

  const push = (token: string, slug: string) =>
    fetch(`${base}/api/plan/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tenant_slug: slug, missionPlan: mp, tenantManifest: tm }),
    });
  const tenantDir = (slug: string) => path.join(pipelineRoot, 'Stamper', 'plan-data', slug);

  beforeAll(() => {
    savedPipelineRoot = process.env.CES_PIPELINE_ROOT;
    pipelineRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'muster-mufr16-pipeline-'));
    process.env.CES_PIPELINE_ROOT = pipelineRoot;
    // The setup file points CES_TENANT_ROOT at this file's throwaway registry.
    const registryRoot = process.env.CES_TENANT_ROOT!;
    registerTestTenant(registryRoot, REGISTERED, 'sim');
    registerTestTenant(registryRoot, BROKEN, 'live');
    registerTestTenant(registryRoot, BROKEN, 'sim'); // A9 collision
    const app = express();
    app.use(express.json({ limit: '5mb' }));
    app.use('/api/plan', createPlanRouter());
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });

  afterAll(() => {
    server?.close();
    fs.rmSync(pipelineRoot, { recursive: true, force: true });
    if (savedPipelineRoot === undefined) delete process.env.CES_PIPELINE_ROOT;
    else process.env.CES_PIPELINE_ROOT = savedPipelineRoot;
  });

  test('unregistered slug → 404 TENANT_NOT_AVAILABLE; nothing written, slug not claimed', async () => {
    const res = await push(A_OPERATOR, UNREGISTERED);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'TENANT_NOT_AVAILABLE' });
    expect(fs.existsSync(tenantDir(UNREGISTERED))).toBe(false);
  });

  test('registered slug → 201 and the plan lands in its plans folder', async () => {
    const res = await push(A_OPERATOR, REGISTERED);
    expect(res.status).toBe(201);
    const files = fs.readdirSync(path.join(tenantDir(REGISTERED), 'plans'));
    expect(files.some((f) => f.startsWith('manual-mission-plan-'))).toBe(true);
  });

  test('registered but owned by another organisation → the SAME 404 body (no enumeration)', async () => {
    const foreign = await push(B_PRIME, REGISTERED);
    const unknown = await push(B_PRIME, UNREGISTERED);
    expect(foreign.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(await foreign.json()).toEqual(await unknown.json());
  });

  test('an invalid registry record → 500 TENANT_REGISTRY_INVALID; fail closed, nothing written', async () => {
    const res = await push(A_OPERATOR, BROKEN);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: 'TENANT_REGISTRY_INVALID' });
    expect(fs.existsSync(tenantDir(BROKEN))).toBe(false);
  });
});
