// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// evidence.ts — Sprint 6 slice "Collect Evidence" (2026-11-10): evidence items,
// validation against the published CES-Shared catalogue, SoD review, versions,
// coverage and evidence requests, per engagement.
//
//   GET  /api/engagements/:engagementId/evidence/summary          counts, coverage totals, pending review, expiring
//   GET  /api/engagements/:engagementId/evidence/catalog          published archetypes / mappings / rules (for forms)
//   GET  /api/engagements/:engagementId/evidence/coverage         per requirement
//   GET  /api/engagements/:engagementId/evidence/items            ?requirement=&status=&source=&archetype=&q=
//   POST /api/engagements/:engagementId/evidence/items            JSON + optional content_base64 (≤ 10 MB) → draft, validated at once
//   GET  /api/engagements/:engagementId/evidence/items/:id        (no content)
//   GET  /api/engagements/:engagementId/evidence/items/:id/content
//   PATCH /api/engagements/:engagementId/evidence/items/:id       metadata (not content); re-validated
//   POST /api/engagements/:engagementId/evidence/items/:id/submit  draft → submitted (must pass blocking checks)
//   POST /api/engagements/:engagementId/evidence/items/:id/validate re-run checks
//   POST /api/engagements/:engagementId/evidence/items/:id/review  { decision: approve|reject, notes } — SoD: not the submitter
//   POST /api/engagements/:engagementId/evidence/items/:id/new-version  content_base64 … → version n+1, previous archived
//   POST /api/engagements/:engagementId/evidence/items/:id/archive
//   GET/POST /api/engagements/:engagementId/evidence/requests ; PATCH /requests/:id ; POST /requests/generate
//
// Roles: read = prime|bhd_operator|assessor_read_only|sub; submit/edit =
// prime|sub|bhd_operator (compliance_manager, it_security_admin inherit);
// review/approve = evidence_reviewer or bhd_operator (never the submitter —
// SOD_RULES). Every state change is audited.

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { bearerAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { withTenant } from '../lib/prisma.js';
import { audit } from '../lib/audit.js';
import { CONTROL_REFS } from './assessments.js';
import { coverage, sha256Of, validateEvidence, type Catalogue, type ValidationReport } from '../services/evidenceValidation.js';
import { loadCatalog, requirementCoverage, catalogSummary, validateCatalogRows, toNistRef } from '../services/evidenceCatalog.js';

const READ = ['prime', 'bhd_operator', 'assessor_read_only', 'sub'] as const;
const WRITE = ['prime', 'sub', 'bhd_operator'] as const;
const REVIEW = ['bhd_operator', 'assessor_read_only'] as const; // evidence_reviewer inherits assessor_read_only; checked below

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
const user = (req: Request) => req.user!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tx = (req: Request, db: Db, fn: (t: Db) => Promise<any>): Promise<any> => withTenant(user(req).tenant_id, fn, db);
const notFound = (res: Response) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
const conflict = (res: Response, error: string, code: string) => res.status(409).json({ error, code });
const MAX_BYTES = 10 * 1024 * 1024;
const REQ_IDS = new Set(CONTROL_REFS.map((c) => c.control_id));

export const KINDS = ['document', 'screenshot', 'export', 'config_capture', 'attestation', 'log', 'other'] as const;
export const SOURCES = ['upload', 'stamper', 'adminops', 'discovery', 'manual'] as const;
export const STATUSES = ['draft', 'submitted', 'validated', 'rejected', 'expired', 'archived'] as const;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').transform((s) => new Date(`${s}T00:00:00.000Z`));
const reqId = z.string().trim().regex(/^[A-Z]{2}\.L[123]-\d+\.\d+\.\d+$/, 'e.g. AC.L2-3.1.5');
const itemSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  requirement_ids: z.array(reqId).min(1).max(20),
  objective_ids: z.array(z.string().trim().max(40)).max(50).default([]),
  archetype_code: z.string().trim().regex(/^EMX-[A-Z0-9]+-\d{3}$/).optional().nullable(),
  /** File against a BHD catalog definition (`AC.L2-3.1.1#E01`): requirement, objectives and form are filled from it. */
  definition_id: z.string().trim().regex(/^[A-Z]{2}\.L[12]-3\.\d{1,2}\.\d{1,2}#E\d{2}$/).optional().nullable(),
  form: z.string().trim().max(200).optional().nullable(),
  kind: z.enum(KINDS).default('document'),
  source: z.enum(SOURCES).default('upload'),
  file_name: z.string().trim().max(255).optional().nullable(),
  content_type: z.string().trim().max(120).optional().nullable(),
  content_base64: z.string().max(Math.ceil(MAX_BYTES * 2.8)).optional().nullable(), // size itself is checked after parsing → 413
  metadata: z.record(z.unknown()).optional().nullable(),
  collected_at: z.string().datetime().optional(),
  period_start: date.optional().nullable(),
  period_end: date.optional().nullable(),
  owner: z.string().trim().max(200).optional().nullable(),
  classification: z.enum(['cui', 'non_cui', 'internal']).default('internal'),
  run_id: z.string().uuid().optional().nullable(),
  retention_until: date.optional().nullable(),
});
const itemPatch = itemSchema.omit({ content_base64: true, file_name: true, content_type: true }).partial();
const reviewSchema = z.object({ decision: z.enum(['approve', 'reject']), notes: z.string().trim().min(5).max(4000) });
const requestSchema = z.object({
  requirement_id: reqId,
  archetype_code: z.string().trim().regex(/^EMX-[A-Z0-9]+-\d{3}$/).optional().nullable(),
  title: z.string().trim().min(3).max(200),
  instructions: z.string().trim().max(4000).optional().nullable(),
  assignee: z.string().trim().max(200).optional().nullable(),
  due_date: date.optional().nullable(),
  status: z.enum(['open', 'submitted', 'fulfilled', 'cancelled']).default('open'),
  evidence_item_id: z.string().uuid().optional().nullable(),
});
const requestPatch = requestSchema.partial();
const generateSchema = z.object({ requirement_ids: z.array(reqId).max(110).optional(), only_gaps_of_run: z.string().uuid().optional(), assignee: z.string().trim().max(200).optional().nullable(), due_date: date.optional().nullable() });
const idParam = z.object({ id: z.string().uuid() }).passthrough();
const listQuery = z.object({ requirement: z.string().optional(), status: z.enum(STATUSES).optional(), source: z.enum(SOURCES).optional(), archetype: z.string().optional(), q: z.string().max(100).optional() });

