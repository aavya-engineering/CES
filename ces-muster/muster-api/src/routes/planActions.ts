// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// planActions.ts — Sprint 4 slice "Plan" (2026-11-10): remediation action
// items and the POA&M register per engagement. (The mission-plan push to the
// tenant runner stays at /api/plan — routes/plan.ts.)
//
//   GET   /api/engagements/:engagementId/plan/summary
//   GET   /api/engagements/:engagementId/plan/actions            ?status=&priority=
//   POST  /api/engagements/:engagementId/plan/actions            manual action
//   POST  /api/engagements/:engagementId/plan/actions/generate   { run_id } → one action per gap not yet covered
//   PATCH /api/engagements/:engagementId/plan/actions/:id        status / owner / due / priority / sequence …
//   DELETE /api/engagements/:engagementId/plan/actions/:id
//   GET   /api/engagements/:engagementId/plan/poam
//   POST  /api/engagements/:engagementId/plan/poam               manual item
//   POST  /api/engagements/:engagementId/plan/poam/from-actions  open actions → POA&M items (prohibited ones flagged)
//   PATCH /api/engagements/:engagementId/plan/poam/:id
//
// Rules: priority follows SPRS weight (5 → critical, 3 → high, 1 → medium,
// 0 → low); sprs-weights.json poam_prohibited requirements can never be closed
// on a POA&M (flagged, not refused — the assessor needs to see them); every
// write is audited; read = prime|bhd_operator|assessor_read_only|sub, write =
// prime|bhd_operator (platform roles by inheritance).

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { bearerAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { withTenant } from '../lib/prisma.js';
import { audit } from '../lib/audit.js';
import { computeSprs } from '../services/sprsCalc.js';
import { CONTROL_REFS } from './assessments.js';
import SPRS_WEIGHTS from '../vendored/ces-shared/data/sprs-weights.json';

const READ = ['prime', 'bhd_operator', 'assessor_read_only', 'sub'] as const;
const WRITE = ['prime', 'bhd_operator'] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
const user = (req: Request) => req.user!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tx = (req: Request, db: Db, fn: (t: Db) => Promise<any>): Promise<any> => withTenant(user(req).tenant_id, fn, db);
const notFound = (res: Response) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });

type WeightEntry = { nist_ref: string; weight: number; poam_allowed?: boolean };
const WEIGHTS = SPRS_WEIGHTS as { controls: WeightEntry[]; poam_prohibited: string[]; ssp_prerequisite_control?: string };
const POAM_PROHIBITED = new Set(WEIGHTS.poam_prohibited);
const PRACTICE = new Map(CONTROL_REFS.map((c) => [c.control_id, c.practice]));
const nistRef = (requirementId: string) => requirementId.slice(requirementId.indexOf('-') + 1);
const weightEntry = (requirementId: string) => WEIGHTS.controls.find((c) => c.nist_ref === nistRef(requirementId));
/**
 * CMMC final rule (32 CFR 170.21): a POA&M may only carry requirements that are
 * not in the prohibited list and whose weight is 1 — sprs-weights.json records
 * that per control as poam_allowed; the prohibited list is the hard floor.
 */
export const poamAllowed = (requirementId: string) => !POAM_PROHIBITED.has(nistRef(requirementId)) && (weightEntry(requirementId)?.poam_allowed ?? false);
/** The SSP (CA.L2-3.12.4) is unscored but a prerequisite: no SSP, no score at all. */
const isSspPrerequisite = (requirementId: string | null | undefined) => !!requirementId && requirementId === (WEIGHTS.ssp_prerequisite_control ?? 'CA.L2-3.12.4');

export const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
export const ACTION_STATUSES = ['open', 'in_progress', 'blocked', 'done', 'wont_fix'] as const;
export const POAM_STATUSES = ['open', 'ongoing', 'completed', 'risk_accepted'] as const;
type Priority = (typeof PRIORITIES)[number];

