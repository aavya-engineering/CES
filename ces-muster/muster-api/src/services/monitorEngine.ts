// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// monitorEngine.ts — Sprint 6 slice "Monitor": pure derivation of monitoring
// findings from the engagement's own records (runs, results, actions, POA&M,
// remediation runs, evidence, scope, tenants). No tenant is read here: tenant
// signal drift is the Stamper / EvidenceOps run's job (ces-eo drift monitoring);
// this engine watches the compliance programme itself and the records it
// produces. Deterministic, so every finding has a stable key for dedupe.

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export interface Finding { key: string; category: 'score' | 'control' | 'remediation' | 'plan' | 'evidence' | 'scope' | 'tenant'; severity: Severity; title: string; detail?: Record<string, unknown>; requirement_id?: string | null; target_type?: string; target_id?: string }

export interface MonitorInput {
  now: Date;
  runs: { id: string; sprs_now: number; created_at: Date | string }[];                       // newest first
  resultsByRun: Record<string, { requirement_id: string; status: string; weight: number }[]>; // for the two newest runs
  actions: { id: string; title: string; status: string; due_date: Date | string | null; requirement_id: string | null; priority: string }[];
  poam: { id: string; requirement_id: string; status: string; scheduled_completion: Date | string | null; poam_allowed: boolean }[];
  remediationRuns: { id: string; module: string; status: string; requirement_id: string | null; requested_at: Date | string; requested_by: string }[];
  evidence: { id: string; title: string; status: string; collected_at: Date | string; retention_until: Date | string | null; requirement_ids: string[]; updated_at: Date | string; created_by: string | null }[];
  coverage: { requirement_id: string; state: string; missing: string[] }[];
  boundaries: { id: string; version: number; status: string; created_at: Date | string; confirmed_at: Date | string | null }[];
  scopeAssets: { id: string; created_at: Date | string; updated_at: Date | string }[];
  tenants: { id: string; display_name: string; status: string; connection_status: string | null }[];
  requests: { id: string; requirement_id: string; status: string; due_date: Date | string | null }[];
}

const days = (from: Date | string | null | undefined, now: Date) => (from ? (now.getTime() - new Date(from).getTime()) / 86_400_000 : NaN);
const RANK: Record<string, number> = { met: 0, partial: 1, unknown: 2, not_met: 3 };

