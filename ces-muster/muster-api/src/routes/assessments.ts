// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// assessments.ts — Sprint 3/4 slice "Assess" (2026-11-10): persisted readiness
// assessment runs per engagement, feeding Readiness Assessment and Gap Analysis.
//
//   POST /api/engagements/:engagementId/assessments                 ingest a readiness-result record (1.0.0 / 1.1.0)
//   POST /api/engagements/:engagementId/assessments/from-artifact/:artifactId
//                                                                   ingest a delivered readiness_result blob (Delivery lane)
//   GET  /api/engagements/:engagementId/assessments                 runs, newest first
//   GET  /api/engagements/:engagementId/assessments/:runId          run + by-family summary
//   GET  /api/engagements/:engagementId/assessments/:runId/results  110 rows
//   GET  /api/engagements/:engagementId/assessments/:runId/gaps     rows whose status != met, heaviest first
//   PATCH /api/engagements/:engagementId/assessments/:runId/results/:requirementId   human override (reason required)
//
// Rules kept from the engine: one SPRS — computeSprs() (FCA conservative: only
// 'met' passes); sprs_after is a PROJECTION (registry-fixable gaps flipped to
// met) and is always labelled so; the engine's status is kept beside any human
// override (engine_status vs status) and an override is audited with its reason.

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { bearerAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { withTenant } from '../lib/prisma.js';
import { audit } from '../lib/audit.js';
import { computeSprs } from '../services/sprsCalc.js';
import CONTROLS from '../vendored/ces-shared/data/cmmc-l2-controls.reference.json';
import SPRS_WEIGHTS from '../vendored/ces-shared/data/sprs-weights.json';

const READ = ['prime', 'bhd_operator', 'assessor_read_only', 'sub'] as const;
const WRITE = ['prime', 'bhd_operator'] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
const user = (req: Request) => req.user!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tx = (req: Request, db: Db, fn: (t: Db) => Promise<any>): Promise<any> => withTenant(user(req).tenant_id, fn, db);
const notFound = (res: Response) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });

// ---------------------------------------------------------------- reference data
interface ControlRef { control_id: string; family: string; nist_ref: string; cmmc_level: number; practice: string }
export const CONTROL_REFS: readonly ControlRef[] = (CONTROLS as { controls: ControlRef[] }).controls;
const WEIGHT_BY_NIST = new Map((SPRS_WEIGHTS as { controls: { nist_ref: string; weight: number }[] }).controls.map((c) => [c.nist_ref, c.weight]));
const weightOf = (c: ControlRef) => WEIGHT_BY_NIST.get(c.nist_ref) ?? 1;

export const FAMILY_NAMES: Record<string, string> = {
  AC: 'Access Control', AT: 'Awareness & Training', AU: 'Audit & Accountability', CM: 'Configuration Management',
  IA: 'Identification & Authentication', IR: 'Incident Response', MA: 'Maintenance', MP: 'Media Protection',
  PS: 'Personnel Security', PE: 'Physical Protection', RA: 'Risk Assessment', CA: 'Security Assessment',
  SC: 'System & Communications Protection', SI: 'System & Information Integrity',
};

// ---------------------------------------------------------------- schemas
export const STATUSES = ['met', 'partial', 'not_met', 'unknown'] as const;
type Status = (typeof STATUSES)[number];

const observationSchema = z.object({
  control_id: z.string().min(1),
  objective_ids: z.array(z.string()).default([]),
  confidence: z.enum(['high', 'medium', 'low', 'unknown']).default('unknown'),
  ran_entry_ids: z.array(z.string()).default([]),
  derived_posture: z.enum(STATUSES),
}).passthrough();

const gapSchema = z.object({
  requirement_id: z.string(),
  weight: z.number().optional(),
  fix_entry_ids: z.array(z.string()).default([]),
  fixable: z.enum(['registry', 'manual']).default('manual'),
}).passthrough();