/** Priority from SPRS weight (DoD Assessment Methodology: 5 = basic safeguarding, 3, 1). */
export function priorityForWeight(weight: number, requirementId?: string | null): Priority {
  if (isSspPrerequisite(requirementId)) return 'critical';
  return weight >= 5 ? 'critical' : weight >= 3 ? 'high' : weight >= 1 ? 'medium' : 'low';
}

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').transform((s) => new Date(`${s}T00:00:00.000Z`));
const actionSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  requirement_id: z.string().trim().regex(/^[A-Z]{2}\.L[123]-\d+\.\d+\.\d+$/, 'e.g. AC.L2-3.1.5').optional().nullable(),
  priority: z.enum(PRIORITIES).optional(),
  status: z.enum(ACTION_STATUSES).default('open'),
  owner: z.string().trim().max(200).optional().nullable(),
  due_date: date.optional().nullable(),
  effort_hours: z.number().int().min(0).max(10000).optional().nullable(),
  depends_on: z.array(z.string().uuid()).max(50).default([]),
  sequence: z.number().int().min(0).optional().nullable(),
  fix_kind: z.enum(['registry', 'manual']).default('manual'),
  fix_entry_ids: z.array(z.string()).default([]),
  notes: z.string().trim().max(4000).optional().nullable(),
});
const actionPatch = actionSchema.partial();
const generateSchema = z.object({ run_id: z.string().uuid(), statuses: z.array(z.enum(['not_met', 'partial', 'unknown'])).default(['not_met', 'partial']) });

const milestoneSchema = z.object({ title: z.string().trim().min(1).max(200), due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(), done: z.boolean().default(false) });
const poamSchema = z.object({
  requirement_id: z.string().trim().regex(/^[A-Z]{2}\.L[123]-\d+\.\d+\.\d+$/, 'e.g. AC.L2-3.1.5'),
  action_id: z.string().uuid().optional().nullable(),
  weakness: z.string().trim().min(3).max(2000),
  mitigation: z.string().trim().max(4000).optional().nullable(),
  milestones: z.array(milestoneSchema).max(50).optional().nullable(),
  scheduled_completion: date.optional().nullable(),
  responsible: z.string().trim().max(200).optional().nullable(),
  resources: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(POAM_STATUSES).default('open'),
});
const poamPatch = poamSchema.partial();
const idParam = z.object({ id: z.string().uuid() }).passthrough();
const listQuery = z.object({ status: z.enum(ACTION_STATUSES).optional(), priority: z.enum(PRIORITIES).optional() });

const weightOf = (requirementId: string | null | undefined) => (requirementId ? weightEntry(requirementId)?.weight ?? 1 : 0);
const familyOf = (requirementId: string | null | undefined) => (requirementId ? requirementId.slice(0, 2) : null);

