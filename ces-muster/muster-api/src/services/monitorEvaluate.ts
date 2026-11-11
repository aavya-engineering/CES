// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// monitorEvaluate.ts — one monitoring evaluation for (tenant, engagement)
// (2026-11-10). Called by POST /monitor/evaluate ("Evaluate now") and by the
// in-process scheduler (monitorScheduler.ts) on the tenant's cadence.
//
// Deterministic findings with stable keys (deriveFindings); findings that no
// longer derive are auto-cleared; the ONLY state change outside monitoring
// tables is: validated evidence older than the tenant's evidence_currency_days
// (default 365) expires. Every evaluation writes a snapshot and an audit row.

import { withTenant } from '../lib/prisma.js';
import { audit } from '../lib/audit.js';
import { CONTROL_REFS } from '../routes/assessments.js';
import { coverage, type Catalogue } from './evidenceValidation.js';
import { deriveFindings, type Finding } from './monitorEngine.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface EvaluateContext {
  tenant_id: string;
  engagement_id: string;
  /** Person who clicked "Evaluate now", or the scheduler's system actor. */
  actor: { sub: string; role: string; tenant_id: string };
  now?: Date;
  evidenceCurrencyDays?: number;
}

export interface EvaluateOutcome { created: number; updated: number; cleared: number; expired_evidence: number; open: number; snapshot: unknown }

const byDesc = (k: string) => (a: Record<string, Date | string>, b: Record<string, Date | string>) => +new Date(b[k]) - +new Date(a[k]);

async function catalogue(db: Db): Promise<Catalogue> {
  const rows = await db.sharedItem.findMany({ where: { status: 'published' } });
  const pick = (kind: string) => rows.filter((x: { kind: string }) => x.kind === kind).map((x: { data: unknown }) => x.data);
  return { archetypes: pick('archetype'), mappings: pick('mapping'), rules: pick('rule') };
}