export function deriveFindings(x: MonitorInput): Finding[] {
  const out: Finding[] = [];
  const { now } = x;

  // ---- score & control drift between the two newest runs
  const [latest, previous] = x.runs;
  if (latest && previous) {
    if (latest.sprs_now < previous.sprs_now) out.push({ key: `score.regression:${latest.id}`, category: 'score', severity: latest.sprs_now < previous.sprs_now - 10 ? 'critical' : 'high', title: `SPRS fell from ${previous.sprs_now} to ${latest.sprs_now}`, detail: { previous: previous.sprs_now, now: latest.sprs_now, run_id: latest.id }, target_type: 'assessment_run', target_id: latest.id });
    const prevBy = new Map((x.resultsByRun[previous.id] ?? []).map((r) => [r.requirement_id, r]));
    for (const r of x.resultsByRun[latest.id] ?? []) {
      const p = prevBy.get(r.requirement_id);
      if (p && RANK[r.status] > RANK[p.status] && p.status === 'met') out.push({ key: `control.regression:${r.requirement_id}`, category: 'control', severity: r.weight >= 5 ? 'critical' : r.weight >= 3 ? 'high' : 'medium', title: `${r.requirement_id} was Met, now ${r.status.replace('_', ' ')}`, detail: { from: p.status, to: r.status, weight: r.weight, run_id: latest.id }, requirement_id: r.requirement_id, target_type: 'assessment_run', target_id: latest.id });
    }
  }
  if (latest && days(latest.created_at, now) > 90) out.push({ key: 'score.stale', category: 'score', severity: days(latest.created_at, now) > 365 ? 'high' : 'medium', title: `Latest assessment run is ${Math.floor(days(latest.created_at, now))} days old`, detail: { run_id: latest.id, created_at: latest.created_at }, target_type: 'assessment_run', target_id: latest.id });
  if (!latest) out.push({ key: 'score.none', category: 'score', severity: 'info', title: 'No assessment run yet — SPRS position unknown', detail: {} });

  // ---- remediation runs
  for (const r of x.remediationRuns) {
    if (r.status === 'failed') out.push({ key: `remediation.failed:${r.id}`, category: 'remediation', severity: 'high', title: `${r.module === 'stamper' ? 'Stamper' : 'AdminOps'} run failed verification`, detail: { run_id: r.id, requirement_id: r.requirement_id }, requirement_id: r.requirement_id, target_type: 'remediation_run', target_id: r.id });
    if (r.status === 'blocked') out.push({ key: `remediation.blocked:${r.id}`, category: 'remediation', severity: 'medium', title: `${r.module === 'stamper' ? 'Stamper' : 'AdminOps'} run blocked by a gate`, detail: { run_id: r.id }, requirement_id: r.requirement_id, target_type: 'remediation_run', target_id: r.id });
    if (r.status === 'requested' && days(r.requested_at, now) > 3) out.push({ key: `remediation.awaiting_approval:${r.id}`, category: 'remediation', severity: 'low', title: `Run awaiting second-person approval for ${Math.floor(days(r.requested_at, now))} days`, detail: { run_id: r.id, requested_by: r.requested_by }, target_type: 'remediation_run', target_id: r.id });
    if (r.status === 'succeeded' && days(r.requested_at, now) > 7) out.push({ key: `remediation.unverified:${r.id}`, category: 'remediation', severity: 'medium', title: 'Finished run not verified by a person', detail: { run_id: r.id }, requirement_id: r.requirement_id, target_type: 'remediation_run', target_id: r.id });
  }

  // ---- plan
  for (const a of x.actions) {
    const open = a.status !== 'done' && a.status !== 'wont_fix';
    if (open && a.due_date && new Date(a.due_date) < now) out.push({ key: `plan.overdue:${a.id}`, category: 'plan', severity: a.priority === 'critical' ? 'critical' : a.priority === 'high' ? 'high' : 'medium', title: `Action overdue: ${a.title.slice(0, 80)}`, detail: { action_id: a.id, due_date: a.due_date, days: Math.floor(-days(a.due_date, now) * -1) }, requirement_id: a.requirement_id, target_type: 'plan_action', target_id: a.id });
    if (a.status === 'blocked') out.push({ key: `plan.blocked:${a.id}`, category: 'plan', severity: 'medium', title: `Action blocked: ${a.title.slice(0, 80)}`, detail: { action_id: a.id }, requirement_id: a.requirement_id, target_type: 'plan_action', target_id: a.id });
  }
  for (const p of x.poam) {
    const open = p.status === 'open' || p.status === 'ongoing';
    if (open && p.scheduled_completion && new Date(p.scheduled_completion) < now) out.push({ key: `plan.poam_overdue:${p.id}`, category: 'plan', severity: 'high', title: `POA&M item past scheduled completion: ${p.requirement_id}`, detail: { poam_id: p.id, scheduled_completion: p.scheduled_completion }, requirement_id: p.requirement_id, target_type: 'poam_item', target_id: p.id });
    if (open && !p.poam_allowed) out.push({ key: `plan.poam_ineligible:${p.id}`, category: 'plan', severity: 'high', title: `${p.requirement_id} cannot be closed on a POA&M — must be implemented before assessment`, detail: { poam_id: p.id }, requirement_id: p.requirement_id, target_type: 'poam_item', target_id: p.id });
  }

  // ---- evidence
  for (const e of x.evidence) {
    if (e.status === 'archived' || e.status === 'rejected') continue;
    const age = days(e.collected_at, now);
    if (age > 365) out.push({ key: `evidence.stale:${e.id}`, category: 'evidence', severity: e.status === 'validated' ? 'high' : 'medium', title: `Evidence older than a year: ${e.title.slice(0, 80)}`, detail: { item_id: e.id, age_days: Math.floor(age), requirement_ids: e.requirement_ids }, requirement_id: e.requirement_ids[0] ?? null, target_type: 'evidence_item', target_id: e.id });
    else if (age > 300) out.push({ key: `evidence.aging:${e.id}`, category: 'evidence', severity: 'low', title: `Evidence will be a year old in ${Math.ceil(365 - age)} days: ${e.title.slice(0, 80)}`, detail: { item_id: e.id, age_days: Math.floor(age) }, requirement_id: e.requirement_ids[0] ?? null, target_type: 'evidence_item', target_id: e.id });
    if (e.retention_until && days(e.retention_until, now) > -30 && days(e.retention_until, now) <= 0) out.push({ key: `evidence.expiring:${e.id}`, category: 'evidence', severity: 'medium', title: `Retention ends within 30 days: ${e.title.slice(0, 80)}`, detail: { item_id: e.id, retention_until: e.retention_until }, target_type: 'evidence_item', target_id: e.id });
    if (e.retention_until && days(e.retention_until, now) > 0) out.push({ key: `evidence.retention_passed:${e.id}`, category: 'evidence', severity: 'medium', title: `Retention date passed — archive or extend: ${e.title.slice(0, 80)}`, detail: { item_id: e.id, retention_until: e.retention_until }, target_type: 'evidence_item', target_id: e.id });
    if (e.status === 'submitted' && days(e.updated_at, now) > 7) out.push({ key: `evidence.review_stuck:${e.id}`, category: 'evidence', severity: 'low', title: `Awaiting review for ${Math.floor(days(e.updated_at, now))} days: ${e.title.slice(0, 80)}`, detail: { item_id: e.id, submitted_by: e.created_by }, target_type: 'evidence_item', target_id: e.id });
  }
  for (const c of x.coverage) if (c.state === 'missing') out.push({ key: `evidence.missing:${c.requirement_id}`, category: 'evidence', severity: 'medium', title: `No evidence yet for ${c.requirement_id} (${c.missing.length} required archetype${c.missing.length === 1 ? '' : 's'})`, detail: { missing: c.missing }, requirement_id: c.requirement_id });
  for (const q of x.requests) if (q.status === 'open' && q.due_date && new Date(q.due_date) < now) out.push({ key: `evidence.request_overdue:${q.id}`, category: 'evidence', severity: 'low', title: `Evidence request overdue: ${q.requirement_id}`, detail: { request_id: q.id, due_date: q.due_date }, requirement_id: q.requirement_id, target_type: 'evidence_request', target_id: q.id });

  // ---- scope
  const confirmed = x.boundaries.find((b) => b.status === 'confirmed') ?? null;
  const draft = x.boundaries.find((b) => b.status === 'draft') ?? null;
  if (!confirmed) out.push({ key: 'scope.unconfirmed', category: 'scope', severity: draft ? 'medium' : 'high', title: draft ? `Boundary v${draft.version} drafted ${Math.floor(days(draft.created_at, now))} days ago, not confirmed` : 'No confirmed CUI boundary', detail: { draft_id: draft?.id ?? null } });
  if (confirmed) {
    const changed = x.scopeAssets.filter((a) => new Date(a.updated_at) > new Date(confirmed.confirmed_at ?? confirmed.created_at)).length;
    if (changed > 0) out.push({ key: `scope.changed:${confirmed.id}`, category: 'scope', severity: 'medium', title: `${changed} scope asset(s) changed since boundary v${confirmed.version} was confirmed — re-confirm`, detail: { boundary_id: confirmed.id, changed }, target_type: 'scope_boundary', target_id: confirmed.id });
  }

  // ---- tenants
  for (const t of x.tenants) if (t.status === 'live_enabled' && t.connection_status !== 'prerequisites_complete') out.push({ key: `tenant.prereq:${t.id}`, category: 'tenant', severity: 'high', title: `${t.display_name} is live-enabled but connection prerequisites are incomplete`, detail: { tenant_id: t.id, connection_status: t.connection_status }, target_type: 'customer_tenant', target_id: t.id });

  return out;
}

export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