export function createPlanActionsRouter(db: Db) {
  const r = Router({ mergeParams: true });
  const eid = (req: Request) => (req.params as { engagementId: string }).engagementId;

  async function engagementOf(req: Request) {
    const e = await db.engagement.findUnique({ where: { id: eid(req) } });
    return e && e.tenant_id === user(req).tenant_id ? e : null;
  }
  const own = (req: Request, row: { engagement_id: string; tenant_id: string } | null) => !!row && row.engagement_id === eid(req) && row.tenant_id === user(req).tenant_id;

  // ---------------------------------------------------------------- summary
  r.get('/summary', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const [actions, poam, runs] = await Promise.all([
        tx(req, db, (t) => t.planAction.findMany({ where: { engagement_id: eid(req) } })),
        tx(req, db, (t) => t.poamItem.findMany({ where: { engagement_id: eid(req) } })),
        tx(req, db, (t) => t.assessmentRun.findMany({ where: { engagement_id: eid(req) } })),
      ]);
      const latest = runs.sort((a: { created_at: Date }, b: { created_at: Date }) => +new Date(b.created_at) - +new Date(a.created_at))[0] ?? null;
      const by = <K extends string>(rows: { [k: string]: unknown }[], key: string, keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, rows.filter((x) => x[key] === k).length])) as Record<K, number>;
      const open = actions.filter((a: { status: string }) => a.status !== 'done' && a.status !== 'wont_fix');
      const today = new Date();
      const overdue = open.filter((a: { due_date: Date | null }) => a.due_date && new Date(a.due_date) < today).length;
      // Projection: the latest run's statuses with every requirement that has a *done* action flipped to met.
      let sprs_if_done: number | null = null;
      if (latest) {
        const results = await tx(req, db, (t) => t.assessmentResult.findMany({ where: { run_id: latest.id } }));
        const doneReqs = new Set(actions.filter((a: { status: string; requirement_id: string | null }) => a.status === 'done' && a.requirement_id).map((a: { requirement_id: string }) => a.requirement_id));
        const allReqs = new Set(open.filter((a: { requirement_id: string | null }) => a.requirement_id).map((a: { requirement_id: string }) => a.requirement_id));
        sprs_if_done = computeSprs(results.map((x: { requirement_id: string; status: string }) => ({ requirement_id: x.requirement_id, status: doneReqs.has(x.requirement_id) || allReqs.has(x.requirement_id) ? 'met' : x.status }))).sprs;
      }
      res.json({
        latest_run: latest ? { id: latest.id, sprs_now: latest.sprs_now, created_at: latest.created_at } : null,
        actions: { total: actions.length, by_status: by(actions, 'status', ACTION_STATUSES), by_priority: by(open, 'priority', PRIORITIES), overdue, weight_open: open.reduce((n: number, a: { weight: number }) => n + a.weight, 0) },
        poam: { total: poam.length, by_status: by(poam, 'status', POAM_STATUSES), prohibited: poam.filter((p: { poam_allowed: boolean }) => !p.poam_allowed).length },
        sprs_if_all_actions_done: sprs_if_done,
        next_due: open.filter((a: { due_date: Date | null }) => a.due_date).sort((a: { due_date: Date }, b: { due_date: Date }) => +new Date(a.due_date) - +new Date(b.due_date)).slice(0, 5).map((a: { id: string; title: string; due_date: Date; owner: string | null }) => ({ id: a.id, title: a.title, due_date: a.due_date, owner: a.owner })),
      });
    } catch (e) { next(e); }
  });

  // ---------------------------------------------------------------- actions
  r.get('/actions', bearerAuth, requireRole(...READ), validate(listQuery, 'query'), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const q = req.query as z.infer<typeof listQuery>;
      const rows = await tx(req, db, (t) => t.planAction.findMany({ where: { engagement_id: eid(req), ...(q.status ? { status: q.status } : {}), ...(q.priority ? { priority: q.priority } : {}) } }));
      const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      rows.sort((a: { sequence: number | null; priority: string; weight: number }, b: { sequence: number | null; priority: string; weight: number }) => (a.sequence ?? 1e9) - (b.sequence ?? 1e9) || rank[a.priority] - rank[b.priority] || b.weight - a.weight);
      res.json(rows);
    } catch (e) { next(e); }
  });

  r.post('/actions', bearerAuth, requireRole(...WRITE), validate(actionSchema), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const body = req.body as z.infer<typeof actionSchema>;
      const weight = weightOf(body.requirement_id);
      const row = await tx(req, db, (t) => t.planAction.create({ data: { ...body, priority: body.priority ?? priorityForWeight(weight, body.requirement_id), weight, family: familyOf(body.requirement_id), source: 'manual', tenant_id: user(req).tenant_id, engagement_id: eid(req), created_by: user(req).sub } }));
      await audit(db, { action: 'plan.action.create', actor: user(req), target_type: 'plan_action', target_id: row.id, tenant_id: user(req).tenant_id, detail: { engagement_id: eid(req), requirement_id: row.requirement_id } });
      res.status(201).json(row);
    } catch (e) { next(e); }
  });

  /** One action per gap of the run whose requirement has no open action yet. */
  r.post('/actions/generate', bearerAuth, requireRole(...WRITE), validate(generateSchema), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const body = req.body as z.infer<typeof generateSchema>;
      const run = await tx(req, db, (t) => t.assessmentRun.findUnique({ where: { id: body.run_id } }));
      if (!own(req, run)) return notFound(res);
      const [results, existing] = await Promise.all([
        tx(req, db, (t) => t.assessmentResult.findMany({ where: { run_id: run.id } })),
        tx(req, db, (t) => t.planAction.findMany({ where: { engagement_id: eid(req) } })),
      ]);
      const covered = new Set(existing.filter((a: { status: string }) => a.status !== 'wont_fix').map((a: { requirement_id: string | null }) => a.requirement_id));
      const candidates = results.filter((x: { status: string }) => (body.statuses as string[]).includes(x.status));
      const gaps = candidates.filter((x: { requirement_id: string }) => !covered.has(x.requirement_id));
      const created: unknown[] = [];
      for (const g of gaps as { requirement_id: string; family: string; weight: number; status: string; fixable: string | null; fix_entry_ids: string[] }[]) {
        const row = await tx(req, db, (t) => t.planAction.create({ data: {
          tenant_id: user(req).tenant_id, engagement_id: eid(req), run_id: run.id, requirement_id: g.requirement_id, family: g.family, weight: g.weight,
          title: `${g.requirement_id}: ${g.status === 'partial' ? 'complete' : 'implement'} — ${(PRACTICE.get(g.requirement_id) ?? '').slice(0, 120)}`,
          description: g.fixable === 'registry' ? `Registry-fixable: ${g.fix_entry_ids.join(', ')}` : 'Manual remediation (policy, process or configuration outside the command registry).',
          source: 'gap', fix_kind: g.fixable === 'registry' ? 'registry' : 'manual', fix_entry_ids: g.fix_entry_ids ?? [],
          priority: priorityForWeight(g.weight, g.requirement_id), status: 'open', created_by: user(req).sub,
        } }));
        created.push(row);
      }
      await audit(db, { action: 'plan.actions.generate', actor: user(req), target_type: 'assessment_run', target_id: run.id, tenant_id: user(req).tenant_id, detail: { engagement_id: eid(req), created: created.length, skipped: candidates.length - gaps.length } });
      res.status(201).json({ created: created.length, skipped: candidates.length - gaps.length, actions: created });
    } catch (e) { next(e); }
  });

  r.patch('/actions/:id', bearerAuth, requireRole(...WRITE), validate(idParam, 'params'), validate(actionPatch), async (req, res, next) => {
    try {
      const before = await tx(req, db, (t) => t.planAction.findUnique({ where: { id: req.params.id } }));
      if (!own(req, before)) return notFound(res);
      const body = req.body as z.infer<typeof actionPatch>;
      const closing = body.status && (body.status === 'done' || body.status === 'wont_fix') && before.status !== body.status;
      const row = await tx(req, db, (t) => t.planAction.update({ where: { id: before.id }, data: { ...body, ...(body.requirement_id !== undefined ? { weight: weightOf(body.requirement_id), family: familyOf(body.requirement_id) } : {}), updated_at: new Date(), ...(closing ? { closed_at: new Date() } : {}) } }));
      await audit(db, { action: 'plan.action.update', actor: user(req), target_type: 'plan_action', target_id: row.id, tenant_id: user(req).tenant_id, detail: { fields: Object.keys(body), ...(body.status ? { from: before.status, to: body.status } : {}) } });
      res.json(row);
    } catch (e) { next(e); }
  });

  r.delete('/actions/:id', bearerAuth, requireRole(...WRITE), validate(idParam, 'params'), async (req, res, next) => {
    try {
      const before = await tx(req, db, (t) => t.planAction.findUnique({ where: { id: req.params.id } }));
      if (!own(req, before)) return notFound(res);
      await tx(req, db, (t) => t.planAction.delete({ where: { id: before.id } }));
      await audit(db, { action: 'plan.action.delete', actor: user(req), target_type: 'plan_action', target_id: before.id, tenant_id: user(req).tenant_id, detail: { title: before.title } }, { strict: true });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  // ---------------------------------------------------------------- POA&M
  r.get('/poam', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const rows = await tx(req, db, (t) => t.poamItem.findMany({ where: { engagement_id: eid(req) } }));
      rows.sort((a: { weight: number; requirement_id: string }, b: { weight: number; requirement_id: string }) => b.weight - a.weight || a.requirement_id.localeCompare(b.requirement_id, undefined, { numeric: true }));
      res.json(rows);
    } catch (e) { next(e); }
  });

  r.post('/poam', bearerAuth, requireRole(...WRITE), validate(poamSchema), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const body = req.body as z.infer<typeof poamSchema>;
      const row = await tx(req, db, (t) => t.poamItem.create({ data: { ...body, weight: weightOf(body.requirement_id), poam_allowed: poamAllowed(body.requirement_id), tenant_id: user(req).tenant_id, engagement_id: eid(req), created_by: user(req).sub } }));
      await audit(db, { action: 'plan.poam.create', actor: user(req), target_type: 'poam_item', target_id: row.id, tenant_id: user(req).tenant_id, detail: { engagement_id: eid(req), requirement_id: row.requirement_id, poam_allowed: row.poam_allowed } });
      res.status(201).json(row);
    } catch (e) { next(e); }
  });

  /** Open actions with a requirement → POA&M items (one per requirement; prohibited ones flagged, never dropped). */
  r.post('/poam/from-actions', bearerAuth, requireRole(...WRITE), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const [actions, existing] = await Promise.all([
        tx(req, db, (t) => t.planAction.findMany({ where: { engagement_id: eid(req) } })),
        tx(req, db, (t) => t.poamItem.findMany({ where: { engagement_id: eid(req) } })),
      ]);
      const have = new Set(existing.map((p: { requirement_id: string }) => p.requirement_id));
      const open = actions.filter((a: { status: string; requirement_id: string | null }) => a.requirement_id && a.status !== 'done' && a.status !== 'wont_fix' && !have.has(a.requirement_id));
      const seen = new Set<string>();
      const created: unknown[] = [];
      for (const a of open as { id: string; requirement_id: string; weight: number; title: string; description: string | null; owner: string | null; due_date: Date | null }[]) {
        if (seen.has(a.requirement_id)) continue;
        seen.add(a.requirement_id);
        const row = await tx(req, db, (t) => t.poamItem.create({ data: {
          tenant_id: user(req).tenant_id, engagement_id: eid(req), action_id: a.id, requirement_id: a.requirement_id, weight: a.weight, poam_allowed: poamAllowed(a.requirement_id),
          weakness: `${a.requirement_id} not fully implemented: ${(PRACTICE.get(a.requirement_id) ?? '').slice(0, 300)}`, mitigation: a.description ?? a.title,
          milestones: [{ title: a.title, due_date: a.due_date ? new Date(a.due_date).toISOString().slice(0, 10) : null, done: false }],
          scheduled_completion: a.due_date ?? null, responsible: a.owner ?? null, status: 'open', created_by: user(req).sub,
        } }));
        created.push(row);
      }
      await audit(db, { action: 'plan.poam.from_actions', actor: user(req), target_type: 'engagement', target_id: eid(req), tenant_id: user(req).tenant_id, detail: { created: created.length } });
      res.status(201).json({ created: created.length, items: created });
    } catch (e) { next(e); }
  });

  r.patch('/poam/:id', bearerAuth, requireRole(...WRITE), validate(idParam, 'params'), validate(poamPatch), async (req, res, next) => {
    try {
      const before = await tx(req, db, (t) => t.poamItem.findUnique({ where: { id: req.params.id } }));
      if (!own(req, before)) return notFound(res);
      const body = req.body as z.infer<typeof poamPatch>;
      // A prohibited item closes only with the implemented mitigation stated in the same request (assessor-visible).
      if (body.status === 'completed' && !before.poam_allowed && !body.mitigation) { res.status(409).json({ error: 'This requirement cannot be closed on a POA&M; record the implemented mitigation and re-assess instead', code: 'POAM_PROHIBITED' }); return; }
      const completing = body.status === 'completed' && before.status !== 'completed';
      const row = await tx(req, db, (t) => t.poamItem.update({ where: { id: before.id }, data: { ...body, ...(body.requirement_id ? { weight: weightOf(body.requirement_id), poam_allowed: poamAllowed(body.requirement_id) } : {}), updated_at: new Date(), ...(completing ? { completed_at: new Date() } : {}) } }));
      await audit(db, { action: 'plan.poam.update', actor: user(req), target_type: 'poam_item', target_id: row.id, tenant_id: user(req).tenant_id, detail: { fields: Object.keys(body), ...(body.status ? { from: before.status, to: body.status } : {}) } });
      res.json(row);
    } catch (e) { next(e); }
  });

  return r;
}
