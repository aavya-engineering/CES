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
//   POST /api/engagements/:engagementId/assessments/run                 ENGINE: run discovery (simulator, or live behind the Live gate)
//                                                                      through the registry and persist the outcome as a run (source engine_run)
//   GET  /api/engagements/:engagementId/assessments/jobs/:jobId        job status while the engine runs
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
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { runSimDiscovery, type SimDiscoveryDeps, type SimDiscoveryOutcome } from '../services/simDiscoveryRun.js';
import { runLiveDiscovery, type LiveDiscoveryDeps } from '../services/liveDiscoveryRun.js';
import { captureRunEvidence, createCaptureItems } from '../services/runCaptures.js';
import { authorizeLive, type LiveGate } from '../services/liveAccess.js';
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
  raw_capture_ref: z.string().optional(),
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
export interface AssessmentsRouterOptions {
  /** Live gate (engagement flag + device-code consent). Absent → live runs refused. */
  live?: LiveGate;
  /** Test seams. */
  runSim?: typeof runSimDiscovery;
  runSimDeps?: SimDiscoveryDeps;
  runLive?: typeof runLiveDiscovery;
  runLiveDeps?: LiveDiscoveryDeps;
  workRoot?: string;
  /** Test seam for reading capture files. */
  readCapture?: (abs: string) => Buffer | null;
}

type EngineSource = 'readiness_result' | 'delivery_artifact' | 'engine_run';

