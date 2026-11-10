// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// remediation.ts — Sprint 5 slice "Remediate" (2026-11-10): Stamper / AdminOps
// run requests with the engine's gates, two-person approval, execution and
// human verification; remediation tracking summary.
//
//   GET  /api/engagements/:engagementId/remediation/summary
//   GET  /api/engagements/:engagementId/remediation/registry/stamper?control=AC.L2-3.1.5
//   GET  /api/engagements/:engagementId/remediation/registry/adminops?domain=A
//   GET  /api/engagements/:engagementId/remediation/runs?module=&status=
//   POST /api/engagements/:engagementId/remediation/runs            request (gates evaluated, recorded on the row)
//   GET  /api/engagements/:engagementId/remediation/runs/:id
//   POST /api/engagements/:engagementId/remediation/runs/:id/approve  DP-2: a different person
//   POST /api/engagements/:engagementId/remediation/runs/:id/reject   { reason }
//   POST /api/engagements/:engagementId/remediation/runs/:id/execute  simulate → recorded; live → queued (runner: Sprint 5)
//   POST /api/engagements/:engagementId/remediation/runs/:id/verify   { verified, notes } — task verification by a person
//   POST /api/engagements/:engagementId/remediation/runs/:id/cancel
//
// Module access (walkthrough 2026-11-04): Stamper is BHD-only (bhd_operator
// requests and approves — two different operators). AdminOps is run by the
// customer's CIS administrator (prime/sub-inheriting roles) or BHD, and approved
// by senior_approver (assessor_read_only-inheriting) or bhd_operator. Reads:
// everyone with engagement access. The run never carries secrets (parameters
// are the AdminOps form fields; certificates stay on the runner).

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { bearerAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { withTenant } from '../lib/prisma.js';
import { audit } from '../lib/audit.js';
import STAMPER_INDEX from '../vendored/ces-registry/stamper-index.json';
import ADMINOPS_INDEX from '../vendored/ces-registry/adminops-index.json';

const READ = ['prime', 'bhd_operator', 'assessor_read_only', 'sub'] as const;
const STAMPER_ROLES = ['bhd_operator'] as const;
const ADMINOPS_REQUEST_ROLES = ['prime', 'sub', 'bhd_operator'] as const;
const APPROVE_ROLES = ['bhd_operator', 'assessor_read_only'] as const; // senior_approver inherits assessor_read_only; narrowed per module below

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
const user = (req: Request) => req.user!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tx = (req: Request, db: Db, fn: (t: Db) => Promise<any>): Promise<any> => withTenant(user(req).tenant_id, fn, db);
const notFound = (res: Response) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
const conflict = (res: Response, error: string, code: string) => res.status(409).json({ error, code });

export interface StamperEntry { entry_id: string; control_ids: string[]; label: string; engine: string | null; registry: string; has_set: boolean; has_get: boolean; manual_only: boolean; idempotency: string | null; variables_required: string[]; azure_tier: string | null; module: string | null; layer_hint: number | null; sequence_hint: number | null }
export interface AdminOp { id: string; title: string; domain: string; domain_name: string; trigger: string | null; priority: string | null; sod_tier: string | null; cmmc_practices: string[]; idempotency_class: string | null; overview: string | null; parameters: { name: string; label: string; type: string; required: boolean; placeholder?: string | null }[] }
export const STAMPER_ENTRIES: readonly StamperEntry[] = (STAMPER_INDEX as { entries: StamperEntry[] }).entries;
export const ADMIN_OPS: readonly AdminOp[] = (ADMINOPS_INDEX as { ops: AdminOp[] }).ops;
const ENTRY = new Map(STAMPER_ENTRIES.map((e) => [e.entry_id, e]));
const OP = new Map(ADMIN_OPS.map((o) => [o.id, o]));

/** DP-1: a unit cost per step so every request carries an estimate (real tenant cost model: Sprint 5). */
const COST_PER_SET = 3;
const COST_PER_GET = 1;

export const RUN_STATUSES = ['requested', 'approved', 'rejected', 'blocked', 'queued', 'running', 'succeeded', 'failed', 'verified', 'cancelled'] as const;
type RunStatus = (typeof RUN_STATUSES)[number];

const requestSchema = z.discriminatedUnion('module', [
  z.object({
    module: z.literal('stamper'),
    mode: z.enum(['simulate', 'live']).default('simulate'),
    entry_ids: z.array(z.string().min(3)).min(1).max(100),
    action_id: z.string().uuid().optional().nullable(),
    requirement_id: z.string().optional().nullable(),
    justification: z.string().trim().min(10).max(2000),
  }),
  z.object({
    module: z.literal('adminops'),
    mode: z.enum(['simulate', 'live']).default('simulate'),
    op_id: z.string().regex(/^[A-H]-\d{2}$/),
    parameters: z.record(z.string().max(500)).default({}),
    action_id: z.string().uuid().optional().nullable(),
    requirement_id: z.string().optional().nullable(),
    justification: z.string().trim().min(10).max(2000),
  }),
]);
type RunRequest = z.infer<typeof requestSchema>;
const rejectSchema = z.object({ reason: z.string().trim().min(5).max(2000) });
const verifySchema = z.object({ verified: z.boolean(), notes: z.string().trim().min(5).max(4000) });
const idParam = z.object({ id: z.string().uuid() }).passthrough();
const listQuery = z.object({ module: z.enum(['stamper', 'adminops']).optional(), status: z.enum(RUN_STATUSES).optional() });

export interface Gate { id: string; label: string; ok: boolean; note?: string; blocking: boolean }

/** The engine's gates, evaluated at request time and recorded on the run. */
export function evaluateGates(body: RunRequest, engagement: { live_access_enabled: boolean }): { gates: Gate[]; cost: number; requiresApproval: boolean; blocked: boolean; errors: string[] } {
  const gates: Gate[] = [];
  const errors: string[] = [];
  let cost = 0;
  let requiresApproval = body.mode === 'live';
  if (body.module === 'stamper') {
    const entries = body.entry_ids.map((id) => ENTRY.get(id));
    const missing = body.entry_ids.filter((_, i) => !entries[i]);
    if (missing.length) errors.push(`Unknown registry entries: ${missing.join(', ')}`);
    const known = entries.filter((e): e is StamperEntry => !!e);
    const held = known.filter((e) => e.manual_only);
    gates.push({ id: 'held', label: 'No HELD (manual-only) entries', ok: held.length === 0, note: held.length ? `${held.map((e) => e.entry_id).join(', ')} must be done by a person` : undefined, blocking: true });
    const sets = known.filter((e) => e.has_set);
    cost = sets.length * COST_PER_SET + (known.length - sets.length) * COST_PER_GET;
    if (sets.length) requiresApproval = true; // DP-2: any configuration change needs a second operator
    const vars = [...new Set(known.flatMap((e) => e.variables_required))];
    gates.push({ id: 'variables', label: 'Required variables resolvable', ok: true, note: vars.length ? `Resolved on the runner: ${vars.join(', ')}` : undefined, blocking: false });
    gates.push({ id: 'evidence_only', label: 'Evidence-only entries never change the tenant', ok: true, note: `${known.length - sets.length} get-only, ${sets.length} set`, blocking: false });
  } else {
    const op = OP.get(body.op_id);
    if (!op) errors.push(`Unknown AdminOps operation ${body.op_id}`);
    else {
      const missingParams = op.parameters.filter((p) => p.required && p.type !== 'readonly' && !body.parameters[p.name]);
      gates.push({ id: 'parameters', label: 'Required parameters supplied', ok: missingParams.length === 0, note: missingParams.length ? `Missing: ${missingParams.map((p) => p.label).join(', ')}` : undefined, blocking: true });
      requiresApproval = true; // SoD: every AdminOps change is approved by a second person (Tier 2/3)
      gates.push({ id: 'sod', label: `Two-person approval (${op.sod_tier ?? 'Tier 2'})`, ok: true, note: 'Approver must differ from requester', blocking: false });
      cost = op.priority === 'P1 Critical' ? 5 : op.priority === 'P2 High' ? 3 : 2;
    }
  }
  gates.push({ id: 'dp1_cost', label: 'DP-1 cost estimate recorded', ok: true, note: `${cost} unit(s)`, blocking: false });
  gates.push({ id: 'sim_rail', label: body.mode === 'live' ? 'Live access enabled on the engagement' : 'Simulator first', ok: body.mode === 'simulate' || engagement.live_access_enabled, note: body.mode === 'live' && !engagement.live_access_enabled ? 'Enable live access (Live gate) before a live run' : undefined, blocking: true });
  gates.push({ id: 'dp2', label: requiresApproval ? 'DP-2 two-person approval required' : 'No approval needed (simulate, read-only)', ok: true, blocking: false });
  const blocked = gates.some((g) => g.blocking && !g.ok);
  return { gates, cost, requiresApproval, blocked, errors };
}

export function createRemediationRouter(db: Db) {
  const r = Router({ mergeParams: true });
  const eid = (req: Request) => (req.params as { engagementId: string }).engagementId;
  async function engagementOf(req: Request) {
    const e = await db.engagement.findUnique({ where: { id: eid(req) } });
    return e && e.tenant_id === user(req).tenant_id ? e : null;
  }
  async function runOf(req: Request) {
    const run = await tx(req, db, (t) => t.remediationRun.findUnique({ where: { id: req.params.id } }));
    return run && run.engagement_id === eid(req) && run.tenant_id === user(req).tenant_id ? run : null;
  }
  const isBhd = (req: Request) => user(req).role === 'bhd_operator';
  const roles = (req: Request) => req.user?.role ?? '';

  // ---------------------------------------------------------------- registry
  r.get('/registry/stamper', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const control = typeof req.query.control === 'string' ? req.query.control : null;
      const q = typeof req.query.q === 'string' ? req.query.q.toLowerCase() : null;
      res.json(STAMPER_ENTRIES.filter((e) => (!control || e.control_ids.includes(control)) && (!q || `${e.entry_id} ${e.label}`.toLowerCase().includes(q))));
    } catch (e) { next(e); }
  });
  r.get('/registry/adminops', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const domain = typeof req.query.domain === 'string' ? req.query.domain : null;
      const practice = typeof req.query.practice === 'string' ? req.query.practice : null;
      res.json(ADMIN_OPS.filter((o) => (!domain || o.domain === domain) && (!practice || o.cmmc_practices.includes(practice))));
    } catch (e) { next(e); }
  });

  // ---------------------------------------------------------------- summary (remediation tracking)
  r.get('/summary', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const [runs, actions] = await Promise.all([
        tx(req, db, (t) => t.remediationRun.findMany({ where: { engagement_id: eid(req) } })),
        tx(req, db, (t) => t.planAction.findMany({ where: { engagement_id: eid(req) } })),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const count = (pred: (x: any) => boolean, rows: any[]) => rows.filter(pred).length;
      res.json({
        actions: {
          open: count((a) => a.status === 'open', actions),
          in_progress: count((a) => a.status === 'in_progress', actions),
          blocked: count((a) => a.status === 'blocked', actions),
          done: count((a) => a.status === 'done', actions),
        },
        runs: {
          total: runs.length,
          by_status: Object.fromEntries(RUN_STATUSES.map((s) => [s, count((x) => x.status === s, runs)])),
          pending_approval: count((x) => x.status === 'requested', runs),
          pending_verification: count((x) => x.status === 'succeeded', runs),
          by_module: { stamper: count((x) => x.module === 'stamper', runs), adminops: count((x) => x.module === 'adminops', runs) },
        },
        registry: { stamper_entries: STAMPER_ENTRIES.length, stamper_set_entries: STAMPER_ENTRIES.filter((e) => e.has_set).length, adminops_operations: ADMIN_OPS.length },
      });
    } catch (e) { next(e); }
  });

  // ---------------------------------------------------------------- runs
  r.get('/runs', bearerAuth, requireRole(...READ), validate(listQuery, 'query'), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const q = req.query as z.infer<typeof listQuery>;
      const rows = await tx(req, db, (t) => t.remediationRun.findMany({ where: { engagement_id: eid(req), ...(q.module ? { module: q.module } : {}), ...(q.status ? { status: q.status } : {}) } }));
      rows.sort((a: { requested_at: Date }, b: { requested_at: Date }) => +new Date(b.requested_at) - +new Date(a.requested_at));
      res.json(rows);
    } catch (e) { next(e); }
  });

  r.post('/runs', bearerAuth, requireRole(...ADMINOPS_REQUEST_ROLES), validate(requestSchema), async (req, res, next) => {
    try {
      const engagement = await engagementOf(req);
      if (!engagement) return notFound(res);
      const body = req.body as RunRequest;
      if (body.module === 'stamper' && !(STAMPER_ROLES as readonly string[]).includes(roles(req))) { res.status(403).json({ error: 'Stamper runs are requested by BHD operators only', code: 'STAMPER_BHD_ONLY' }); return; }
      const g = evaluateGates(body, engagement);
      if (g.errors.length) { res.status(422).json({ error: g.errors.join('; '), code: 'VALIDATION_ERROR', part: 'body', details: g.errors.map((m) => ({ path: body.module === 'stamper' ? 'entry_ids' : 'op_id', message: m })) }); return; }
      const status: RunStatus = g.blocked ? 'blocked' : g.requiresApproval ? 'requested' : 'approved';
      const row = await tx(req, db, (t) => t.remediationRun.create({ data: {
        tenant_id: user(req).tenant_id, engagement_id: eid(req), module: body.module, mode: body.mode, action_id: body.action_id ?? null, requirement_id: body.requirement_id ?? null,
        entry_ids: body.module === 'stamper' ? body.entry_ids : [], op_id: body.module === 'adminops' ? body.op_id : null, parameters: body.module === 'adminops' ? body.parameters : null,
        justification: body.justification, status, gates: g.gates, cost_estimate: g.cost, requires_approval: g.requiresApproval, requested_by: user(req).sub,
      } }));
      await audit(db, { action: 'remediation.run.request', actor: user(req), target_type: 'remediation_run', target_id: row.id, tenant_id: user(req).tenant_id, detail: { engagement_id: eid(req), module: body.module, mode: body.mode, status, cost: g.cost } }, { strict: true });
      res.status(201).json(row);
    } catch (e) { next(e); }
  });

  r.get('/runs/:id', bearerAuth, requireRole(...READ), validate(idParam, 'params'), async (req, res, next) => {
    try {
      const run = await runOf(req);
      if (!run) return notFound(res);
      const detail = run.module === 'stamper' ? { entries: run.entry_ids.map((id: string) => ENTRY.get(id) ?? { entry_id: id, label: 'unknown' }) } : { op: OP.get(run.op_id) ?? null };
      res.json({ ...run, ...detail });
    } catch (e) { next(e); }
  });

  r.post('/runs/:id/approve', bearerAuth, requireRole(...APPROVE_ROLES), validate(idParam, 'params'), async (req, res, next) => {
    try {
      const run = await runOf(req);
      if (!run) return notFound(res);
      if (run.status !== 'requested') return conflict(res, `Run is ${run.status}, not awaiting approval`, 'RUN_NOT_REQUESTED');
      if (run.requested_by === user(req).sub) return conflict(res, 'DP-2: the approver must be a different person from the requester', 'SOD_SAME_PERSON');
      if (run.module === 'stamper' && !isBhd(req)) { res.status(403).json({ error: 'Stamper runs are approved by a second BHD operator', code: 'STAMPER_BHD_ONLY' }); return; }
      if (run.module === 'adminops' && !(isBhd(req) || user(req).role === 'senior_approver')) { res.status(403).json({ error: 'AdminOps changes are approved by a senior approver or BHD', code: 'ADMINOPS_APPROVER' }); return; }
      const row = await tx(req, db, (t) => t.remediationRun.update({ where: { id: run.id }, data: { status: 'approved', approved_by: user(req).sub, approved_at: new Date(), updated_at: new Date() } }));
      await audit(db, { action: 'remediation.run.approve', actor: user(req), target_type: 'remediation_run', target_id: run.id, tenant_id: user(req).tenant_id, detail: { requested_by: run.requested_by } }, { strict: true });
      res.json(row);
    } catch (e) { next(e); }
  });

  r.post('/runs/:id/reject', bearerAuth, requireRole(...APPROVE_ROLES), validate(idParam, 'params'), validate(rejectSchema), async (req, res, next) => {
    try {
      const run = await runOf(req);
      if (!run) return notFound(res);
      if (run.status !== 'requested' && run.status !== 'approved' && run.status !== 'blocked') return conflict(res, `Run is ${run.status}`, 'RUN_NOT_REJECTABLE');
      if (!(isBhd(req) || (run.module === 'adminops' && user(req).role === 'senior_approver'))) { res.status(403).json({ error: 'Only an approver for this module can reject', code: 'NOT_APPROVER' }); return; }
      const row = await tx(req, db, (t) => t.remediationRun.update({ where: { id: run.id }, data: { status: 'rejected', rejection_reason: (req.body as { reason: string }).reason, approved_by: user(req).sub, approved_at: new Date(), updated_at: new Date() } }));
      await audit(db, { action: 'remediation.run.reject', actor: user(req), target_type: 'remediation_run', target_id: run.id, tenant_id: user(req).tenant_id, detail: { reason: row.rejection_reason } }, { strict: true });
      res.json(row);
    } catch (e) { next(e); }
  });

  /** simulate: record the plan that would run (no tenant contact). live: queued for the runner (Sprint 5). */
  r.post('/runs/:id/execute', bearerAuth, requireRole(...ADMINOPS_REQUEST_ROLES), validate(idParam, 'params'), async (req, res, next) => {
    try {
      const run = await runOf(req);
      if (!run) return notFound(res);
      if (run.module === 'stamper' && !isBhd(req)) { res.status(403).json({ error: 'Stamper runs are executed by BHD operators', code: 'STAMPER_BHD_ONLY' }); return; }
      if (run.status !== 'approved') return conflict(res, run.status === 'requested' ? 'Approval pending (DP-2)' : `Run is ${run.status}`, 'RUN_NOT_APPROVED');
      if (run.mode === 'live') {
        const row = await tx(req, db, (t) => t.remediationRun.update({ where: { id: run.id }, data: { status: 'queued', started_at: new Date(), updated_at: new Date(), result: { queued: true, note: 'Tenant runner integration lands in Sprint 5 (Stamper & AdminOps MVP); nothing has been executed against the tenant.' } } }));
        await audit(db, { action: 'remediation.run.queue', actor: user(req), target_type: 'remediation_run', target_id: run.id, tenant_id: user(req).tenant_id, detail: { mode: 'live' } }, { strict: true });
        res.status(202).json(row);
        return;
      }
      const steps = run.module === 'stamper'
        ? run.entry_ids.map((id: string, i: number) => { const e = ENTRY.get(id); return { step: i + 1, entry_id: id, label: e?.label ?? id, kind: e?.has_set ? 'set' : 'get', engine: e?.engine ?? null, simulated: true, outcome: 'would_run' }; })
        : [{ step: 1, op_id: run.op_id, label: OP.get(run.op_id)?.title ?? run.op_id, parameters: Object.keys(run.parameters ?? {}), simulated: true, outcome: 'would_run' }];
      const row = await tx(req, db, (t) => t.remediationRun.update({ where: { id: run.id }, data: { status: 'succeeded', started_at: new Date(), finished_at: new Date(), updated_at: new Date(), result: { simulated: true, steps, tenant_touched: false } } }));
      await audit(db, { action: 'remediation.run.execute', actor: user(req), target_type: 'remediation_run', target_id: run.id, tenant_id: user(req).tenant_id, detail: { mode: 'simulate', steps: steps.length } }, { strict: true });
      res.json(row);
    } catch (e) { next(e); }
  });

  /** Task verification: a person confirms the outcome (never the engine). Verified runs close their action. */
  r.post('/runs/:id/verify', bearerAuth, requireRole(...ADMINOPS_REQUEST_ROLES), validate(idParam, 'params'), validate(verifySchema), async (req, res, next) => {
    try {
      const run = await runOf(req);
      if (!run) return notFound(res);
      if (run.status !== 'succeeded' && run.status !== 'failed') return conflict(res, `Run is ${run.status}; only a finished run can be verified`, 'RUN_NOT_FINISHED');
      const body = req.body as z.infer<typeof verifySchema>;
      const row = await tx(req, db, (t) => t.remediationRun.update({ where: { id: run.id }, data: { status: body.verified ? 'verified' : 'failed', verified_by: user(req).sub, verified_at: new Date(), verification_notes: body.notes, updated_at: new Date() } }));
      let action = null;
      if (body.verified && run.action_id) {
        const a = await tx(req, db, (t) => t.planAction.findUnique({ where: { id: run.action_id } }));
        if (a && a.status !== 'done') action = await tx(req, db, (t) => t.planAction.update({ where: { id: a.id }, data: { status: 'done', closed_at: new Date(), updated_at: new Date() } }));
      }
      await audit(db, { action: 'remediation.run.verify', actor: user(req), target_type: 'remediation_run', target_id: run.id, tenant_id: user(req).tenant_id, detail: { verified: body.verified, action_closed: !!action } }, { strict: true });
      res.json({ run: row, action });
    } catch (e) { next(e); }
  });

  r.post('/runs/:id/cancel', bearerAuth, requireRole(...ADMINOPS_REQUEST_ROLES), validate(idParam, 'params'), async (req, res, next) => {
    try {
      const run = await runOf(req);
      if (!run) return notFound(res);
      if (['succeeded', 'verified', 'rejected', 'cancelled', 'running'].includes(run.status)) return conflict(res, `Run is ${run.status}`, 'RUN_NOT_CANCELLABLE');
      if (run.requested_by !== user(req).sub && !isBhd(req)) { res.status(403).json({ error: 'Only the requester or BHD can cancel', code: 'NOT_REQUESTER' }); return; }
      const row = await tx(req, db, (t) => t.remediationRun.update({ where: { id: run.id }, data: { status: 'cancelled', updated_at: new Date() } }));
      await audit(db, { action: 'remediation.run.cancel', actor: user(req), target_type: 'remediation_run', target_id: run.id, tenant_id: user(req).tenant_id });
      res.json(row);
    } catch (e) { next(e); }
  });

  return r;
}