/** A readiness-result record as the SPA / tester writes it (schema 1.0.0 or 1.1.0). */
export const readinessResultSchema = z.object({
  schema_version: z.enum(['readiness-result/1.0.0', 'readiness-result/1.1.0']),
  manifest: z.record(z.unknown()).optional(),
  observations: z.array(observationSchema).min(1),
  derived: z.object({ gaps: z.array(gapSchema).default([]), sprs_after: z.number().optional() }).passthrough().optional(),
  provenance: z.object({ engine: z.object({ name: z.string(), version: z.string() }).optional(), generated_at: z.string().optional() }).passthrough().optional(),
  label: z.string().trim().max(120).optional(),
}).passthrough();
type ReadinessResultInput = z.infer<typeof readinessResultSchema>;

const overrideSchema = z.object({
  status: z.enum(STATUSES),
  reason: z.string().trim().min(10, 'Say why (at least 10 characters) — this is assessor-visible').max(2000),
  notes: z.string().trim().max(4000).optional().nullable(),
});

const runParam = z.object({ runId: z.string().uuid() }).passthrough();
const resultParam = z.object({ runId: z.string().uuid(), requirementId: z.string().min(3) }).passthrough();
const artifactParam = z.object({ artifactId: z.string().uuid() }).passthrough();

// ---------------------------------------------------------------- derivation
const RANK: Record<Status, number> = { not_met: 3, partial: 2, unknown: 1, met: 0 };

/** Worst observation wins; a control without an observation is `unknown` (empty read ≠ evidence). */
export function combinePostures(postures: Status[]): Status {
  if (!postures.length) return 'unknown';
  return postures.reduce((worst, p) => (RANK[p] > RANK[worst] ? p : worst), 'met' as Status);
}

export interface DerivedRow {
  requirement_id: string; family: string; weight: number; status: Status; confidence: string | null;
  objective_ids: string[]; ran_entry_ids: string[]; fixable: 'registry' | 'manual' | null; fix_entry_ids: string[];
}

/** 110 rows from a readiness record: every control of the reference, engine posture + fix path. */
export function deriveRows(rec: ReadinessResultInput): DerivedRow[] {
  const byControl = new Map<string, z.infer<typeof observationSchema>[]>();
  for (const o of rec.observations) byControl.set(o.control_id, [...(byControl.get(o.control_id) ?? []), o]);
  const gapByReq = new Map((rec.derived?.gaps ?? []).map((g) => [g.requirement_id, g]));
  const CONF: Record<string, number> = { high: 3, medium: 2, low: 1, unknown: 0 };
  return CONTROL_REFS.map((c) => {
    const obs = byControl.get(c.control_id) ?? [];
    const status = combinePostures(obs.map((o) => o.derived_posture));
    const confidence = obs.length ? obs.reduce((a, o) => (CONF[o.confidence] < CONF[a] ? o.confidence : a), 'high' as string) : null;
    const gap = gapByReq.get(c.control_id);
    return {
      requirement_id: c.control_id,
      family: c.family,
      weight: weightOf(c),
      status,
      confidence,
      objective_ids: [...new Set(obs.flatMap((o) => o.objective_ids))],
      ran_entry_ids: [...new Set(obs.flatMap((o) => o.ran_entry_ids))],
      fixable: status === 'met' ? null : (gap?.fixable ?? 'manual'),
      fix_entry_ids: gap?.fix_entry_ids ?? [],
    };
  });
}

export function summarise(rows: { status: Status; fixable?: string | null; requirement_id: string }[]) {
  const counts = { met: 0, partial: 0, not_met: 0, unknown: 0 };
  for (const r of rows) counts[r.status]++;
  const now = computeSprs(rows.map((r) => ({ requirement_id: r.requirement_id, status: r.status })));
  // Projection: every registry-fixable gap flipped to met. Always rendered labelled as a projection.
  const after = computeSprs(rows.map((r) => ({ requirement_id: r.requirement_id, status: r.status !== 'met' && r.fixable === 'registry' ? 'met' : r.status })));
  return { counts, sprs_now: now.sprs, sprs_after: after.sprs };
}

function byFamily(rows: { family: string; status: Status; weight: number }[]) {
  const m = new Map<string, { family: string; name: string; total: number; met: number; partial: number; not_met: number; unknown: number; deduction: number }>();
  for (const r of rows) {
    const f = m.get(r.family) ?? { family: r.family, name: FAMILY_NAMES[r.family] ?? r.family, total: 0, met: 0, partial: 0, not_met: 0, unknown: 0, deduction: 0 };
    f.total++;
    f[r.status]++;
    if (r.status !== 'met') f.deduction += r.weight;
    m.set(r.family, f);
  }
  return [...m.values()].sort((a, b) => a.family.localeCompare(b.family));
}

