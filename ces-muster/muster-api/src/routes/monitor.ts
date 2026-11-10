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
import { SEVERITY_RANK } from '../services/monitorEngine.js';
import { evaluateEngagement } from '../services/monitorEvaluate.js';

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
const byDesc = (k: string) => (a: Record<string, Date | string>, b: Record<string, Date | string>) => +new Date(b[k]) - +new Date(a[k]);

export function createMonitorRouter(db: Db) {
  const r = Router({ mergeParams: true });
  const eid = (req: Request) => (req.params as { engagementId: string }).engagementId;
  async function engagementOf(req: Request) {
    const e = await db.engagement.findUnique({ where: { id: eid(req) } });
    return e && e.tenant_id === user(req).tenant_id ? e : null;
  }
  r.post('/evaluate', bearerAuth, requireRole(...WRITE), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const out = await evaluateEngagement(db, { tenant_id: user(req).tenant_id, engagement_id: eid(req), actor: user(req) });
      res.json(out);
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
      // Stable: same-millisecond events keep insertion order (newest last → shown first).
      const idx = new Map<string, number>(out.map((a: { id: string }, i: number) => [a.id, i] as [string, number]));
      out.sort((a: { id: string; at?: Date; created_at?: Date }, b: { id: string; at?: Date; created_at?: Date }) => at(b) - at(a) || (idx.get(b.id) ?? 0) - (idx.get(a.id) ?? 0));
      res.json(out.slice(0, q.limit).map((a: Record<string, unknown>) => ({ id: a.id, at: a.at ?? a.created_at, actor_user_id: a.actor_user_id, actor_role: a.actor_role, action: a.action, target_type: a.target_type, target_id: a.target_id, detail: a.detail })));
    } catch (e) { next(e); }
  });

  return r;
}
