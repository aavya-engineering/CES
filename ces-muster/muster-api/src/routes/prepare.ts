// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// prepare.ts — Sprint 6 slice "Prepare for Assessment" (2026-11-10).
//
//   GET  /api/engagements/:engagementId/prepare/readiness            checklist (computed) + outstanding items
//   GET  /api/engagements/:engagementId/prepare/ssp/statements        110 rows (statement or empty) with the latest run status and validated evidence
//   PUT  /api/engagements/:engagementId/prepare/ssp/statements/:requirementId   upsert (version++)
//   POST /api/engagements/:engagementId/prepare/ssp/statements/generate-drafts  drafts for requirements without a statement, from run + evidence (marked generated_draft)
//   POST /api/engagements/:engagementId/prepare/ssp/statements/:requirementId/approve
//   GET  /api/engagements/:engagementId/prepare/ssp/export?format=json|md        the SSP document (org, boundary, scope, statements, POA&M summary, SPRS)
//   GET  /api/engagements/:engagementId/prepare/packages ; POST (build) ; GET /:id ; POST /:id/validate ; POST /:id/sign-off ; GET /:id/export
//   GET  /api/engagements/:engagementId/prepare/assessor/overview      read-only per-requirement view for the C3PAO
//   GET/POST /api/engagements/:engagementId/prepare/assessor/requests ; POST /:id/answer ; POST /:id/close
//   GET/POST /api/engagements/:engagementId/prepare/sign-offs
//   GET  /api/engagements/:engagementId/prepare/reports/:kind?format=json|csv|md   readiness | coverage | gaps | sprs | poam | evidence-inventory
//
// Roles: read = all engagement roles (the assessor included); write = prime |
// sub | bhd_operator; sign-off = senior_approver (assessor_read_only-inheriting)
// or compliance_manager (prime) or BHD, never the package builder (SoD);
// assessor requests are created by assessor_read_only-inheriting roles and BHD.

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { bearerAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { withTenant } from '../lib/prisma.js';
import { audit } from '../lib/audit.js';
import { CONTROL_REFS, FAMILY_NAMES } from './assessments.js';
import { coverage, type Catalogue } from '../services/evidenceValidation.js';
import { poamAllowed } from './planActions.js';

const READ = ['prime', 'bhd_operator', 'assessor_read_only', 'sub'] as const;
const WRITE = ['prime', 'sub', 'bhd_operator'] as const;
const SIGN = ['prime', 'bhd_operator', 'assessor_read_only'] as const; // narrowed below
const ASK = ['assessor_read_only', 'bhd_operator'] as const; // the C3PAO (and evidence_reviewer / senior_approver by inheritance) asks; BHD may log on their behalf

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
const user = (req: Request) => req.user!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tx = (req: Request, db: Db, fn: (t: Db) => Promise<any>): Promise<any> => withTenant(user(req).tenant_id, fn, db);
const notFound = (res: Response) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
const conflict = (res: Response, error: string, code: string) => res.status(409).json({ error, code });
const PRACTICE = new Map(CONTROL_REFS.map((c) => [c.control_id, c.practice]));
const REQ_IDS = CONTROL_REFS.map((c) => c.control_id);
const reqId = z.string().trim().regex(/^[A-Z]{2}\.L[123]-\d+\.\d+\.\d+$/);

export const IMPL_STATUSES = ['implemented', 'partially_implemented', 'planned', 'alternative', 'not_applicable'] as const;
const statementSchema = z.object({
  status: z.enum(IMPL_STATUSES),
  statement: z.string().trim().max(8000).default(''),
  responsible_role: z.string().trim().max(200).optional().nullable(),
  systems: z.array(z.string().trim().max(200)).max(50).default([]),
  evidence_item_ids: z.array(z.string().uuid()).max(100).default([]),
});
const packageSchema = z.object({
  name: z.string().trim().min(3).max(200),
  scope_type: z.enum(['all', 'requirement', 'family', 'objective']).default('all'),
  scope_values: z.array(z.string().trim().max(60)).max(120).default([]),
  include_unvalidated: z.boolean().default(false),
  run_id: z.string().uuid().optional().nullable(),
  supersedes_id: z.string().uuid().optional().nullable(),
});
const signSchema = z.object({ notes: z.string().trim().min(5).max(4000) });
const askSchema = z.object({ question: z.string().trim().min(5).max(4000), requirement_id: reqId.optional().nullable(), package_id: z.string().uuid().optional().nullable() });
const answerSchema = z.object({ answer: z.string().trim().min(2).max(8000), evidence_item_ids: z.array(z.string().uuid()).max(50).default([]) });
const signOffSchema = z.object({ kind: z.enum(['internal_review', 'evidence_completeness', 'gap_closure', 'package', 'final']), decision: z.enum(['approved', 'rejected']), notes: z.string().trim().min(5).max(4000), package_id: z.string().uuid().optional().nullable(), run_id: z.string().uuid().optional().nullable() });
const idParam = z.object({ id: z.string().uuid() }).passthrough();
const reqParam = z.object({ requirementId: reqId }).passthrough();
const fmtQuery = z.object({ format: z.enum(['json', 'md', 'csv']).default('json') });

const byDesc = (k: string) => (a: Record<string, Date | string>, b: Record<string, Date | string>) => +new Date(b[k]) - +new Date(a[k]);
const csv = (head: string[], rows: unknown[][]) => [head.join(','), ...rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');

export function createPrepareRouter(db: Db) {
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
  const isSigner = (req: Request) => ['senior_approver', 'compliance_manager', 'bhd_operator'].includes(user(req).role);

  /** Everything the readiness checklist, the SSP and the reports draw on. */
  async function gather(req: Request) {
    const e = eid(req);
    const [runs, statements, evidence, poam, actions, boundaries, assets, orgs, tenants, packages, findings, signoffs, cat] = await Promise.all([
      tx(req, db, (t) => t.assessmentRun.findMany({ where: { engagement_id: e } })),
      tx(req, db, (t) => t.implementationStatement.findMany({ where: { engagement_id: e } })),
      tx(req, db, (t) => t.evidenceItem.findMany({ where: { engagement_id: e } })),
      tx(req, db, (t) => t.poamItem.findMany({ where: { engagement_id: e } })),
      tx(req, db, (t) => t.planAction.findMany({ where: { engagement_id: e } })),
      tx(req, db, (t) => t.scopeBoundary.findMany({ where: { engagement_id: e } })),
      tx(req, db, (t) => t.scopeAsset.findMany({ where: { engagement_id: e } })),
      tx(req, db, (t) => t.organization.findMany({ where: { tenant_id: user(req).tenant_id } })),
      tx(req, db, (t) => t.customerTenant.findMany({ where: { tenant_id: user(req).tenant_id } })),
      tx(req, db, (t) => t.evidencePackage.findMany({ where: { engagement_id: e } })),
      tx(req, db, (t) => t.monitorFinding.findMany({ where: { engagement_id: e } })),
      tx(req, db, (t) => t.assessmentSignOff.findMany({ where: { engagement_id: e } })),
      catalogue(),
    ]);
    runs.sort(byDesc('created_at'));
    const latest = runs[0] ?? null;
    const results = latest ? await tx(req, db, (t) => t.assessmentResult.findMany({ where: { run_id: latest.id } })) : [];
    const cov = coverage(REQ_IDS, cat, evidence);
    return { latest, results, statements, evidence, poam, actions, boundaries, assets, orgs, tenants, packages, findings, signoffs, cat, cov };
  }

  function checklist(g: Awaited<ReturnType<typeof gather>>) {
    const now = Date.now();
    const resultBy = new Map(g.results.map((x: { requirement_id: string; status: string }) => [x.requirement_id, x.status]));
    const stmtBy = new Map<string, { statement: string; approved_by: string | null }>(g.statements.map((s: { requirement_id: string; statement: string; approved_by: string | null }) => [s.requirement_id, s]));
    const missingStatements = REQ_IDS.filter((id) => !(stmtBy.get(id)?.statement ?? '').trim());
    const unapproved = g.statements.filter((s: { approved_by: string | null; statement: string }) => s.statement.trim() && !s.approved_by).length;
    const confirmed = g.boundaries.find((b: { status: string }) => b.status === 'confirmed');
    const openGaps = g.results.filter((x: { status: string }) => x.status !== 'met');
    const ineligiblePoam = g.poam.filter((p: { status: string; poam_allowed: boolean }) => (p.status === 'open' || p.status === 'ongoing') && !p.poam_allowed);
    const openActions = g.actions.filter((a: { status: string }) => a.status !== 'done' && a.status !== 'wont_fix');
    const overdue = openActions.filter((a: { due_date: Date | null }) => a.due_date && +new Date(a.due_date) < now);
    const pendingReview = g.evidence.filter((e: { status: string }) => e.status === 'submitted');
    const missingCov = g.cov.filter((c) => c.state === 'missing');
    const criticalOpen = g.findings.filter((f: { status: string; severity: string }) => f.status !== 'resolved' && (f.severity === 'critical' || f.severity === 'high'));
    const signedPkg = g.packages.filter((p: { status: string }) => p.status === 'signed_off');
    const finalSign = g.signoffs.filter((s: { kind: string; decision: string }) => s.kind === 'final' && s.decision === 'approved');
    const sspStatus = resultBy.get('CA.L2-3.12.4');
    const items = [
      { id: 'org', label: 'Organisation profile recorded (legal name, UEI, CAGE)', ok: g.orgs.some((o: { uei: string | null; cage: string | null }) => o.uei && o.cage), count: g.orgs.length, route: 'onboard/organizations' },
      { id: 'boundary', label: 'CUI boundary confirmed by a person', ok: !!confirmed, count: g.boundaries.length, route: 'onboard/scope' },
      { id: 'scope', label: 'Scope assets categorised', ok: g.assets.length > 0, count: g.assets.length, route: 'onboard/scope' },
      { id: 'run', label: 'Assessment run within 90 days', ok: !!g.latest && now - +new Date(g.latest.created_at) < 90 * 86_400_000, count: g.latest?.sprs_now ?? null, route: 'assess/readiness' },
      { id: 'ssp_control', label: 'System Security Plan requirement (CA.L2-3.12.4) assessed Met', ok: sspStatus === 'met', count: sspStatus ?? 'not assessed', route: 'assess/gaps' },
      { id: 'statements', label: 'Implementation statement for all 110 requirements', ok: missingStatements.length === 0, count: 110 - missingStatements.length, route: 'prepare/ssp' },
      { id: 'statements_approved', label: 'Every statement approved by its owner', ok: unapproved === 0 && missingStatements.length === 0, count: unapproved, route: 'prepare/ssp' },
      { id: 'gaps', label: 'No open Not-met / Partial requirement, or each one on an eligible POA&M', ok: openGaps.every((x: { requirement_id: string }) => poamAllowed(x.requirement_id) && g.poam.some((p: { requirement_id: string; status: string }) => p.requirement_id === x.requirement_id && p.status !== 'completed')), count: openGaps.length, route: 'assess/gaps' },
      { id: 'poam', label: 'POA&M carries only eligible (1-point, non-prohibited) items', ok: ineligiblePoam.length === 0, count: ineligiblePoam.length, route: 'plan/poam' },
      { id: 'actions', label: 'No overdue remediation action', ok: overdue.length === 0, count: overdue.length, route: 'plan/actions' },
      { id: 'coverage', label: 'Required evidence present for every requirement', ok: missingCov.length === 0, count: missingCov.length, route: 'evidence/overview' },
      { id: 'review', label: 'No evidence waiting for review', ok: pendingReview.length === 0, count: pendingReview.length, route: 'evidence/explorer' },
      { id: 'findings', label: 'No open critical / high monitoring finding', ok: criticalOpen.length === 0, count: criticalOpen.length, route: 'monitor/findings' },
      { id: 'package', label: 'A signed-off evidence package exists', ok: signedPkg.length > 0, count: signedPkg.length, route: 'prepare/packages' },
      { id: 'final', label: 'Final internal sign-off recorded', ok: finalSign.length > 0, count: finalSign.length, route: 'prepare/overview' },
    ];
    return { items, ready: items.every((i) => i.ok), score: Math.round((items.filter((i) => i.ok).length / items.length) * 100), outstanding: { missing_statements: missingStatements.slice(0, 200), open_gaps: openGaps.map((x: { requirement_id: string; status: string; weight: number }) => ({ requirement_id: x.requirement_id, status: x.status, weight: x.weight })), ineligible_poam: ineligiblePoam.map((p: { requirement_id: string }) => p.requirement_id), overdue_actions: overdue.map((a: { id: string; title: string; due_date: Date }) => ({ id: a.id, title: a.title, due_date: a.due_date })), missing_coverage: missingCov.map((c) => ({ requirement_id: c.requirement_id, missing: c.missing })), pending_review: pendingReview.length, critical_findings: criticalOpen.map((f: { id: string; title: string; severity: string }) => ({ id: f.id, title: f.title, severity: f.severity })) } };
  }

  // ---------------------------------------------------------------- readiness
  r.get('/readiness', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try { if (!(await engagementOf(req))) return notFound(res); res.json(checklist(await gather(req))); } catch (e) { next(e); }
  });

  // ---------------------------------------------------------------- SSP statements
  r.get('/ssp/statements', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const g = await gather(req);
      const resultBy = new Map(g.results.map((x: { requirement_id: string; status: string; weight: number }) => [x.requirement_id, x]));
      const stmtBy = new Map(g.statements.map((s: { requirement_id: string }) => [s.requirement_id, s]));
      const validatedBy = new Map<string, { id: string; title: string; archetype_code: string | null }[]>();
      for (const ev of g.evidence as { id: string; title: string; archetype_code: string | null; requirement_ids: string[]; status: string }[]) if (ev.status === 'validated') for (const rid of ev.requirement_ids) validatedBy.set(rid, [...(validatedBy.get(rid) ?? []), { id: ev.id, title: ev.title, archetype_code: ev.archetype_code }]);
      res.json(CONTROL_REFS.map((c) => ({ requirement_id: c.control_id, family: c.family, family_name: FAMILY_NAMES[c.family] ?? c.family, practice: c.practice, cmmc_level: c.cmmc_level, run_status: (resultBy.get(c.control_id) as { status: string } | undefined)?.status ?? null, weight: (resultBy.get(c.control_id) as { weight: number } | undefined)?.weight ?? null, validated_evidence: validatedBy.get(c.control_id) ?? [], statement: stmtBy.get(c.control_id) ?? null })));
    } catch (e) { next(e); }
  });

  r.put('/ssp/statements/:requirementId', bearerAuth, requireRole(...WRITE), validate(reqParam, 'params'), validate(statementSchema), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const rid = (req.params as { requirementId: string }).requirementId;
      if (!REQ_IDS.includes(rid)) { res.status(422).json({ error: 'Not one of the 110 requirements', code: 'VALIDATION_ERROR', part: 'params', details: [{ path: 'requirementId', message: 'unknown' }] }); return; }
      const body = req.body as z.infer<typeof statementSchema>;
      const cur = (await tx(req, db, (t) => t.implementationStatement.findMany({ where: { engagement_id: eid(req), requirement_id: rid } })))[0];
      const row = cur
        ? await tx(req, db, (t) => t.implementationStatement.update({ where: { id: cur.id }, data: { ...body, source: 'manual', version: (cur.version ?? 1) + 1, approved_by: null, approved_at: null, updated_by: user(req).sub, updated_at: new Date() } }))
        : await tx(req, db, (t) => t.implementationStatement.create({ data: { ...body, tenant_id: user(req).tenant_id, engagement_id: eid(req), requirement_id: rid, source: 'manual', version: 1, updated_by: user(req).sub } }));
      await audit(db, { action: 'ssp.statement.save', actor: user(req), target_type: 'implementation_statement', target_id: row.id, tenant_id: user(req).tenant_id, detail: { requirement_id: rid, status: body.status, version: row.version } });
      res.json(row);
    } catch (e) { next(e); }
  });

  /** Drafts for requirements without a statement — from the latest run status and validated evidence. Always marked generated_draft; a person edits and approves. */
  r.post('/ssp/statements/generate-drafts', bearerAuth, requireRole(...WRITE), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const g = await gather(req);
      const have = new Set(g.statements.map((s: { requirement_id: string }) => s.requirement_id));
      const resultBy = new Map(g.results.map((x: { requirement_id: string; status: string }) => [x.requirement_id, x.status]));
      const actionBy = new Map((g.actions as { requirement_id: string | null; title: string; due_date: Date | null; status: string }[]).filter((a) => a.requirement_id && a.status !== 'done' && a.status !== 'wont_fix').map((a) => [a.requirement_id as string, a]));
      let created = 0;
      for (const c of CONTROL_REFS) {
        if (have.has(c.control_id)) continue;
        const rs = resultBy.get(c.control_id);
        const ev = (g.evidence as { id: string; title: string; requirement_ids: string[]; status: string }[]).filter((e) => e.status === 'validated' && e.requirement_ids.includes(c.control_id));
        const status = rs === 'met' ? 'implemented' : rs === 'partial' ? 'partially_implemented' : 'planned';
        const action = actionBy.get(c.control_id);
        const statement = [
          `${c.practice}`,
          rs === 'met' ? `The organisation implements this requirement; the most recent assessment run found it Met.` : rs === 'partial' ? `The requirement is partially implemented; the most recent assessment run found it Partial.` : rs === 'not_met' ? `The requirement is not yet implemented; the most recent assessment run found it Not met.` : `The requirement has not been assessed by a run yet.`,
          ev.length ? `Evidence: ${ev.map((e) => e.title).join('; ')}.` : 'Evidence: none validated yet.',
          action ? `Planned action: ${action.title}${action.due_date ? ` (due ${new Date(action.due_date).toISOString().slice(0, 10)})` : ''}.` : '',
          '[DRAFT — describe how, where and by whom this is implemented in your environment, then approve.]',
        ].filter(Boolean).join(' ');
        await tx(req, db, (t) => t.implementationStatement.create({ data: { tenant_id: user(req).tenant_id, engagement_id: eid(req), requirement_id: c.control_id, status, statement, evidence_item_ids: ev.map((e) => e.id), source: 'generated_draft', version: 1, updated_by: user(req).sub } }));
        created++;
      }
      await audit(db, { action: 'ssp.statements.generate', actor: user(req), target_type: 'engagement', target_id: eid(req), tenant_id: user(req).tenant_id, detail: { created } });
      res.status(201).json({ created });
    } catch (e) { next(e); }
  });

  r.post('/ssp/statements/:requirementId/approve', bearerAuth, requireRole(...WRITE), validate(reqParam, 'params'), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const rid = (req.params as { requirementId: string }).requirementId;
      const cur = (await tx(req, db, (t) => t.implementationStatement.findMany({ where: { engagement_id: eid(req), requirement_id: rid } })))[0];
      if (!cur) return notFound(res);
      if (!cur.statement.trim() || cur.statement.includes('[DRAFT')) return conflict(res, 'Edit the draft marker out of the statement before approving', 'STATEMENT_IS_DRAFT');
      const row = await tx(req, db, (t) => t.implementationStatement.update({ where: { id: cur.id }, data: { approved_by: user(req).sub, approved_at: new Date(), source: 'manual', updated_at: new Date() } }));
      await audit(db, { action: 'ssp.statement.approve', actor: user(req), target_type: 'implementation_statement', target_id: cur.id, tenant_id: user(req).tenant_id, detail: { requirement_id: rid } }, { strict: true });
      res.json(row);
    } catch (e) { next(e); }
  });

  r.get('/ssp/export', bearerAuth, requireRole(...READ), validate(fmtQuery, 'query'), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const g = await gather(req);
      const org = g.orgs[0] ?? null;
      const confirmed = g.boundaries.find((b: { status: string }) => b.status === 'confirmed') ?? null;
      const stmtBy = new Map(g.statements.map((s: { requirement_id: string }) => [s.requirement_id, s]));
      const doc = {
        title: 'System Security Plan (CMMC Level 2 / NIST SP 800-171)', generated_at: new Date().toISOString(), engagement_id: eid(req),
        organisation: org ? { legal_name: org.legal_name, dba_name: org.dba_name, uei: org.uei, cage: org.cage, address: org.address, contract_clauses: org.contract_clauses, primary_contact: org.primary_contact_name } : null,
        tenants: g.tenants.map((t: { display_name: string; cloud: string; primary_domain: string | null }) => ({ display_name: t.display_name, cloud: t.cloud, primary_domain: t.primary_domain })),
        boundary: confirmed ? { version: confirmed.version, confirmed_by: confirmed.confirmed_by, confirmed_at: confirmed.confirmed_at, narrative: confirmed.narrative, data_flows: confirmed.data_flows, asset_count: confirmed.asset_count } : null,
        assets: g.assets.map((a: { name: string; asset_type: string; category: string; location: string | null; owner: string | null; external_provider: boolean }) => ({ name: a.name, type: a.asset_type, category: a.category, location: a.location, owner: a.owner, external_provider: a.external_provider })),
        sprs: g.latest ? { score: g.latest.sprs_now, assessed_at: g.latest.created_at, met: g.latest.met_count, partial: g.latest.partial_count, not_met: g.latest.not_met_count, unknown: g.latest.unknown_count } : null,
        requirements: CONTROL_REFS.map((c) => { const s = stmtBy.get(c.control_id) as { status: string; statement: string; responsible_role: string | null; systems: string[]; approved_by: string | null; approved_at: Date | null } | undefined; return { requirement_id: c.control_id, family: FAMILY_NAMES[c.family] ?? c.family, level: c.cmmc_level, practice: c.practice, implementation_status: s?.status ?? 'planned', statement: s?.statement ?? '', responsible_role: s?.responsible_role ?? null, systems: s?.systems ?? [], approved: !!s?.approved_by }; }),
        poam: g.poam.filter((p: { status: string }) => p.status !== 'completed').map((p: { requirement_id: string; weakness: string; mitigation: string | null; scheduled_completion: Date | null; responsible: string | null; status: string; poam_allowed: boolean }) => ({ requirement_id: p.requirement_id, weakness: p.weakness, mitigation: p.mitigation, scheduled_completion: p.scheduled_completion, responsible: p.responsible, status: p.status, eligible: p.poam_allowed })),
      };
      await audit(db, { action: 'ssp.export', actor: user(req), target_type: 'engagement', target_id: eid(req), tenant_id: user(req).tenant_id, detail: { format: (req.query as { format: string }).format } });
      if ((req.query as { format: string }).format === 'md') {
        const md: string[] = [`# ${doc.title}`, '', `Generated ${doc.generated_at}`, ''];
        if (doc.organisation) md.push('## 1. Organisation', '', `- Legal name: ${doc.organisation.legal_name}`, `- UEI: ${doc.organisation.uei ?? '—'} · CAGE: ${doc.organisation.cage ?? '—'}`, `- Contract clauses: ${(doc.organisation.contract_clauses ?? []).join(', ') || '—'}`, '');
        md.push('## 2. System boundary', '', doc.boundary ? `Boundary v${doc.boundary.version}, confirmed by ${doc.boundary.confirmed_by} on ${doc.boundary.confirmed_at}.\n\n${doc.boundary.narrative ?? ''}` : '_No confirmed boundary._', '', '### Assets', '', '| Asset | Type | Category | Location | Owner | ESP |', '|---|---|---|---|---|---|', ...doc.assets.map((a: { name: string; type: string; category: string; location: string | null; owner: string | null; external_provider: boolean }) => `| ${a.name} | ${a.type} | ${a.category} | ${a.location ?? ''} | ${a.owner ?? ''} | ${a.external_provider ? 'yes' : ''} |`), '');
        md.push('## 3. SPRS position', '', doc.sprs ? `Score **${doc.sprs.score}** (assessed ${doc.sprs.assessed_at}) — Met ${doc.sprs.met}, Partial ${doc.sprs.partial}, Not met ${doc.sprs.not_met}, Unknown ${doc.sprs.unknown}.` : '_No assessment run._', '');
        md.push('## 4. Requirement implementation statements', '');
        let fam = '';
        for (const q of doc.requirements) { if (q.family !== fam) { fam = q.family; md.push(`### ${fam}`, ''); } md.push(`#### ${q.requirement_id} (L${q.level}) — ${q.implementation_status.replace('_', ' ')}${q.approved ? ' ✓' : ''}`, '', `> ${q.practice}`, '', q.statement || '_No statement yet._', q.responsible_role ? `\nResponsible: ${q.responsible_role}` : '', q.systems.length ? `Systems: ${q.systems.join(', ')}` : '', ''); }
        md.push('## 5. Plan of Action & Milestones', '', doc.poam.length ? '| Requirement | Weakness | Mitigation | Scheduled | Responsible | Status | Eligible |\n|---|---|---|---|---|---|---|' : '_No open POA&M item._', ...doc.poam.map((p: { requirement_id: string; weakness: string; mitigation: string | null; scheduled_completion: Date | null; responsible: string | null; status: string; eligible: boolean }) => `| ${p.requirement_id} | ${p.weakness} | ${p.mitigation ?? ''} | ${p.scheduled_completion ? new Date(p.scheduled_completion).toISOString().slice(0, 10) : ''} | ${p.responsible ?? ''} | ${p.status} | ${p.eligible ? 'yes' : 'NO'} |`));
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="ssp.md"');
        res.send(md.join('\n'));
        return;
      }
      res.json(doc);
    } catch (e) { next(e); }
  });

  // ---------------------------------------------------------------- packages
  function buildManifest(items: Record<string, unknown>[], cat: Catalogue, scope: { type: string; values: string[] }) {
    const inScope = (i: { requirement_ids: string[]; objective_ids: string[] }) => scope.type === 'all' || (scope.type === 'requirement' && i.requirement_ids.some((x) => scope.values.includes(x))) || (scope.type === 'family' && i.requirement_ids.some((x) => scope.values.includes(x.slice(0, 2)))) || (scope.type === 'objective' && i.objective_ids.some((x) => scope.values.includes(x)));
    const picked = items.filter((i) => inScope(i as never) && (i.status as string) !== 'archived');
    const reqs = scope.type === 'requirement' ? scope.values : scope.type === 'family' ? REQ_IDS.filter((x) => scope.values.includes(x.slice(0, 2))) : REQ_IDS;
    const cov = coverage(reqs, cat, picked as never);
    const manifest = { built_at: new Date().toISOString(), scope, requirement_count: reqs.length, items: picked.map((i) => ({ id: i.id, title: i.title, requirement_ids: i.requirement_ids, objective_ids: i.objective_ids, archetype_code: i.archetype_code, form: i.form, kind: i.kind, source: i.source, file_name: i.file_name, content_type: i.content_type, size_bytes: i.size_bytes, sha256: i.sha256, status: i.status, strength: (i.validation as { strength?: string } | null)?.strength ?? null, collected_at: i.collected_at, reviewed_by: i.reviewed_by, version: i.version, classification: i.classification })) };
    const validation = { passed: cov.every((c) => c.state !== 'missing' && c.state !== 'partial') && picked.every((i) => i.status === 'validated'), missing_required: cov.filter((c) => c.state === 'missing' || c.state === 'partial').map((c) => ({ requirement_id: c.requirement_id, missing: c.missing, pending: c.pending })), unvalidated: picked.filter((i) => i.status !== 'validated').map((i) => ({ id: i.id, title: i.title, status: i.status })), expired: picked.filter((i) => i.status === 'expired').length, cui_items: picked.filter((i) => i.classification === 'cui').length };
    return { manifest, validation, picked };
  }

  r.get('/packages', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const rows = await tx(req, db, (t) => t.evidencePackage.findMany({ where: { engagement_id: eid(req) } }));
      rows.sort(byDesc('built_at'));
      res.json(rows.map((p: Record<string, unknown>) => ({ ...p, manifest: undefined, item_count: (p.item_ids as string[]).length })));
    } catch (e) { next(e); }
  });

  r.post('/packages', bearerAuth, requireRole(...WRITE), validate(packageSchema), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const body = req.body as z.infer<typeof packageSchema>;
      const [items, cat] = await Promise.all([tx(req, db, (t) => t.evidenceItem.findMany({ where: { engagement_id: eid(req) } })), catalogue()]);
      const usable = body.include_unvalidated ? items : items.filter((i: { status: string }) => i.status === 'validated');
      const { manifest, validation, picked } = buildManifest(usable, cat, { type: body.scope_type, values: body.scope_values });
      let version = 1;
      if (body.supersedes_id) {
        const prev = await tx(req, db, (t) => t.evidencePackage.findUnique({ where: { id: body.supersedes_id } }));
        if (!prev || prev.engagement_id !== eid(req)) return notFound(res);
        version = (prev.version ?? 1) + 1;
        await tx(req, db, (t) => t.evidencePackage.update({ where: { id: prev.id }, data: { status: 'superseded', updated_at: new Date() } }));
      }
      const row = await tx(req, db, (t) => t.evidencePackage.create({ data: { tenant_id: user(req).tenant_id, engagement_id: eid(req), name: body.name, scope_type: body.scope_type, scope_values: body.scope_values, item_ids: picked.map((i) => i.id), manifest, validation, status: validation.passed ? 'validated' : 'draft', version, supersedes_id: body.supersedes_id ?? null, run_id: body.run_id ?? null, built_by: user(req).sub } }));
      await audit(db, { action: 'package.build', actor: user(req), target_type: 'evidence_package', target_id: row.id, tenant_id: user(req).tenant_id, detail: { name: body.name, items: picked.length, passed: validation.passed, version } }, { strict: true });
      res.status(201).json({ ...row, manifest: undefined, item_count: picked.length });
    } catch (e) { next(e); }
  });

  async function pkgOf(req: Request) {
    const p = await tx(req, db, (t) => t.evidencePackage.findUnique({ where: { id: req.params.id } }));
    return p && p.engagement_id === eid(req) && p.tenant_id === user(req).tenant_id ? p : null;
  }
  r.get('/packages/:id', bearerAuth, requireRole(...READ), validate(idParam, 'params'), async (req, res, next) => {
    try { const p = await pkgOf(req); if (!p) return notFound(res); res.json(p); } catch (e) { next(e); }
  });
  /** Re-validate the frozen manifest against the live items (a later rejection / expiry shows up here). */
  r.post('/packages/:id/validate', bearerAuth, requireRole(...WRITE), validate(idParam, 'params'), async (req, res, next) => {
    try {
      const p = await pkgOf(req); if (!p) return notFound(res);
      if (p.status === 'superseded') return conflict(res, 'Superseded package', 'SUPERSEDED');
      const [items, cat] = await Promise.all([tx(req, db, (t) => t.evidenceItem.findMany({ where: { engagement_id: eid(req) } })), catalogue()]);
      const live = items.filter((i: { id: string }) => p.item_ids.includes(i.id));
      const { validation } = buildManifest(live, cat, { type: p.scope_type, values: p.scope_values });
      const drift = (p.manifest.items as { id: string; sha256: string | null; status: string }[]).filter((m) => { const l = live.find((x: { id: string }) => x.id === m.id); return !l || l.sha256 !== m.sha256 || l.status !== m.status; }).map((m) => m.id);
      const row = await tx(req, db, (t) => t.evidencePackage.update({ where: { id: p.id }, data: { validation: { ...validation, drifted_items: drift, checked_at: new Date().toISOString() }, status: p.status === 'signed_off' ? (validation.passed && drift.length === 0 ? 'signed_off' : 'draft') : validation.passed && drift.length === 0 ? 'validated' : 'draft', updated_at: new Date() } }));
      await audit(db, { action: 'package.validate', actor: user(req), target_type: 'evidence_package', target_id: p.id, tenant_id: user(req).tenant_id, detail: { passed: validation.passed, drifted: drift.length } });
      res.json({ ...row, manifest: undefined });
    } catch (e) { next(e); }
  });
  r.post('/packages/:id/sign-off', bearerAuth, requireRole(...SIGN), validate(idParam, 'params'), validate(signSchema), async (req, res, next) => {
    try {
      const p = await pkgOf(req); if (!p) return notFound(res);
      if (!isSigner(req)) { res.status(403).json({ error: 'Packages are signed off by the senior approver, the compliance manager or BHD', code: 'NOT_SIGNER' }); return; }
      if (p.built_by === user(req).sub) return conflict(res, 'Separation of duties: the person who built the package cannot sign it off', 'SOD_SAME_PERSON');
      if (p.status !== 'validated') return conflict(res, `Package is ${p.status}; validate it first`, 'NOT_VALIDATED');
      const notes = (req.body as { notes: string }).notes;
      const row = await tx(req, db, (t) => t.evidencePackage.update({ where: { id: p.id }, data: { status: 'signed_off', signed_off_by: user(req).sub, signed_off_at: new Date(), sign_off_notes: notes, updated_at: new Date() } }));
      await tx(req, db, (t) => t.assessmentSignOff.create({ data: { tenant_id: user(req).tenant_id, engagement_id: eid(req), kind: 'package', decision: 'approved', notes, package_id: p.id, signed_by: user(req).sub, signed_role: user(req).role } }));
      await audit(db, { action: 'package.sign_off', actor: user(req), target_type: 'evidence_package', target_id: p.id, tenant_id: user(req).tenant_id, detail: { built_by: p.built_by } }, { strict: true });
      res.json({ ...row, manifest: undefined });
    } catch (e) { next(e); }
  });
  r.get('/packages/:id/export', bearerAuth, requireRole(...READ), validate(idParam, 'params'), validate(fmtQuery, 'query'), async (req, res, next) => {
    try {
      const p = await pkgOf(req); if (!p) return notFound(res);
      await audit(db, { action: 'package.export', actor: user(req), target_type: 'evidence_package', target_id: p.id, tenant_id: user(req).tenant_id, detail: { format: (req.query as { format: string }).format } });
      const items = p.manifest.items as Record<string, unknown>[];
      if ((req.query as { format: string }).format === 'csv') {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="package-${p.id.slice(0, 8)}.csv"`);
        res.send(csv(['id', 'title', 'requirement_ids', 'archetype_code', 'form', 'kind', 'source', 'file_name', 'sha256', 'status', 'strength', 'collected_at', 'reviewed_by', 'version', 'classification'], items.map((i) => ['id', 'title', 'requirement_ids', 'archetype_code', 'form', 'kind', 'source', 'file_name', 'sha256', 'status', 'strength', 'collected_at', 'reviewed_by', 'version', 'classification'].map((k) => (Array.isArray(i[k]) ? (i[k] as string[]).join(' ') : i[k])))));
        return;
      }
      res.json({ package: { id: p.id, name: p.name, version: p.version, status: p.status, built_by: p.built_by, built_at: p.built_at, signed_off_by: p.signed_off_by, signed_off_at: p.signed_off_at, scope_type: p.scope_type, scope_values: p.scope_values }, validation: p.validation, manifest: p.manifest, download_base: `/api/engagements/${eid(req)}/evidence/items/{id}/content` });
    } catch (e) { next(e); }
  });

  // ---------------------------------------------------------------- assessor workspace
  r.get('/assessor/overview', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const g = await gather(req);
      const resultBy = new Map(g.results.map((x: { requirement_id: string; status: string; weight: number; objective_ids: string[] }) => [x.requirement_id, x]));
      const stmtBy = new Map(g.statements.map((s: { requirement_id: string }) => [s.requirement_id, s]));
      const signed = g.packages.filter((p: { status: string }) => p.status === 'signed_off');
      const pkgItems = new Set(signed.flatMap((p: { item_ids: string[] }) => p.item_ids));
      const poamBy = new Map(g.poam.map((p: { requirement_id: string }) => [p.requirement_id, p]));
      res.json({
        packages: signed.map((p: { id: string; name: string; version: number; signed_off_by: string; signed_off_at: Date; item_ids: string[] }) => ({ id: p.id, name: p.name, version: p.version, signed_off_by: p.signed_off_by, signed_off_at: p.signed_off_at, items: p.item_ids.length })),
        sprs: g.latest ? { score: g.latest.sprs_now, assessed_at: g.latest.created_at } : null,
        boundary: g.boundaries.find((b: { status: string }) => b.status === 'confirmed') ?? null,
        requirements: CONTROL_REFS.map((c) => { const rs = resultBy.get(c.control_id) as { status: string; weight: number } | undefined; const s = stmtBy.get(c.control_id) as { status: string; statement: string; approved_by: string | null } | undefined; const po = poamBy.get(c.control_id) as { status: string; scheduled_completion: Date | null; poam_allowed: boolean } | undefined; const ev = (g.evidence as { id: string; title: string; archetype_code: string | null; form: string | null; status: string; sha256: string | null; requirement_ids: string[]; reviewed_by: string | null; collected_at: Date }[]).filter((e) => e.status === 'validated' && e.requirement_ids.includes(c.control_id)).map((e) => ({ id: e.id, title: e.title, archetype_code: e.archetype_code, form: e.form, sha256: e.sha256, reviewed_by: e.reviewed_by, collected_at: e.collected_at, in_signed_package: pkgItems.has(e.id) })); return { requirement_id: c.control_id, family: c.family, level: c.cmmc_level, practice: c.practice, assessed: rs?.status ?? null, weight: rs?.weight ?? null, implementation_status: s?.status ?? null, statement: s?.statement ?? null, statement_approved: !!s?.approved_by, evidence: ev, poam: po ? { status: po.status, scheduled_completion: po.scheduled_completion, eligible: po.poam_allowed } : null }; }),
      });
    } catch (e) { next(e); }
  });

  r.get('/assessor/requests', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try { if (!(await engagementOf(req))) return notFound(res); const rows = await tx(req, db, (t) => t.assessorRequest.findMany({ where: { engagement_id: eid(req) } })); rows.sort(byDesc('created_at')); res.json(rows); } catch (e) { next(e); }
  });
  r.post('/assessor/requests', bearerAuth, requireRole(...ASK), validate(askSchema), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const row = await tx(req, db, (t) => t.assessorRequest.create({ data: { ...(req.body as object), tenant_id: user(req).tenant_id, engagement_id: eid(req), requested_by: user(req).sub, status: 'open' } }));
      await audit(db, { action: 'assessor.request', actor: user(req), target_type: 'assessor_request', target_id: row.id, tenant_id: user(req).tenant_id, detail: { requirement_id: row.requirement_id } });
      res.status(201).json(row);
    } catch (e) { next(e); }
  });
  r.post('/assessor/requests/:id/answer', bearerAuth, requireRole(...WRITE), validate(idParam, 'params'), validate(answerSchema), async (req, res, next) => {
    try {
      const q = await tx(req, db, (t) => t.assessorRequest.findUnique({ where: { id: req.params.id } }));
      if (!q || q.engagement_id !== eid(req) || q.tenant_id !== user(req).tenant_id) return notFound(res);
      const body = req.body as z.infer<typeof answerSchema>;
      const row = await tx(req, db, (t) => t.assessorRequest.update({ where: { id: q.id }, data: { answer: body.answer, evidence_item_ids: body.evidence_item_ids, answered_by: user(req).sub, answered_at: new Date(), status: 'answered', updated_at: new Date() } }));
      await audit(db, { action: 'assessor.answer', actor: user(req), target_type: 'assessor_request', target_id: q.id, tenant_id: user(req).tenant_id });
      res.json(row);
    } catch (e) { next(e); }
  });
  r.post('/assessor/requests/:id/close', bearerAuth, requireRole(...ASK), validate(idParam, 'params'), async (req, res, next) => {
    try {
      const q = await tx(req, db, (t) => t.assessorRequest.findUnique({ where: { id: req.params.id } }));
      if (!q || q.engagement_id !== eid(req) || q.tenant_id !== user(req).tenant_id) return notFound(res);
      const row = await tx(req, db, (t) => t.assessorRequest.update({ where: { id: q.id }, data: { status: 'closed', updated_at: new Date() } }));
      res.json(row);
    } catch (e) { next(e); }
  });

  // ---------------------------------------------------------------- sign-offs
  r.get('/sign-offs', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try { if (!(await engagementOf(req))) return notFound(res); const rows = await tx(req, db, (t) => t.assessmentSignOff.findMany({ where: { engagement_id: eid(req) } })); rows.sort(byDesc('signed_at')); res.json(rows); } catch (e) { next(e); }
  });
  r.post('/sign-offs', bearerAuth, requireRole(...SIGN), validate(signOffSchema), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      if (!isSigner(req)) { res.status(403).json({ error: 'Sign-offs are recorded by the senior approver, the compliance manager or BHD', code: 'NOT_SIGNER' }); return; }
      const body = req.body as z.infer<typeof signOffSchema>;
      const g = await gather(req);
      const check = checklist(g);
      if (body.kind === 'final' && body.decision === 'approved' && !check.items.filter((i) => i.id !== 'final').every((i) => i.ok)) return conflict(res, `Final sign-off needs every checklist item green (${check.items.filter((i) => !i.ok && i.id !== 'final').length} outstanding)`, 'CHECKLIST_INCOMPLETE');
      const row = await tx(req, db, (t) => t.assessmentSignOff.create({ data: { ...body, tenant_id: user(req).tenant_id, engagement_id: eid(req), readiness: check, run_id: body.run_id ?? g.latest?.id ?? null, signed_by: user(req).sub, signed_role: user(req).role } }));
      await audit(db, { action: 'assessment.sign_off', actor: user(req), target_type: 'assessment_sign_off', target_id: row.id, tenant_id: user(req).tenant_id, detail: { kind: body.kind, decision: body.decision } }, { strict: true });
      res.status(201).json(row);
    } catch (e) { next(e); }
  });

  // ---------------------------------------------------------------- reports
  r.get('/reports/:kind', bearerAuth, requireRole(...READ), validate(fmtQuery, 'query'), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const kind = req.params.kind as string;
      const format = (req.query as { format: 'json' | 'csv' | 'md' }).format;
      const g = await gather(req);
      let title = '', head: string[] = [], rows: unknown[][] = [], extra: Record<string, unknown> = {};
      switch (kind) {
        case 'readiness': { const c = checklist(g); title = 'CMMC readiness report'; head = ['item', 'ok', 'count']; rows = c.items.map((i) => [i.label, i.ok ? 'yes' : 'no', i.count]); extra = { ready: c.ready, score: c.score, sprs: g.latest?.sprs_now ?? null }; break; }
        case 'coverage': { title = 'Requirement evidence coverage'; head = ['requirement_id', 'state', 'required', 'covered', 'pending', 'missing']; rows = g.cov.map((c) => [c.requirement_id, c.state, c.required, c.covered, c.pending, c.missing.join(' ')]); break; }
        case 'gaps': { title = 'Gap analysis'; head = ['requirement_id', 'family', 'weight', 'status', 'engine_status', 'fixable', 'override_by']; rows = (g.results as Record<string, unknown>[]).filter((x) => x.status !== 'met').sort((a, b) => (b.weight as number) - (a.weight as number)).map((x) => [x.requirement_id, x.family, x.weight, x.status, x.engine_status, x.fixable, x.override_by]); extra = { run_id: g.latest?.id ?? null }; break; }
        case 'sprs': { title = 'SPRS report'; head = ['requirement_id', 'weight', 'status']; rows = (g.results as Record<string, unknown>[]).map((x) => [x.requirement_id, x.weight, x.status]); extra = g.latest ? { score: g.latest.sprs_now, projected: g.latest.sprs_after, assessed_at: g.latest.created_at, met: g.latest.met_count, partial: g.latest.partial_count, not_met: g.latest.not_met_count, unknown: g.latest.unknown_count } : {}; break; }
        case 'poam': { title = 'Plan of Action & Milestones'; head = ['requirement_id', 'weight', 'eligible', 'weakness', 'mitigation', 'scheduled_completion', 'responsible', 'status']; rows = (g.poam as Record<string, unknown>[]).map((p) => [p.requirement_id, p.weight, p.poam_allowed ? 'yes' : 'NO', p.weakness, p.mitigation, p.scheduled_completion ? new Date(p.scheduled_completion as Date).toISOString().slice(0, 10) : '', p.responsible, p.status]); break; }
        case 'evidence-inventory': { title = 'Evidence inventory'; head = ['id', 'title', 'requirement_ids', 'archetype_code', 'form', 'kind', 'source', 'status', 'strength', 'sha256', 'collected_at', 'reviewed_by', 'classification', 'version']; rows = (g.evidence as Record<string, unknown>[]).map((e) => [e.id, e.title, (e.requirement_ids as string[]).join(' '), e.archetype_code, e.form, e.kind, e.source, e.status, (e.validation as { strength?: string } | null)?.strength ?? '', e.sha256, e.collected_at, e.reviewed_by, e.classification, e.version]); break; }
        default: return notFound(res);
      }
      await audit(db, { action: 'report.export', actor: user(req), target_type: 'engagement', target_id: eid(req), tenant_id: user(req).tenant_id, detail: { kind, format } });
      if (format === 'csv') { res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${kind}.csv"`); res.send(csv(head, rows)); return; }
      if (format === 'md') { res.setHeader('Content-Type', 'text/markdown; charset=utf-8'); res.setHeader('Content-Disposition', `attachment; filename="${kind}.md"`); res.send([`# ${title}`, '', `Generated ${new Date().toISOString()}`, '', ...Object.entries(extra).map(([k, v]) => `- ${k}: ${v}`), '', `| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.map((v) => String(v ?? '')).join(' | ')} |`)].join('\n')); return; }
      res.json({ title, generated_at: new Date().toISOString(), ...extra, columns: head, rows });
    } catch (e) { next(e); }
  });

  return r;
}