export async function evaluateEngagement(db: Db, ctx: EvaluateContext): Promise<EvaluateOutcome> {
  const now = ctx.now ?? new Date();
  const e = ctx.engagement_id;
  const tx = (fn: (t: Db) => Promise<any>): Promise<any> => withTenant(ctx.tenant_id, fn, db); // eslint-disable-line @typescript-eslint/no-explicit-any
  // One tenant transaction for all reads (review I8).
  const [cat, rows] = await Promise.all([
    catalogue(db),
    tx(async (t) => ({
      runs: await t.assessmentRun.findMany({ where: { engagement_id: e } }),
      actions: await t.planAction.findMany({ where: { engagement_id: e } }),
      poam: await t.poamItem.findMany({ where: { engagement_id: e } }),
      remRuns: await t.remediationRun.findMany({ where: { engagement_id: e } }),
      evidence: await t.evidenceItem.findMany({ where: { engagement_id: e }, omit: { content: true } }),
      boundaries: await t.scopeBoundary.findMany({ where: { engagement_id: e } }),
      assets: await t.scopeAsset.findMany({ where: { engagement_id: e } }),
      tenants: await t.customerTenant.findMany({ where: { tenant_id: ctx.tenant_id } }),
      requests: await t.evidenceRequest.findMany({ where: { engagement_id: e } }),
    })),
  ]);
  const { runs, actions, poam, remRuns, evidence, boundaries, assets, tenants, requests } = rows;
  runs.sort(byDesc('created_at'));
  const resultsByRun: Record<string, unknown[]> = {};
  for (const run of runs.slice(0, 2)) resultsByRun[run.id] = await tx((t) => t.assessmentResult.findMany({ where: { run_id: run.id } }));
  const cov = coverage(CONTROL_REFS.map((c) => c.control_id), cat, evidence);

  // The one state change: validated evidence older than the currency window expires.
  const currencyMs = (ctx.evidenceCurrencyDays ?? 365) * 86_400_000;
  let expired = 0;
  for (const ev of evidence) {
    if (ev.status === 'validated' && now.getTime() - new Date(ev.collected_at).getTime() > currencyMs) {
      await tx((t) => t.evidenceItem.update({ where: { id: ev.id }, data: { status: 'expired', updated_at: now } }));
      ev.status = 'expired';
      expired++;
    }
  }
  const derived: Finding[] = deriveFindings({ now, runs, resultsByRun: resultsByRun as never, actions, poam, remediationRuns: remRuns, evidence, coverage: cov, boundaries, scopeAssets: assets, tenants, requests });
  const existing = await tx((t) => t.monitorFinding.findMany({ where: { engagement_id: e } }));
  const byKey = new Map(existing.map((f: { key: string }) => [f.key, f]));
  let created = 0, updated = 0, cleared = 0;
  const seen = new Set<string>();
  for (const f of derived) {
    seen.add(f.key);
    const cur = byKey.get(f.key) as { id: string; status: string; seen_count: number } | undefined;
    if (!cur) { await tx((t) => t.monitorFinding.create({ data: { tenant_id: ctx.tenant_id, engagement_id: e, key: f.key, category: f.category, severity: f.severity, title: f.title, detail: f.detail ?? null, requirement_id: f.requirement_id ?? null, target_type: f.target_type ?? null, target_id: f.target_id ?? null, status: 'open', first_seen_at: now, last_seen_at: now, seen_count: 1 } })); created++; }
    else if (cur.status === 'resolved') { await tx((t) => t.monitorFinding.update({ where: { id: cur.id }, data: { status: 'open', severity: f.severity, title: f.title, detail: f.detail ?? null, last_seen_at: now, seen_count: (cur.seen_count ?? 1) + 1, resolved_by: null, resolved_at: null, resolution: null } })); created++; }
    else { await tx((t) => t.monitorFinding.update({ where: { id: cur.id }, data: { severity: f.severity, title: f.title, detail: f.detail ?? null, last_seen_at: now, seen_count: (cur.seen_count ?? 1) + 1 } })); updated++; }
  }
  for (const f of existing as { id: string; key: string; status: string }[]) {
    if (!seen.has(f.key) && f.status !== 'resolved') { await tx((t) => t.monitorFinding.update({ where: { id: f.id }, data: { status: 'resolved', resolved_by: 'monitor', resolved_at: now, resolution: 'cleared' } })); cleared++; }
  }
  const open = derived.length;
  const latest = runs[0] ?? null;
  const fam: Record<string, { met: number; total: number }> = {};
  for (const row of (resultsByRun[latest?.id ?? ''] ?? []) as { family: string; status: string }[]) { const f = fam[row.family] ?? { met: 0, total: 0 }; f.total++; if (row.status === 'met') f.met++; fam[row.family] = f; }
  const snapshot = await tx((t) => t.monitorSnapshot.create({ data: {
    tenant_id: ctx.tenant_id, engagement_id: e, taken_at: now, triggered_by: ctx.actor.sub,
    sprs_now: latest?.sprs_now ?? null, met_count: latest?.met_count ?? null, not_met_count: latest?.not_met_count ?? null, partial_count: latest?.partial_count ?? null, unknown_count: latest?.unknown_count ?? null,
    open_actions: actions.filter((a: { status: string }) => a.status !== 'done' && a.status !== 'wont_fix').length,
    overdue_actions: actions.filter((a: { status: string; due_date: Date | null }) => a.status !== 'done' && a.status !== 'wont_fix' && a.due_date && new Date(a.due_date) < now).length,
    open_poam: poam.filter((p: { status: string }) => p.status === 'open' || p.status === 'ongoing').length,
    evidence_validated: evidence.filter((x: { status: string }) => x.status === 'validated').length,
    evidence_pending: evidence.filter((x: { status: string }) => x.status === 'submitted' || x.status === 'draft').length,
    coverage_covered: cov.filter((c) => c.state === 'covered').length, coverage_missing: cov.filter((c) => c.state === 'missing').length,
    findings_open: open, findings_critical: derived.filter((f) => f.severity === 'critical').length, by_family: fam,
  } }));
  await audit(db, { action: 'monitor.evaluate', actor: ctx.actor, target_type: 'engagement', target_id: e, tenant_id: ctx.tenant_id, detail: { created, updated, cleared, expired, open, triggered_by: ctx.actor.sub } });
  return { created, updated, cleared, expired_evidence: expired, open, snapshot };
}