const strip = (row: Record<string, unknown>) => { const { content, ...rest } = row; void content; return rest; };

export function createEvidenceRouter(db: Db) {
  const r = Router({ mergeParams: true });
  const eid = (req: Request) => (req.params as { engagementId: string }).engagementId;
  async function engagementOf(req: Request) {
    const e = await db.engagement.findUnique({ where: { id: eid(req) } });
    return e && e.tenant_id === user(req).tenant_id ? e : null;
  }
  async function itemOf(req: Request) {
    const it = await tx(req, db, (t) => t.evidenceItem.findUnique({ where: { id: req.params.id } }));
    return it && it.engagement_id === eid(req) && it.tenant_id === user(req).tenant_id ? it : null;
  }
  /** Published CES-Shared catalogue: archetypes, mappings, rules (global, not tenant data). */
  async function catalogue(): Promise<Catalogue> {
    const rows = await db.sharedItem.findMany({ where: { status: 'published' } });
    const pick = (kind: string) => rows.filter((x: { kind: string }) => x.kind === kind).map((x: { data: unknown }) => x.data);
    return { archetypes: pick('archetype'), mappings: pick('mapping'), rules: pick('rule') };
  }
  const isReviewer = (req: Request) => user(req).role === 'evidence_reviewer' || user(req).role === 'bhd_operator';

  // ---------------------------------------------------------------- catalogue / coverage / summary
  r.get('/catalog', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try { if (!(await engagementOf(req))) return notFound(res); res.json(await catalogue()); } catch (e) { next(e); }
  });

  // ---------------------------------------------------------------- BHD evidence catalog (per NIST examine object / objective)
  r.get('/nist-catalog', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const items = await tx(req, db, (t) => t.evidenceItem.findMany({ where: { engagement_id: eid(req) }, omit: { content: true } }));
      const cat = loadCatalog();
      res.json({ releases: cat.releases, definitions: cat.definitions.length, requirements: catalogSummary(items, cat) });
    } catch (e) { next(e); }
  });
  r.get('/nist-catalog/:requirementId', bearerAuth, requireRole(...READ), validate(z.object({ requirementId: reqId }).passthrough(), 'params'), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const items = await tx(req, db, (t) => t.evidenceItem.findMany({ where: { engagement_id: eid(req) }, omit: { content: true } }));
      res.json(requirementCoverage((req.params as { requirementId: string }).requirementId, items));
    } catch (e) { next(e); }
  });
  /** Check a batch of catalog rows (BHD's contractor batches) before it is accepted as a release. Reference data only — nothing is stored. */
  r.post('/nist-catalog/validate', bearerAuth, requireRole(...WRITE), validate(z.object({ rows: z.array(z.record(z.unknown())).min(1).max(2000) })), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const out = validateCatalogRows((req.body as { rows: unknown[] }).rows);
      await audit(db, { action: 'evidence.catalog.validate', actor: user(req), target_type: 'engagement', target_id: eid(req), tenant_id: user(req).tenant_id, detail: { rows: out.total, ok: out.ok, fix: out.findings.filter((f) => f.severity === 'fix').length } });
      res.json(out);
    } catch (e) { next(e); }
  });

  r.get('/coverage', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const [cat, items] = await Promise.all([catalogue(), tx(req, db, (t) => t.evidenceItem.findMany({ where: { engagement_id: eid(req) }, omit: { content: true } }))]);
      res.json(coverage(CONTROL_REFS.map((c) => c.control_id), cat, items));
    } catch (e) { next(e); }
  });

  r.get('/summary', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const [cat, items, requests] = await Promise.all([catalogue(), tx(req, db, (t) => t.evidenceItem.findMany({ where: { engagement_id: eid(req) }, omit: { content: true } })), tx(req, db, (t) => t.evidenceRequest.findMany({ where: { engagement_id: eid(req) } }))]);
      const cov = coverage(CONTROL_REFS.map((c) => c.control_id), cat, items);
      const by = (key: string, keys: readonly string[], rows: Record<string, unknown>[]) => Object.fromEntries(keys.map((k) => [k, rows.filter((x) => x[key] === k).length]));
      const soon = new Date(Date.now() + 30 * 86_400_000);
      res.json({
        items: { total: items.length, by_status: by('status', STATUSES, items), by_source: by('source', SOURCES, items), pending_review: items.filter((i: { status: string }) => i.status === 'submitted').length, expiring_30d: items.filter((i: { retention_until: Date | null; status: string }) => i.retention_until && new Date(i.retention_until) <= soon && i.status !== 'archived').length, cui: items.filter((i: { classification: string }) => i.classification === 'cui').length },
        coverage: { requirements: cov.length, covered: cov.filter((c) => c.state === 'covered').length, partial: cov.filter((c) => c.state === 'partial').length, missing: cov.filter((c) => c.state === 'missing').length, none_required: cov.filter((c) => c.state === 'none_required').length },
        requests: { total: requests.length, open: requests.filter((q: { status: string }) => q.status === 'open').length, overdue: requests.filter((q: { status: string; due_date: Date | null }) => q.status === 'open' && q.due_date && new Date(q.due_date) < new Date()).length },
        catalogue: { archetypes: cat.archetypes.length, mappings: cat.mappings.length, rules: cat.rules.length },
      });
    } catch (e) { next(e); }
  });

  // ---------------------------------------------------------------- items
  r.get('/items', bearerAuth, requireRole(...READ), validate(listQuery, 'query'), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const q = req.query as z.infer<typeof listQuery>;
      const rows = await tx(req, db, (t) => t.evidenceItem.findMany({ where: { engagement_id: eid(req), ...(q.status ? { status: q.status } : {}), ...(q.source ? { source: q.source } : {}) }, omit: { content: true } }));
      const out = rows.filter((i: { requirement_ids: string[]; archetype_code: string | null; title: string; file_name: string | null }) =>
        (!q.requirement || i.requirement_ids.includes(q.requirement)) && (!q.archetype || i.archetype_code === q.archetype) && (!q.q || `${i.title} ${i.file_name ?? ''} ${i.requirement_ids.join(' ')}`.toLowerCase().includes(q.q.toLowerCase())));
      out.sort((a: { updated_at: Date }, b: { updated_at: Date }) => +new Date(b.updated_at) - +new Date(a.updated_at));
      res.json(out.map(strip));
    } catch (e) { next(e); }
  });

  async function createItem(req: Request, body: z.infer<typeof itemSchema>, extra: Record<string, unknown>) {
    const content = body.content_base64 ? Buffer.from(body.content_base64, 'base64') : null;
    const cat = await catalogue();
    const data = {
      ...body, content_base64: undefined, content, size_bytes: content?.length ?? 0, sha256: content ? sha256Of(content) : null,
      collected_at: body.collected_at ? new Date(body.collected_at) : new Date(), status: 'draft', version: 1, tenant_id: user(req).tenant_id, engagement_id: eid(req), created_by: user(req).sub, ...extra,
    };
    delete (data as { content_base64?: unknown }).content_base64;
    delete (data as { definition_id?: unknown }).definition_id; // not a column — carried in metadata.definition_id
    const report = validateEvidence({ ...data, content, status: 'draft' } as never, cat);
    return tx(req, db, (t) => t.evidenceItem.create({ data: { ...data, validation: report } }));
  }

  r.post('/items', bearerAuth, requireRole(...WRITE), validate(itemSchema), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const body = req.body as z.infer<typeof itemSchema>;
      if (body.definition_id) {
        const d = loadCatalog().byId.get(body.definition_id);
        if (!d) { res.status(422).json({ error: 'Unknown catalog definition', code: 'VALIDATION_ERROR', part: 'body', details: [{ path: 'definition_id', message: 'not in any released catalog' }] }); return; }
        const reqIds = new Set([...body.requirement_ids, ...CONTROL_REFS.filter((c) => toNistRef(c.control_id) === d.nist_ref).map((c) => c.control_id)]);
        body.requirement_ids = [...reqIds];
        body.objective_ids = [...new Set([...body.objective_ids, ...d.objective_ids])];
        body.form = body.form ?? d.form_title;
        body.archetype_code = body.archetype_code ?? (d.emx_ids[0] ?? null);
        body.metadata = { ...(body.metadata ?? {}), definition_id: d.definition_id, examine_text: d.examine_text, tier: d.tier, production: d.production };
      }
      if (body.content_base64 && Buffer.byteLength(body.content_base64, 'base64') > MAX_BYTES) { res.status(413).json({ error: 'Evidence files are limited to 10 MB here; link larger files from the repository (metadata.external_url)', code: 'TOO_LARGE' }); return; }
      const row = await createItem(req, body, {});
      await audit(db, { action: 'evidence.create', actor: user(req), target_type: 'evidence_item', target_id: row.id, tenant_id: user(req).tenant_id, detail: { engagement_id: eid(req), requirement_ids: row.requirement_ids, archetype: row.archetype_code, passed: row.validation.passed } });
      res.status(201).json(strip(row));
    } catch (e) { next(e); }
  });

  r.get('/items/:id', bearerAuth, requireRole(...READ), validate(idParam, 'params'), async (req, res, next) => {
    try {
      const it = await itemOf(req);
      if (!it) return notFound(res);
      const versions = await tx(req, db, (t) => t.evidenceItem.findMany({ where: { engagement_id: eid(req) }, omit: { content: true } }));
      const chain = versions.filter((v: { id: string; supersedes_id: string | null }) => v.id === it.supersedes_id || v.supersedes_id === it.id).map(strip);
      res.json({ ...strip(it), related_versions: chain });
    } catch (e) { next(e); }
  });

  r.get('/items/:id/content', bearerAuth, requireRole(...READ), validate(idParam, 'params'), async (req, res, next) => {
    try {
      const it = await itemOf(req);
      if (!it) return notFound(res);
      if (!it.content) return conflict(res, 'No stored content (external link)', 'NO_CONTENT');
      await audit(db, { action: 'evidence.download', actor: user(req), target_type: 'evidence_item', target_id: it.id, tenant_id: user(req).tenant_id, detail: { file_name: it.file_name, classification: it.classification } });
      res.setHeader('Content-Type', it.content_type ?? 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${(it.file_name ?? 'evidence').replace(/"/g, '')}"`);
      res.send(Buffer.from(it.content));
    } catch (e) { next(e); }
  });

  r.patch('/items/:id', bearerAuth, requireRole(...WRITE), validate(idParam, 'params'), validate(itemPatch), async (req, res, next) => {
    try {
      const it = await itemOf(req);
      if (!it) return notFound(res);
      if (it.status === 'validated' || it.status === 'archived') return conflict(res, 'A validated or archived item is immutable — create a new version', 'IMMUTABLE');
      const body = req.body as z.infer<typeof itemPatch>;
      delete (body as { definition_id?: unknown }).definition_id; // metadata.definition_id is set at creation only
      const cat = await catalogue();
      const merged = { ...it, ...body, collected_at: body.collected_at ? new Date(body.collected_at) : it.collected_at };
      const report = validateEvidence(merged, cat);
      const row = await tx(req, db, (t) => t.evidenceItem.update({ where: { id: it.id }, data: { ...body, ...(body.collected_at ? { collected_at: new Date(body.collected_at) } : {}), validation: report, status: it.status === 'rejected' ? 'draft' : it.status, updated_at: new Date() } }));
      await audit(db, { action: 'evidence.update', actor: user(req), target_type: 'evidence_item', target_id: it.id, tenant_id: user(req).tenant_id, detail: { fields: Object.keys(body) } });
      res.json(strip(row));
    } catch (e) { next(e); }
  });

  r.post('/items/:id/validate', bearerAuth, requireRole(...WRITE), validate(idParam, 'params'), async (req, res, next) => {
    try {
      const it = await itemOf(req);
      if (!it) return notFound(res);
      const report: ValidationReport = validateEvidence(it, await catalogue());
      const row = await tx(req, db, (t) => t.evidenceItem.update({ where: { id: it.id }, data: { validation: report, updated_at: new Date() } }));
      res.json({ item: strip(row), validation: report });
    } catch (e) { next(e); }
  });

  r.post('/items/:id/submit', bearerAuth, requireRole(...WRITE), validate(idParam, 'params'), async (req, res, next) => {
    try {
      const it = await itemOf(req);
      if (!it) return notFound(res);
      if (it.status !== 'draft' && it.status !== 'rejected') return conflict(res, `Item is ${it.status}`, 'NOT_DRAFT');
      const report = validateEvidence(it, await catalogue());
      if (!report.passed) { res.status(422).json({ error: 'Blocking checks fail — fix them before submitting for review', code: 'VALIDATION_FAILED', validation: report }); return; }
      const row = await tx(req, db, (t) => t.evidenceItem.update({ where: { id: it.id }, data: { status: 'submitted', validation: report, updated_at: new Date() } }));
      await tx(req, db, (t) => t.evidenceRequest.updateMany({ where: { engagement_id: eid(req), evidence_item_id: it.id, status: 'open' }, data: { status: 'submitted', updated_at: new Date() } }));
      await audit(db, { action: 'evidence.submit', actor: user(req), target_type: 'evidence_item', target_id: it.id, tenant_id: user(req).tenant_id, detail: { strength: report.strength } }, { strict: true });
      res.json(strip(row));
    } catch (e) { next(e); }
  });

  /** SoD: a reviewer can never review a document they uploaded (SOD_RULES). */
  r.post('/items/:id/review', bearerAuth, requireRole(...REVIEW), validate(idParam, 'params'), validate(reviewSchema), async (req, res, next) => {
    try {
      const it = await itemOf(req);
      if (!it) return notFound(res);
      if (!isReviewer(req)) { res.status(403).json({ error: 'Evidence is approved by an evidence reviewer or BHD', code: 'NOT_REVIEWER' }); return; }
      if (it.status !== 'submitted') return conflict(res, `Item is ${it.status}, not submitted`, 'NOT_SUBMITTED');
      if (it.created_by === user(req).sub) return conflict(res, 'Separation of duties: you submitted this evidence, another person must review it', 'SOD_SAME_PERSON');
      const body = req.body as z.infer<typeof reviewSchema>;
      const approved = body.decision === 'approve';
      const base = { reviewed_by: user(req).sub, reviewed_at: new Date(), review_notes: body.notes, updated_at: new Date() };
      const reportAfter = approved ? validateEvidence({ ...it, ...base, status: 'validated' }, await catalogue()) : it.validation;
      const row = await tx(req, db, (t) => t.evidenceItem.update({ where: { id: it.id }, data: { ...base, status: approved ? 'validated' : 'rejected', validation: reportAfter } }));
      if (approved) await tx(req, db, (t) => t.evidenceRequest.updateMany({ where: { engagement_id: eid(req), evidence_item_id: it.id }, data: { status: 'fulfilled', updated_at: new Date() } }));
      await audit(db, { action: approved ? 'evidence.approve' : 'evidence.reject', actor: user(req), target_type: 'evidence_item', target_id: it.id, tenant_id: user(req).tenant_id, detail: { submitted_by: it.created_by, notes: body.notes } }, { strict: true });
      res.json(strip(row));
    } catch (e) { next(e); }
  });

  r.post('/items/:id/new-version', bearerAuth, requireRole(...WRITE), validate(idParam, 'params'), validate(itemSchema.partial()), async (req, res, next) => {
    try {
      const it = await itemOf(req);
      if (!it) return notFound(res);
      const body = req.body as Partial<z.infer<typeof itemSchema>>;
      const merged = itemSchema.parse({ ...strip(it), ...body, requirement_ids: body.requirement_ids ?? it.requirement_ids, collected_at: body.collected_at ?? new Date().toISOString(), period_start: body.period_start ? body.period_start.toISOString().slice(0, 10) : it.period_start ? new Date(it.period_start).toISOString().slice(0, 10) : null, period_end: body.period_end ? body.period_end.toISOString().slice(0, 10) : it.period_end ? new Date(it.period_end).toISOString().slice(0, 10) : null, retention_until: body.retention_until ? body.retention_until.toISOString().slice(0, 10) : it.retention_until ? new Date(it.retention_until).toISOString().slice(0, 10) : null });
      const row = await createItem(req, merged, { version: (it.version ?? 1) + 1, supersedes_id: it.id });
      await tx(req, db, (t) => t.evidenceItem.update({ where: { id: it.id }, data: { status: 'archived', updated_at: new Date() } }));
      await audit(db, { action: 'evidence.new_version', actor: user(req), target_type: 'evidence_item', target_id: row.id, tenant_id: user(req).tenant_id, detail: { supersedes: it.id, version: row.version } });
      res.status(201).json(strip(row));
    } catch (e) { next(e); }
  });

  r.post('/items/:id/archive', bearerAuth, requireRole(...WRITE), validate(idParam, 'params'), async (req, res, next) => {
    try {
      const it = await itemOf(req);
      if (!it) return notFound(res);
      const row = await tx(req, db, (t) => t.evidenceItem.update({ where: { id: it.id }, data: { status: 'archived', updated_at: new Date() } }));
      await audit(db, { action: 'evidence.archive', actor: user(req), target_type: 'evidence_item', target_id: it.id, tenant_id: user(req).tenant_id }, { strict: true });
      res.json(strip(row));
    } catch (e) { next(e); }
  });

  // ---------------------------------------------------------------- requests
  r.get('/requests', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const rows = await tx(req, db, (t) => t.evidenceRequest.findMany({ where: { engagement_id: eid(req) } }));
      rows.sort((a: { due_date: Date | null }, b: { due_date: Date | null }) => (a.due_date ? +new Date(a.due_date) : 9e15) - (b.due_date ? +new Date(b.due_date) : 9e15));
      res.json(rows);
    } catch (e) { next(e); }
  });

  r.post('/requests', bearerAuth, requireRole(...WRITE), validate(requestSchema), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const row = await tx(req, db, (t) => t.evidenceRequest.create({ data: { ...(req.body as object), tenant_id: user(req).tenant_id, engagement_id: eid(req), created_by: user(req).sub } }));
      await audit(db, { action: 'evidence.request.create', actor: user(req), target_type: 'evidence_request', target_id: row.id, tenant_id: user(req).tenant_id, detail: { requirement_id: row.requirement_id } });
      res.status(201).json(row);
    } catch (e) { next(e); }
  });

  /** One request per (requirement, required archetype) that has no validated/pending evidence and no open request. */
  r.post('/requests/generate', bearerAuth, requireRole(...WRITE), validate(generateSchema), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const body = req.body as z.infer<typeof generateSchema>;
      let reqIds = body.requirement_ids ?? CONTROL_REFS.map((c) => c.control_id);
      if (body.only_gaps_of_run) {
        const results = await tx(req, db, (t) => t.assessmentResult.findMany({ where: { run_id: body.only_gaps_of_run } }));
        const gaps = new Set(results.filter((x: { status: string }) => x.status !== 'met').map((x: { requirement_id: string }) => x.requirement_id));
        reqIds = reqIds.filter((id) => gaps.has(id));
      }
      const [cat, items, existing] = await Promise.all([catalogue(), tx(req, db, (t) => t.evidenceItem.findMany({ where: { engagement_id: eid(req) }, omit: { content: true } })), tx(req, db, (t) => t.evidenceRequest.findMany({ where: { engagement_id: eid(req) } }))]);
      const open = new Set(existing.filter((q: { status: string }) => q.status === 'open' || q.status === 'submitted').map((q: { requirement_id: string; archetype_code: string | null }) => `${q.requirement_id}|${q.archetype_code}`));
      const created: unknown[] = [];
      for (const c of coverage(reqIds.filter((id) => REQ_IDS.has(id)), cat, items)) {
        for (const a of c.missing) {
          if (open.has(`${c.requirement_id}|${a}`)) continue;
          const arch = cat.archetypes.find((x) => x.code === a);
          const row = await tx(req, db, (t) => t.evidenceRequest.create({ data: { tenant_id: user(req).tenant_id, engagement_id: eid(req), requirement_id: c.requirement_id, archetype_code: a, title: `${c.requirement_id}: provide ${arch?.name ?? a}`, instructions: arch ? `Acceptable forms: ${arch.acceptable_forms.join('; ')}` : null, assignee: body.assignee ?? null, due_date: body.due_date ?? null, status: 'open', created_by: user(req).sub } }));
          created.push(row);
        }
      }
      await audit(db, { action: 'evidence.requests.generate', actor: user(req), target_type: 'engagement', target_id: eid(req), tenant_id: user(req).tenant_id, detail: { created: created.length, run_id: body.only_gaps_of_run ?? null } });
      res.status(201).json({ created: created.length, requests: created });
    } catch (e) { next(e); }
  });

  r.patch('/requests/:id', bearerAuth, requireRole(...WRITE), validate(idParam, 'params'), validate(requestPatch), async (req, res, next) => {
    try {
      const q = await tx(req, db, (t) => t.evidenceRequest.findUnique({ where: { id: req.params.id } }));
      if (!q || q.engagement_id !== eid(req) || q.tenant_id !== user(req).tenant_id) return notFound(res);
      const row = await tx(req, db, (t) => t.evidenceRequest.update({ where: { id: q.id }, data: { ...(req.body as object), updated_at: new Date() } }));
      await audit(db, { action: 'evidence.request.update', actor: user(req), target_type: 'evidence_request', target_id: q.id, tenant_id: user(req).tenant_id, detail: { fields: Object.keys(req.body as object) } });
      res.json(row);
    } catch (e) { next(e); }
  });

  return r;
}