export function createAssessmentsRouter(db: Db, opts: AssessmentsRouterOptions = {}) {
  const r = Router({ mergeParams: true });
  const eid = (req: Request) => (req.params as { engagementId: string }).engagementId;
  const workRoot = opts.workRoot ?? path.join(os.tmpdir(), 'muster-assessment-runs');

  /** Persist a readiness record as a run for (tenant, engagement). Shared by import, artifact and engine paths. */
  async function persistRun(actor: { sub: string; role: string; tenant_id: string }, engagementId: string, rec: ReadinessResultInput, source: EngineSource, extra: { artifactId?: string; label?: string } = {}) {
    const rows = deriveRows(rec);
    const s = summarise(rows);
    const run = await withTenant(actor.tenant_id, async (t: Db) => {
      const created = await t.assessmentRun.create({
        data: {
          tenant_id: actor.tenant_id, engagement_id: engagementId, source, schema_version: rec.schema_version,
          label: extra.label ?? rec.label ?? null, sprs_now: s.sprs_now, sprs_after: s.sprs_after,
          met_count: s.counts.met, partial_count: s.counts.partial, not_met_count: s.counts.not_met, unknown_count: s.counts.unknown,
          engine: rec.provenance?.engine ?? null, manifest: rec.manifest ?? null,
          generated_at: rec.provenance?.generated_at ? new Date(rec.provenance.generated_at) : null,
          delivery_artifact_id: extra.artifactId ?? null, created_by: actor.sub,
        },
      });
      for (const row of rows) await t.assessmentResult.create({ data: { ...row, engine_status: row.status, tenant_id: actor.tenant_id, run_id: created.id } });
      return created;
    }, db);
    await audit(db, { action: 'assessment.ingest', actor, target_type: 'assessment_run', target_id: run.id, tenant_id: actor.tenant_id, detail: { engagement_id: engagementId, source, sprs_now: s.sprs_now, observations: rec.observations.length } }, { strict: true });
    return { run, rows };
  }

  async function engagementOf(req: Request) {
    const e = await db.engagement.findUnique({ where: { id: eid(req) } });
    return e && e.tenant_id === user(req).tenant_id ? e : null;
  }

  async function runOf(req: Request) {
    const run = await tx(req, db, (t) => t.assessmentRun.findUnique({ where: { id: (req.params as { runId: string }).runId } }));
    return run && run.engagement_id === eid(req) && run.tenant_id === user(req).tenant_id ? run : null;
  }

  async function ingest(req: Request, res: Response, rec: ReadinessResultInput, source: 'readiness_result' | 'delivery_artifact', artifactId?: string) {
    const { run, rows } = await persistRun(user(req), eid(req), rec, source, { artifactId });
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

  // ---------------------------------------------------------------- ENGINE: run discovery and persist
  const runSchema = z.object({
    mode: z.enum(['sim', 'live']).default('sim'),
    tenant_slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/).default('muster-partial'),
    consent_ids: z.array(z.string()).optional(),
    label: z.string().trim().max(120).optional(),
  });
  const jobParam = z.object({ jobId: z.string().uuid() }).passthrough();

  const RUNNER_ROLES = ['bhd_operator'] as const;
  /** Status-guarded transition — the database decides who wins (two runners, a late result). */
  const moveJob = async (req: Request, id: string, from: string, data: Record<string, unknown>) => {
    const r = await tx(req, db, (t) => t.engineJob.updateMany({ where: { id, status: from }, data: { ...data, updated_at: new Date() } }));
    return r.count ? tx(req, db, (t) => t.engineJob.findUnique({ where: { id } })) : null;
  };
  async function jobOf(req: Request) {
    const j = await tx(req, db, (t) => t.engineJob.findUnique({ where: { id: (req.params as { jobId: string }).jobId } }));
    return j && j.engagement_id === eid(req) && j.tenant_id === user(req).tenant_id ? j : null;
  }
  /** Land an envelope as a run (+ captures) and close the job. Shared by the in-process engine and the runner result. */
  async function landEnvelope(actor: { sub: string; role: string; tenant_id: string }, engagementId: string, jobId: string, envelope: unknown, extra: { label: string; stats?: unknown; outDir?: string; readFile?: (abs: string) => Buffer | null; captures?: { ref: string; content: Buffer; content_type?: string; requirement_ids: string[]; objective_ids?: string[]; entries?: string[] }[] }) {
    const parsed = readinessResultSchema.safeParse(envelope);
    if (!parsed.success) {
      await withTenant(actor.tenant_id, (t: Db) => t.engineJob.update({ where: { id: jobId }, data: { status: 'failed', finished_at: new Date(), error: `engine envelope did not validate: ${parsed.error.issues[0]?.message ?? 'unknown'}`, updated_at: new Date() } }), db);
      return null;
    }
    const { run } = await persistRun(actor, engagementId, parsed.data, 'engine_run', { label: extra.label });
    let evidence: { created: number; missing_files: number; skipped_no_ref?: number } | undefined;
    try {
      if (extra.captures?.length) { const ids = await createCaptureItems(db, { actor, engagementId, source: 'discovery', label: extra.label, captures: extra.captures, assessmentRunId: run.id }); evidence = { created: ids.length, missing_files: 0 }; }
      else if (extra.outDir) evidence = await captureRunEvidence(db, { actor, engagementId, assessmentRunId: run.id, source: 'discovery', outDir: extra.outDir, observations: parsed.data.observations, label: extra.label, readFile: extra.readFile });
    } catch { evidence = undefined; }
    await withTenant(actor.tenant_id, (t: Db) => t.engineJob.update({ where: { id: jobId }, data: { status: 'done', finished_at: new Date(), run_id: run.id, stats: extra.stats ?? null, evidence: evidence ?? null, updated_at: new Date() } }), db);
    return run;
  }

  /** Request a discovery run. On a Windows host (or with the test seams) the engine runs in-process;
   *  elsewhere the job stays `queued` for the Windows runner (runner/queue → claim → result). */
  r.post('/run', bearerAuth, requireRole(...WRITE), validate(runSchema), async (req, res, next) => {
    try {
      const engagement = await engagementOf(req);
      if (!engagement) return notFound(res);
      const body = req.body as z.infer<typeof runSchema>;
      const actor = { sub: user(req).sub, role: user(req).role, tenant_id: user(req).tenant_id };
      const engagementId = eid(req);
      const label = body.label ?? `Discovery run (${body.mode === 'live' ? 'LIVE' : 'simulator'} · ${body.tenant_slug})`;
      let grants: unknown = undefined;
      if (body.mode === 'live') {
        // Live rail: engagement flag ON + a granted consent per area, else refused (never a silent fallback to sim).
        const auth = await authorizeLive(opts.live, actor.tenant_id, engagementId, body.consent_ids);
        if (!auth.ok) { res.status(auth.status).json({ error: auth.code, code: 'LIVE_REFUSED' }); return; }
        grants = auth.grants;
      }
      // The registry's read commands are PowerShell (liveSimSession spawns powershell.exe; the kit's simAvailable()
      // is win32-only): run in-process only on a Windows host, otherwise leave the job for the runner.
      // CES_ENGINE_LOCAL=1 forces in-process, =0 forces the queue (to exercise the runner on a Windows dev box).
      const forced = process.env.CES_ENGINE_LOCAL;
      const local = !!(opts.runSim || opts.runLive || (forced === '0' ? false : forced === '1' || process.platform === 'win32'));
      const job = await tx(req, db, (t) => t.engineJob.create({ data: { tenant_id: actor.tenant_id, engagement_id: engagementId, kind: 'discovery', mode: body.mode, tenant_slug: body.tenant_slug, label, status: local ? 'running' : 'queued', requested_by: actor.sub, claimed_by: local ? 'api' : null, claimed_at: local ? new Date() : null } }));
      await audit(db, { action: 'assessment.run.start', actor, target_type: 'engagement', target_id: engagementId, tenant_id: actor.tenant_id, detail: { job_id: job.id, mode: body.mode, tenant_slug: body.tenant_slug, where: local ? 'api' : 'runner' } });
      if (!local) { res.status(202).json({ job_id: job.id, status: 'queued', mode: body.mode, tenant_slug: body.tenant_slug, note: 'Queued for the Windows runner (registry commands are PowerShell).' }); return; }

      const outDir = path.join(workRoot, job.id);
      const started: Promise<SimDiscoveryOutcome> = body.mode === 'live'
        ? Promise.resolve().then(() => (opts.runLive ?? runLiveDiscovery)({ slug: body.tenant_slug, outDir, engagementId, grants: grants as never }, opts.runLiveDeps))
        : Promise.resolve().then(() => (opts.runSim ?? runSimDiscovery)({ slug: body.tenant_slug, outDir }, opts.runSimDeps));
      void started
        .catch((e): SimDiscoveryOutcome => ({ ok: false, code: 'envelope_invalid', message: e instanceof Error ? e.message : String(e) }))
        .then(async (outcome) => {
          const fail = async (error: string, code: string, extra: Record<string, unknown> = {}) => {
            await withTenant(actor.tenant_id, (t: Db) => t.engineJob.update({ where: { id: job.id }, data: { status: 'failed', finished_at: new Date(), error, updated_at: new Date() } }), db);
            await audit(db, { action: 'assessment.run.failed', actor, target_type: 'engagement', target_id: engagementId, tenant_id: actor.tenant_id, detail: { job_id: job.id, code, ...extra } });
          };
          if (!outcome.ok) return fail(`${outcome.code}: ${outcome.message}`, outcome.code, { message: outcome.message });
          const st = outcome.stats as { ran?: number; failed?: number } | undefined;
          // An empty read is not evidence: when every executed command failed, nothing is recorded.
          if (st && st.ran && st.failed === st.ran) return fail(`engine_unavailable: all ${st.ran} registry commands failed to execute on this host (PowerShell not available?) — nothing was recorded`, 'engine_unavailable', { stats: st });
          try { await landEnvelope(actor, engagementId, job.id, outcome.envelope, { label, stats: outcome.stats, outDir, readFile: opts.readCapture }); }
          catch (e) { await fail(e instanceof Error ? e.message : String(e), 'persist_failed'); }
        });
      res.status(202).json({ job_id: job.id, status: 'running', mode: body.mode, tenant_slug: body.tenant_slug });
    } catch (e) { next(e); }
  });

  r.get('/jobs', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const rows = await tx(req, db, (t) => t.engineJob.findMany({ where: { engagement_id: eid(req) } }));
      rows.sort((a: { requested_at: Date }, b: { requested_at: Date }) => +new Date(b.requested_at) - +new Date(a.requested_at));
      res.json(rows.slice(0, 50));
    } catch (e) { next(e); }
  });
  r.get('/jobs/:jobId', bearerAuth, requireRole(...READ), validate(jobParam, 'params'), async (req, res, next) => {
    try {
      const job = await jobOf(req);
      if (!job) return notFound(res);
      res.json(job);
    } catch (e) { next(e); }
  });
  r.post('/jobs/:jobId/cancel', bearerAuth, requireRole(...WRITE), validate(jobParam, 'params'), async (req, res, next) => {
    try {
      const job = await jobOf(req);
      if (!job) return notFound(res);
      const row = await moveJob(req, job.id, 'queued', { status: 'cancelled', finished_at: new Date() });
      if (!row) { res.status(409).json({ error: `Job is ${job.status}; only a queued job can be cancelled`, code: 'JOB_NOT_QUEUED' }); return; }
      await audit(db, { action: 'assessment.run.cancel', actor: user(req), target_type: 'engine_job', target_id: job.id, tenant_id: user(req).tenant_id, detail: {} });
      res.json(row);
    } catch (e) { next(e); }
  });

  // ------------------------------------------------------------------ runner protocol (discovery)
  // The Windows runner (BHD service identity) pulls queued discovery jobs, walks the registry against the
  // simulator or — only when the job was requested through the Live gate — the tenant, and posts the envelope.
  const claimSchema = z.object({ runner: z.string().trim().min(2).max(120) });
  const captureSchema = z.object({ ref: z.string().trim().min(1).max(200), content: z.string().max(2 * 1024 * 1024), encoding: z.enum(['utf8', 'base64']).default('utf8'), content_type: z.string().max(100).optional(), entry_id: z.string().max(200).optional(), requirement_ids: z.array(z.string()).default([]), objective_ids: z.array(z.string()).default([]) });
  const resultSchema = z.object({
    runner: z.string().trim().min(2).max(120),
    outcome: z.enum(['succeeded', 'failed']),
    error: z.string().max(4000).optional(),
    envelope: z.unknown().optional(),
    stats: z.record(z.unknown()).optional(),
    captures: z.array(captureSchema).max(50).default([]),
  });
  r.get('/runner/queue', bearerAuth, requireRole(...RUNNER_ROLES), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const rows = await tx(req, db, (t) => t.engineJob.findMany({ where: { engagement_id: eid(req), status: 'queued' } }));
      rows.sort((a: { requested_at: Date }, b: { requested_at: Date }) => +new Date(a.requested_at) - +new Date(b.requested_at));
      res.json(rows.map((j: Record<string, unknown>) => ({ id: j.id, kind: j.kind, mode: j.mode, tenant_slug: j.tenant_slug, label: j.label, requested_by: j.requested_by, requested_at: j.requested_at })));
    } catch (e) { next(e); }
  });
  r.post('/jobs/:jobId/claim', bearerAuth, requireRole(...RUNNER_ROLES), validate(jobParam, 'params'), validate(claimSchema), async (req, res, next) => {
    try {
      const job = await jobOf(req);
      if (!job) return notFound(res);
      if (job.mode === 'live') { const e = await engagementOf(req); if (!e?.live_access_enabled) { res.status(409).json({ error: 'Live access has been disabled on this engagement; the job is not handed out', code: 'LIVE_DISABLED' }); return; } }
      const runner = (req.body as z.infer<typeof claimSchema>).runner;
      const row = await moveJob(req, job.id, 'queued', { status: 'running', claimed_by: runner, claimed_at: new Date() });
      if (!row) { res.status(409).json({ error: `Job is ${job.status}`, code: 'JOB_NOT_QUEUED' }); return; }
      await audit(db, { action: 'assessment.run.claim', actor: user(req), target_type: 'engine_job', target_id: job.id, tenant_id: user(req).tenant_id, detail: { runner, mode: job.mode } }, { strict: true });
      res.json(row);
    } catch (e) { next(e); }
  });
  r.post('/jobs/:jobId/result', bearerAuth, requireRole(...RUNNER_ROLES), validate(jobParam, 'params'), validate(resultSchema), async (req, res, next) => {
    try {
      const job = await jobOf(req);
      if (!job) return notFound(res);
      if (job.status !== 'running') { res.status(409).json({ error: `Job is ${job.status}; results are accepted only for a running job`, code: 'JOB_NOT_RUNNING' }); return; }
      const body = req.body as z.infer<typeof resultSchema>;
      const actor = { sub: user(req).sub, role: user(req).role, tenant_id: user(req).tenant_id };
      if (body.outcome === 'failed' || !body.envelope) {
        const row = await moveJob(req, job.id, 'running', { status: 'failed', finished_at: new Date(), error: body.error ?? 'runner reported failure', stats: body.stats ?? null });
        if (!row) { res.status(409).json({ error: 'A result was already recorded', code: 'JOB_NOT_RUNNING' }); return; }
        await audit(db, { action: 'assessment.run.failed', actor, target_type: 'engagement', target_id: eid(req), tenant_id: actor.tenant_id, detail: { job_id: job.id, runner: body.runner, error: body.error ?? null } });
        res.json(row); return;
      }
      // Take the job out of `running` first so a duplicate result cannot land a second run.
      const taken = await moveJob(req, job.id, 'running', { status: 'done', finished_at: new Date() });
      if (!taken) { res.status(409).json({ error: 'A result was already recorded', code: 'JOB_NOT_RUNNING' }); return; }
      const captures = body.captures.map((c) => ({ ref: c.ref, content: Buffer.from(c.content, c.encoding), content_type: c.content_type, requirement_ids: c.requirement_ids, objective_ids: c.objective_ids, entries: c.entry_id ? [c.entry_id] : [] }));
      const run = await landEnvelope(actor, eid(req), job.id, body.envelope, { label: job.label ?? `Discovery run (${job.mode} · ${job.tenant_slug})`, stats: body.stats, captures });
      if (!run) { res.status(422).json({ error: 'Envelope is not a readiness-result record', code: 'VALIDATION_ERROR' }); return; }
      await audit(db, { action: 'assessment.run.result', actor, target_type: 'engine_job', target_id: job.id, tenant_id: actor.tenant_id, detail: { runner: body.runner, run_id: run.id, captures: captures.length } }, { strict: true });
      res.json(await tx(req, db, (t) => t.engineJob.findUnique({ where: { id: job.id } })));
    } catch (e) { next(e); }
  });

  return r;
}
