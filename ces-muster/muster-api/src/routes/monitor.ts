// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// monitor.ts — Sprint 6 slice "Monitor" (2026-11-10): continuous monitoring of
// the compliance programme per engagement.
//
//   POST /api/engagements/:engagementId/monitor/evaluate      derive findings (dedupe by key, auto-resolve ones that cleared), take a snapshot
//   GET  /api/engagements/:engagementId/monitor/summary
//   GET  /api/engagements/:engagementId/monitor/findings      ?status=&category=&severity=
//   POST /api/engagements/:engagementId/monitor/findings/:id/ack | /resolve | /escalate   { notes / resolution / to }
//   GET  /api/engagements/:engagementId/monitor/snapshots     trends, oldest first
//   GET  /api/engagements/:engagementId/monitor/activity      tenant audit events (compliance event history), newest first
//
// Evaluate is idempotent: the same state produces the same keys; a finding
// whose key no longer appears is auto-resolved with resolution 'cleared'.
// A validated evidence item older than a year is moved to status 'expired'
// here (the only state change evaluate makes, audited).

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { bearerAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { withTenant } from '../lib/prisma.js';
import { audit } from '../lib/audit.js';
import { CONTROL_REFS } from './assessments.js';
import { coverage, type Catalogue } from '../services/evidenceValidation.js';
import { deriveFindings, SEVERITY_RANK, type Finding } from '../services/monitorEngine.js';

const READ = ['prime', 'bhd_operator', 'assessor_read_only', 'sub'] as const;
const WRITE = ['prime', 'bhd_operator', 'sub'] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
const user = (req: Request) => req.user!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tx = (req: Request, db: Db, fn: (t: Db) => Promise<any>): Promise<any> => withTenant(user(req).tenant_id, fn, db);
const notFound = (res: Response) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });

export const CATEGORIES = ['score', 'control', 'remediation', 'plan', 'evidence', 'scope', 'tenant'] as const;
export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export const FINDING_STATUSES = ['open', 'acknowledged', 'escalated', 'resolved'] as const;

const listQuery = z.object({ status: z.enum(FINDING_STATUSES).optional(), category: z.enum(CATEGORIES).optional(), severity: z.enum(SEVERITIES).optional() });
const notesSchema = z.object({ notes: z.string().trim().min(3).max(2000) });
const resolveSchema = z.object({ resolution: z.string().trim().min(3).max(2000) });
const escalateSchema = z.object({ to: z.string().trim().min(2).max(200), notes: z.string().trim().max(2000).optional().nullable() });
const activityQuery = z.object({ q: z.string().max(100).optional(), limit: z.coerce.number().int().min(1).max(500).default(200) });
const idParam = z.object({ id: z.string().uuid() }).passthrough();