// ---------------------------------------------------------------- router
export function createAssessmentsRouter(db: Db) {
  const r = Router({ mergeParams: true });
  const eid = (req: Request) => (req.params as { engagementId: string }).engagementId;

  async function engagementOf(req: Request) {
    const e = await db.engagement.findUnique({ where: { id: eid(req) } });
    return e && e.tenant_id === user(req).tenant_id ? e : null;
  }

  async function runOf(req: Request) {
    const run = await tx(req, db, (t) => t.assessmentRun.findUnique({ where: { id: (req.params as { runId: string }).runId } }));
    return run && run.engagement_id === eid(req) && run.tenant_id === user(req).tenant_id ? run : null;
  }

  async function ingest(req: Request, res: Response, rec: ReadinessResultInput, source: 'readiness_result' | 'delivery_artifact', artifactId?: string) {
    const rows = deriveRows(rec);
    const s = summarise(rows);
    const run = await tx(req, db, async (t) => {
      const created = await t.assessmentRun.create({
        data: {
          tenant_id: user(req).tenant_id, engagement_id: eid(req), source, schema_version: rec.schema_version,
          label: rec.label ?? null, sprs_now: s.sprs_now, sprs_after: s.sprs_after,
          met_count: s.counts.met, partial_count: s.counts.partial, not_met_count: s.counts.not_met, unknown_count: s.counts.unknown,
          engine: rec.provenance?.engine ?? null, manifest: rec.manifest ?? null,
          generated_at: rec.provenance?.generated_at ? new Date(rec.provenance.generated_at) : null,
          delivery_artifact_id: artifactId ?? null, created_by: user(req).sub,
        },
      });
      for (const row of rows) await t.assessmentResult.create({ data: { ...row, engine_status: row.status, tenant_id: user(req).tenant_id, run_id: created.id } });
      return created;
    });
    await audit(db, { action: 'assessment.ingest', actor: user(req), target_type: 'assessment_run', target_id: run.id, tenant_id: user(req).tenant_id, detail: { engagement_id: eid(req), source, sprs_now: s.sprs_now, observations: rec.observations.length } }, { strict: true });
    res.status(201).json({ ...run, by_family: byFamily(rows) });
  }

  r.post('/', bearerAuth, requireRole(...WRITE), validate(readinessResultSchema), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      await ingest(req, res, req.body as ReadinessResultInput, 'readiness_result');
    } catch (e) { next(e); }
  });

  /** Delivery lane (bhd_operator uploads readiness_result files): turn one into a run. */
  r.post('/from-artifact/:artifactId', bearerAuth, requireRole(...WRITE), validate(artifactParam, 'params'), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const artifact = await db.deliveryArtifact.findUnique({ where: { id: (req.params as { artifactId: string }).artifactId } });
      if (!artifact || artifact.tenant_id !== user(req).tenant_id || artifact.engagement_id !== eid(req)) return notFound(res);
      if (artifact.kind !== 'readiness_result') { res.status(409).json({ error: 'Only readiness_result artifacts can be assessed', code: 'ARTIFACT_KIND' }); return; }
      if (artifact.purged_at) { res.status(410).json({ error: 'Artifact purged', code: 'ARTIFACT_PURGED' }); return; }
      let parsed: unknown;
      try { parsed = JSON.parse(Buffer.from(artifact.content).toString('utf8')); } catch { res.status(422).json({ error: 'Artifact is not JSON', code: 'VALIDATION_ERROR' }); return; }
      const rec = readinessResultSchema.safeParse(parsed);
      if (!rec.success) { res.status(422).json({ error: 'Artifact is not a readiness-result record', code: 'VALIDATION_ERROR', details: rec.error.issues.slice(0, 5) }); return; }
      await ingest(req, res, rec.data, 'delivery_artifact', artifact.id);
    } catch (e) { next(e); }
  });

  r.get('/', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const runs = await tx(req, db, (t) => t.assessmentRun.findMany({ where: { engagement_id: eid(req) }, orderBy: { created_at: 'desc' } }));
      res.json(runs);
    } catch (e) { next(e); }
  });

  r.get('/:runId', bearerAuth, requireRole(...READ), validate(runParam, 'params'), async (req, res, next) => {
    try {
      const run = await runOf(req);
      if (!run) return notFound(res);
      const rows = await tx(req, db, (t) => t.assessmentResult.findMany({ where: { run_id: run.id } }));
      res.json({ ...run, by_family: byFamily(rows), reference: { starting_score: 110, floor_score: -203, requirement_count: CONTROL_REFS.length } });
    } catch (e) { next(e); }
  });

  r.get('/:runId/results', bearerAuth, requireRole(...READ), validate(runParam, 'params'), async (req, res, next) => {
    try {
      const run = await runOf(req);
      if (!run) return notFound(res);
      const rows = await tx(req, db, (t) => t.assessmentResult.findMany({ where: { run_id: run.id } }));
      res.json(rows.sort((a: DerivedRow, b: DerivedRow) => a.requirement_id.localeCompare(b.requirement_id, undefined, { numeric: true })));
    } catch (e) { next(e); }
  });

  r.get('/:runId/gaps', bearerAuth, requireRole(...READ), validate(runParam, 'params'), async (req, res, next) => {
    try {
      const run = await runOf(req);
      if (!run) return notFound(res);
      const rows = await tx(req, db, (t) => t.assessmentResult.findMany({ where: { run_id: run.id } }));
      const gaps = rows.filter((x: DerivedRow) => x.status !== 'met').sort((a: DerivedRow, b: DerivedRow) => b.weight - a.weight || RANK[b.status] - RANK[a.status] || a.requirement_id.localeCompare(b.requirement_id, undefined, { numeric: true }));
      const total = gaps.reduce((n: number, g: DerivedRow) => n + g.weight, 0);
      const registry = gaps.filter((g: DerivedRow) => g.fixable === 'registry');
      res.json({ run_id: run.id, sprs_now: run.sprs_now, sprs_after: run.sprs_after, gap_count: gaps.length, deduction_total: total, registry_fixable: registry.length, registry_fixable_weight: registry.reduce((n: number, g: DerivedRow) => n + g.weight, 0), gaps });
    } catch (e) { next(e); }
  });

  /** Human override: keeps engine_status, records who/why, recomputes the run's SPRS. */
  r.patch('/:runId/results/:requirementId', bearerAuth, requireRole(...WRITE), validate(resultParam, 'params'), validate(overrideSchema), async (req, res, next) => {
    try {
      const run = await runOf(req);
      if (!run) return notFound(res);
      const requirementId = (req.params as { requirementId: string }).requirementId;
      const rows = await tx(req, db, (t) => t.assessmentResult.findMany({ where: { run_id: run.id } }));
      const row = rows.find((x: DerivedRow) => x.requirement_id === requirementId);
      if (!row) return notFound(res);
      const body = req.body as z.infer<typeof overrideSchema>;
      const updated = await tx(req, db, (t) => t.assessmentResult.update({ where: { id: row.id }, data: { status: body.status, override_by: user(req).sub, override_at: new Date(), override_reason: body.reason, notes: body.notes ?? row.notes ?? null } }));
      const next_rows = rows.map((x: DerivedRow & { id: string }) => (x.id === row.id ? updated : x));
      const s = summarise(next_rows);
      const newRun = await tx(req, db, (t) => t.assessmentRun.update({ where: { id: run.id }, data: { sprs_now: s.sprs_now, sprs_after: s.sprs_after, met_count: s.counts.met, partial_count: s.counts.partial, not_met_count: s.counts.not_met, unknown_count: s.counts.unknown } }));
      await audit(db, { action: 'assessment.override', actor: user(req), target_type: 'assessment_result', target_id: row.id, tenant_id: user(req).tenant_id, detail: { run_id: run.id, requirement_id: requirementId, from: row.status, to: body.status, engine_status: row.engine_status, reason: body.reason } }, { strict: true });
      res.json({ result: updated, run: newRun });
    } catch (e) { next(e); }
  });

  return r;
}
