// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// smoke-postgres.ts — the lifecycle walk against a REAL Postgres (2026-11-11).
//
//   DATABASE_URL=postgresql://muster_app:…@localhost:5432/muster_db JWT_SECRET=… \
//     npx tsx scripts/smoke-postgres.ts
//
// Why: the unit suites run on an in-memory mockDb and mock fetch by URL suffix,
// so defects that only a real database or a real client path shows (unknown
// columns, enum values, double /api prefixes) stayed green. This script signs
// in and performs one write per lifecycle slice through the HTTP app, exactly
// as the portal does. Exit 1 on the first failure. CI runs it with a Postgres
// service after `prisma migrate deploy` + bootstrap-app-role.sql.

import 'dotenv/config';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { app } from '../src/app.js';
import { db } from '../src/lib/prisma.js';

const RUN = randomUUID().slice(0, 8);
const PW = 'Smoke!' + RUN;

async function main(): Promise<number> {
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const tenant = await db.tenant.create({ data: { name: `Smoke ${RUN}` } });
  const hash = await bcrypt.hash(PW, 4);
  const mk = (role: 'compliance_manager' | 'bhd_operator' | 'senior_approver', who: string) => db.user.create({ data: { tenant_id: tenant.id, email: `${who}-${RUN}@smoke.local`, role, password_hash: hash } });
  await mk('compliance_manager', 'cm'); await mk('bhd_operator', 'bhd1'); await mk('bhd_operator', 'bhd2'); await mk('senior_approver', 'sa');
  const tokens: Record<string, string> = {};
  const login = async (who: string) => { const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${who}-${RUN}@smoke.local`, password: PW }) }); const j = await r.json() as { token?: string }; if (!r.ok || !j.token) throw new Error(`login ${who} → ${r.status}`); tokens[who] = j.token; };
  for (const w of ['cm', 'bhd1', 'bhd2', 'sa']) await login(w);

  let step = '';
  const call = async (who: string, method: string, path: string, body?: unknown, expect: number[] = [200, 201, 202]) => {
    const r = await fetch(`${base}/api${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[who]}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text(); let j: unknown = text; try { j = JSON.parse(text); } catch { /* text */ }
    if (!expect.includes(r.status)) throw new Error(`${step}: ${method} ${path} as ${who} → ${r.status} ${text.slice(0, 300)}`);
    console.log(`  ok  ${method.padEnd(6)} ${path} → ${r.status}`);
    return j as Record<string, never>;
  };

  try {
    step = 'onboard';
    const org = await call('cm', 'POST', '/organizations', { legal_name: `Smoke Org ${RUN}`, uei: 'ABCD1234EFGH', cage: '1A2B3', contract_clauses: ['DFARS 252.204-7012'] });
    await call('cm', 'POST', '/customer-tenants', { display_name: 'Smoke GCC High', tenant_id: randomUUID(), primary_domain: `smoke${RUN}.onmicrosoft.us`, cloud: 'gcc_high', organization_id: org.id });
    const eng = await call('cm', 'POST', '/engagements', { name: `Smoke L2 ${RUN}`, engagement_kind: 'individual_contractor', cmmc_level: 2, target_date: '2027-03-31' });
    const E = `/engagements/${eng.id}`;
    await call('cm', 'POST', `${E}/scope/assets`, { name: 'FS-01', asset_type: 'file server', category: 'cui' });
    const b = await call('cm', 'POST', `${E}/scope/boundaries`, { description: 'CUI enclave' });
    await call('cm', 'POST', `${E}/scope/boundaries/${b.id}/confirm`, {});
    await call('cm', 'POST', `${E}/systems`, { name: 'File services', kind: 'system', hosting: 'gcc_high', handles_cui: true });
    await call('cm', 'GET', `${E}/onboard/checklist`);

    step = 'assess';
    const run = await call('cm', 'POST', `${E}/assessments`, { schema_version: 'readiness-result/1.1.0', observations: [ { control_id: 'AC.L1-3.1.1', objective_ids: ['AC.L1-3.1.1[a]'], confidence: 'high', ran_entry_ids: [], derived_posture: 'met' }, { control_id: 'IA.L2-3.5.3', objective_ids: [], confidence: 'high', ran_entry_ids: [], derived_posture: 'not_met' } ] });
    await call('cm', 'GET', `${E}/assessments/${run.id}/gaps`);
    await call('cm', 'PATCH', `${E}/assessments/${run.id}/results/IA.L2-3.5.3`, { status: 'partial', reason: 'MFA rolled out to 80% of accounts' });

    step = 'plan';
    await call('cm', 'POST', `${E}/plan/actions/generate`, { run_id: run.id });
    await call('cm', 'GET', `${E}/plan/summary`);
    await call('cm', 'POST', `${E}/plan/poam/from-actions`, {});

    step = 'remediate';
    const ao = await call('cm', 'POST', `${E}/remediation/runs`, { module: 'adminops', op_id: 'A-01', parameters: { upn: `u${RUN}@smoke.onmicrosoft.us`, displayName: 'Smoke User' }, justification: 'New starter onboarding (smoke)' });
    await call('sa', 'POST', `${E}/remediation/runs/${ao.id}/approve`, {});
    await call('cm', 'POST', `${E}/remediation/runs/${ao.id}/execute`, {});
    await call('cm', 'POST', `${E}/remediation/runs/${ao.id}/verify`, { verified: true, notes: 'Simulated run verified (smoke)' });
    const st = await call('bhd1', 'POST', `${E}/remediation/runs`, { module: 'stamper', entry_ids: ['tenant:AC.L2-3.1.1.operator-discover'], justification: 'Evidence read only (smoke)' });
    await call('bhd2', 'POST', `${E}/remediation/runs/${st.id}/approve`, {}, [200, 409]);
    await call('cm', 'GET', `${E}/remediation/runs/${st.id}`, undefined, [404]);

    step = 'evidence';
    const ev = await call('cm', 'POST', `${E}/evidence/items`, { title: 'Access Control Policy v3 (approved)', requirement_ids: ['AC.L1-3.1.1'], kind: 'document', definition_id: 'AC.L2-3.1.1#E01', file_name: 'acp.txt', content_type: 'text/plain', content_base64: Buffer.from('policy text').toString('base64') });
    if ((ev.metadata as { definition_id?: string })?.definition_id !== 'AC.L2-3.1.1#E01') throw new Error('evidence: definition_id not recorded in metadata');
    await call('cm', 'GET', `${E}/evidence/nist-catalog/AC.L1-3.1.1`);
    await call('cm', 'GET', `${E}/evidence/coverage`);
    await call('cm', 'POST', `${E}/evidence/nist-catalog/validate`, { rows: [{ definition_id: 'AC.L2-3.1.2#E01', requirement_id: 'AC.L2-3.1.2', nist_ref: '3.1.2', examine_index: 1, examine_text: 'Access control policy', form_id: 'acp', form_title: 'ACP', emx_ids: [], objective_ids: [], tier: 'must_have', production: 'attested', status_effect: 'none', status: 'draft' }] });

    step = 'monitor';
    await call('cm', 'POST', `${E}/monitor/evaluate`, {});
    await call('cm', 'GET', `${E}/monitor/summary`);
    await call('cm', 'GET', `${E}/monitor/activity?limit=50`);

    step = 'prepare';
    await call('cm', 'GET', `${E}/prepare/readiness`);
    await call('cm', 'POST', `${E}/prepare/ssp/statements/generate-drafts`, {});
    await call('cm', 'GET', `${E}/prepare/reports/evidence?format=csv`, undefined, [200, 404]);

    step = 'admin';
    await call('cm', 'GET', '/admin/settings');
    await call('cm', 'GET', '/admin/health');
    console.log(`smoke: every slice wrote and read against Postgres (tenant ${tenant.name}).`);
    return 0;
  } catch (e) {
    console.error(`smoke FAILED — ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  } finally {
    server.close();
    // Leave the smoke tenant behind on purpose when it failed (inspect), remove it on success.
  }
}

main().then(async (code) => { if (code === 0) { try { const t = await db.tenant.findFirst({ where: { name: `Smoke ${RUN}` } }); if (t) await db.tenant.delete({ where: { id: t.id } }); } catch { /* cascade may be partial; harmless */ } } await db.$disconnect(); process.exit(code); });