export function createMonitorRouter(db: Db) {
  const r = Router({ mergeParams: true });
  const eid = (req: Request) => (req.params as { engagementId: string }).engagementId;
  async function engagementOf(req: Request) {
    const e = await db.engagement.findUnique({ where: { id: eid(req) } });
    return e && e.tenant_id === user(req).tenant_id ? e : null;
  }
  async function catalogue(): Promise<Catalogue> {
    const rows = await db.sharedItem.findMany({ where: { status: 'published' } });
    const pick = (kind: string) => rows.filter((x: { kind: string }) => x.kind === kind).map((x: { data: unknown }) => x.data);
    return { archetypes: pick('archetype'), mappings: pick('mapping'), rules: pick('rule') };
  }
  const byDesc = (k: string) => (a: Record<string, Date | string>, b: Record<string, Date | string>) => +new Date(b[k]) - +new Date(a[k]);

  async function gather(req: Request) {
    const e = eid(req);
    const [runs, actions, poam, remRuns, evidence, boundaries, assets, tenants, requests, cat] = await Promise.all([
      tx(req, db, (t) => t.assessmentRun.findMany({ where: { engagement_id: e } })),
      tx(req, db, (t) => t.planAction.findMany({ where: { engagement_id: e } })),
      tx(req, db, (t) => t.poamItem.findMany({ where: { engagement_id: e } })),
      tx(req, db, (t) => t.remediationRun.findMany({ where: { engagement_id: e } })),
      tx(req, db, (t) => t.evidenceItem.findMany({ where: { engagement_id: e } })),
      tx(req, db, (t) => t.scopeBoundary.findMany({ where: { engagement_id: e } })),
      tx(req, db, (t) => t.scopeAsset.findMany({ where: { engagement_id: e } })),
      tx(req, db, (t) => t.customerTenant.findMany({ where: { tenant_id: user(req).tenant_id } })),
      tx(req, db, (t) => t.evidenceRequest.findMany({ where: { engagement_id: e } })),
      catalogue(),
    ]);
    runs.sort(byDesc('created_at'));
    const resultsByRun: Record<string, unknown[]> = {};
    for (const run of runs.slice(0, 2)) resultsByRun[run.id] = await tx(req, db, (t) => t.assessmentResult.findMany({ where: { run_id: run.id } }));
    const cov = coverage(CONTROL_REFS.map((c) => c.control_id), cat, evidence);
    return { runs, resultsByRun, actions, poam, remRuns, evidence, boundaries, assets, tenants, requests, cov };
  }

  r.post('/evaluate', bearerAuth, requireRole(...WRITE), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const now = new Date();
      const g = await gather(req);
      // The one state change: validated evidence older than a year expires.
      let expired = 0;
      for (const ev of g.evidence) {
        if (ev.status === 'validated' && now.getTime() - new Date(ev.collected_at).getTime() > 365 * 86_400_000) {
          await tx(req, db, (t) => t.evidenceItem.update({ where: { id: ev.id }, data: { status: 'expired', updated_at: now } }));
          ev.status = 'expired';
          expired++;
        }
      }
      const derived: Finding[] = deriveFindings({ now, runs: g.runs, resultsByRun: g.resultsByRun as never, actions: g.actions, poam: g.poam, remediationRuns: g.remRuns, evidence: g.evidence, coverage: g.cov, boundaries: g.boundaries, scopeAssets: g.assets, tenants: g.tenants, requests: g.requests });
      const existing = await tx(req, db, (t) => t.monitorFinding.findMany({ where: { engagement_id: eid(req) } }));
      const byKey = new Map(existing.map((f: { key: string }) => [f.key, f]));
      let created = 0, updated = 0, cleared = 0;
      const seen = new Set<string>();
      for (const f of derived) {
        seen.add(f.key);
        const cur = byKey.get(f.key) as { id: string; status: string; seen_count: number } | undefined;
        if (!cur) { await tx(req, db, (t) => t.monitorFinding.create({ data: { tenant_id: user(req).tenant_id, engagement_id: eid(req), key: f.key, category: f.category, severity: f.severity, title: f.title, detail: f.detail ?? null, requirement_id: f.requirement_id ?? null, target_type: f.target_type ?? null, target_id: f.target_id ?? null, status: 'open', first_seen_at: now, last_seen_at: now, seen_count: 1 } })); created++; }
        else if (cur.status === 'resolved') { await tx(req, db, (t) => t.monitorFinding.update({ where: { id: cur.id }, data: { status: 'open', severity: f.severity, title: f.title, detail: f.detail ?? null, last_seen_at: now, seen_count: (cur.seen_count ?? 1) + 1, resolved_by: null, resolved_at: null, resolution: null } })); created++; }
        else { await tx(req, db, (t) => t.monitorFinding.update({ where: { id: cur.id }, data: { severity: f.severity, title: f.title, detail: f.detail ?? null, last_seen_at: now, seen_count: (cur.seen_count ?? 1) + 1 } })); updated++; }
      }
      for (const f of existing as { id: string; key: string; status: string }[]) {
        if (!seen.has(f.key) && f.status !== 'resolved') { await tx(req, db, (t) => t.monitorFinding.update({ where: { id: f.id }, data: { status: 'resolved', resolved_by: 'monitor', resolved_at: now, resolution: 'cleared' } })); cleared++; }
      }
      const open = derived.length;
      const latest = g.runs[0] ?? null;
      const fam: Record<string, { met: number; total: number }> = {};
      for (const row of (g.resultsByRun[latest?.id ?? ''] ?? []) as { family: string; status: string }[]) { const f = fam[row.family] ?? { met: 0, total: 0 }; f.total++; if (row.status === 'met') f.met++; fam[row.family] = f; }
      const snapshot = await tx(req, db, (t) => t.monitorSnapshot.create({ data: {
        tenant_id: user(req).tenant_id, engagement_id: eid(req), taken_at: now, triggered_by: user(req).sub,
        sprs_now: latest?.sprs_now ?? null, met_count: latest?.met_count ?? null, not_met_count: latest?.not_met_count ?? null, partial_count: latest?.partial_count ?? null, unknown_count: latest?.unknown_count ?? null,
        open_actions: g.actions.filter((a: { status: string }) => a.status !== 'done' && a.status !== 'wont_fix').length,
        overdue_actions: g.actions.filter((a: { status: string; due_date: Date | null }) => a.status !== 'done' && a.status !== 'wont_fix' && a.due_date && new Date(a.due_date) < now).length,
        open_poam: g.poam.filter((p: { status: string }) => p.status === 'open' || p.status === 'ongoing').length,
        evidence_validated: g.evidence.filter((e: { status: string }) => e.status === 'validated').length,
        evidence_pending: g.evidence.filter((e: { status: string }) => e.status === 'submitted' || e.status === 'draft').length,
        coverage_covered: g.cov.filter((c) => c.state === 'covered').length, coverage_missing: g.cov.filter((c) => c.state === 'missing').length,
        findings_open: open, findings_critical: derived.filter((f) => f.severity === 'critical').length, by_family: fam,
      } }));
      await audit(db, { action: 'monitor.evaluate', actor: user(req), target_type: 'engagement', target_id: eid(req), tenant_id: user(req).tenant_id, detail: { created, updated, cleared, expired, open } });
      res.json({ created, updated, cleared, expired_evidence: expired, open, snapshot });
    } catch (e) { next(e); }
  });

  r.get('/summary', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const [findings, snaps] = await Promise.all([tx(req, db, (t) => t.monitorFinding.findMany({ where: { engagement_id: eid(req) } })), tx(req, db, (t) => t.monitorSnapshot.findMany({ where: { engagement_id: eid(req) } }))]);
      snaps.sort(byDesc('taken_at'));
      const open = findings.filter((f: { status: string }) => f.status !== 'resolved');
      const count = (k: string, vals: readonly string[], rows: Record<string, unknown>[]) => Object.fromEntries(vals.map((v) => [v, rows.filter((x) => x[k] === v).length]));
      res.json({ last_evaluated_at: snaps[0]?.taken_at ?? null, snapshots: snaps.length, open: open.length, by_severity: count('severity', SEVERITIES, open), by_category: count('category', CATEGORIES, open), by_status: count('status', FINDING_STATUSES, findings), latest: snaps[0] ?? null, previous: snaps[1] ?? null });
    } catch (e) { next(e); }
  });

  r.get('/findings', bearerAuth, requireRole(...READ), validate(listQuery, 'query'), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const q = req.query as z.infer<typeof listQuery>;
      const rows = await tx(req, db, (t) => t.monitorFinding.findMany({ where: { engagement_id: eid(req), ...(q.status ? { status: q.status } : {}), ...(q.category ? { category: q.category } : {}), ...(q.severity ? { severity: q.severity } : {}) } }));
      rows.sort((a: { severity: keyof typeof SEVERITY_RANK; last_seen_at: Date }, b: { severity: keyof typeof SEVERITY_RANK; last_seen_at: Date }) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || +new Date(b.last_seen_at) - +new Date(a.last_seen_at));
      res.json(rows);
    } catch (e) { next(e); }
  });

  async function findingOf(req: Request) {
    const f = await tx(req, db, (t) => t.monitorFinding.findUnique({ where: { id: req.params.id } }));
    return f && f.engagement_id === eid(req) && f.tenant_id === user(req).tenant_id ? f : null;
  }
  r.post('/findings/:id/ack', bearerAuth, requireRole(...WRITE), validate(idParam, 'params'), validate(notesSchema), async (req, res, next) => {
    try {
      const f = await findingOf(req); if (!f) return notFound(res);
      const row = await tx(req, db, (t) => t.monitorFinding.update({ where: { id: f.id }, data: { status: 'acknowledged', acknowledged_by: user(req).sub, acknowledged_at: new Date(), notes: (req.body as { notes: string }).notes } }));
      await audit(db, { action: 'monitor.finding.ack', actor: user(req), target_type: 'monitor_finding', target_id: f.id, tenant_id: user(req).tenant_id, detail: { key: f.key } });
      res.json(row);
    } catch (e) { next(e); }
  });
  r.post('/findings/:id/resolve', bearerAuth, requireRole(...WRITE), validate(idParam, 'params'), validate(resolveSchema), async (req, res, next) => {
    try {
      const f = await findingOf(req); if (!f) return notFound(res);
      const row = await tx(req, db, (t) => t.monitorFinding.update({ where: { id: f.id }, data: { status: 'resolved', resolved_by: user(req).sub, resolved_at: new Date(), resolution: (req.body as { resolution: string }).resolution } }));
      await audit(db, { action: 'monitor.finding.resolve', actor: user(req), target_type: 'monitor_finding', target_id: f.id, tenant_id: user(req).tenant_id, detail: { key: f.key } }, { strict: true });
      res.json(row);
    } catch (e) { next(e); }
  });
  r.post('/findings/:id/escalate', bearerAuth, requireRole(...WRITE), validate(idParam, 'params'), validate(escalateSchema), async (req, res, next) => {
    try {
      const f = await findingOf(req); if (!f) return notFound(res);
      const body = req.body as z.infer<typeof escalateSchema>;
      const row = await tx(req, db, (t) => t.monitorFinding.update({ where: { id: f.id }, data: { status: 'escalated', escalated_to: body.to, notes: body.notes ?? f.notes ?? null } }));
      await audit(db, { action: 'monitor.finding.escalate', actor: user(req), target_type: 'monitor_finding', target_id: f.id, tenant_id: user(req).tenant_id, detail: { key: f.key, to: body.to } }, { strict: true });
      res.json(row);
    } catch (e) { next(e); }
  });

  r.get('/snapshots', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const rows = await tx(req, db, (t) => t.monitorSnapshot.findMany({ where: { engagement_id: eid(req) } }));
      rows.sort((a: { taken_at: Date }, b: { taken_at: Date }) => +new Date(a.taken_at) - +new Date(b.taken_at));
      res.json(rows);
    } catch (e) { next(e); }
  });

  /** Compliance event history: the tenant's audit trail (actor, action, target), newest first. */
  r.get('/activity', bearerAuth, requireRole(...READ), validate(activityQuery, 'query'), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const q = req.query as unknown as z.infer<typeof activityQuery>;
      const rows = await db.auditEvent.findMany({ where: { tenant_id: user(req).tenant_id } });
      const out = rows.filter((a: { action: string; actor_user_id: string | null; target_type: string | null }) => !q.q || `${a.action} ${a.actor_user_id ?? ''} ${a.target_type ?? ''}`.toLowerCase().includes(q.q.toLowerCase()));
      const at = (a: { at?: Date; created_at?: Date }) => +new Date(a.at ?? a.created_at ?? 0);
      out.sort((a: { at?: Date; created_at?: Date }, b: { at?: Date; created_at?: Date }) => at(b) - at(a));
      res.json(out.slice(0, q.limit).map((a: Record<string, unknown>) => ({ id: a.id, at: a.at ?? a.created_at, actor_user_id: a.actor_user_id, actor_role: a.actor_role, action: a.action, target_type: a.target_type, target_id: a.target_id, detail: a.detail })));
    } catch (e) { next(e); }
  });

  return r;
}
