// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// admin.ts — Administration (2026-11-10): tenant settings, access requests,
// access reviews, system health. Everything here is the customer
// organisation's own administration (org_admin ≈ prime-inheriting) or BHD's;
// platform-wide user administration stays under /api/users (platform_admin,
// fenced by platformAdminFence — PB-01: the platform administrator holds no
// customer data, so it never reaches these routes).
//
//   GET/PUT  /api/admin/settings                     per-tenant settings (sections validated, versioned, audited)
//   GET      /api/admin/access/users                 the tenant's users without secrets (for reviews / requests)
//   GET/POST /api/admin/access/requests ; POST /:id/decide { decision, notes }
//   GET/POST /api/admin/access/reviews ; POST /:id/decide { user_id, decision, note } ; POST /:id/complete
//   GET      /api/admin/health                       db, version, uptime, row counts, last monitor evaluations, integrations

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { bearerAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { withTenant } from '../lib/prisma.js';
import { audit } from '../lib/audit.js';
import { ROLES } from '../lib/permissions.js';
import STAMPER_INDEX from '../vendored/ces-registry/stamper-index.json';
import ADMINOPS_INDEX from '../vendored/ces-registry/adminops-index.json';

const READ = ['prime', 'bhd_operator', 'sub'] as const;
const ADMIN = ['prime', 'bhd_operator'] as const; // narrowed to org_admin / compliance_manager / bhd_operator below

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
const user = (req: Request) => req.user!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tx = (req: Request, db: Db, fn: (t: Db) => Promise<any>): Promise<any> => withTenant(user(req).tenant_id, fn, db);
const notFound = (res: Response) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
const isOrgAdmin = (req: Request) => ['org_admin', 'compliance_manager', 'bhd_operator'].includes(user(req).role);
const STARTED_AT = Date.now();

export const DEFAULT_SETTINGS = {
  organization: { display_name: '', timezone: 'America/New_York', locale: 'en-US', support_contact: '' },
  system: { monitoring_cadence_hours: 24, evidence_currency_days: 365, session_idle_minutes: 30 },
  notifications: { alert_min_severity: 'high', digest: 'daily', recipients: [] as string[] },
  security: { password_min_length: 14, session_ttl_hours: 12, require_mfa_note: 'MFA is enforced by the identity provider (Entra ID Conditional Access); CES sign-in is email + password behind it.', ip_allowlist: [] as string[] },
  retention: { evidence_days: 2555, audit_days: 2555, package_days: 2555 },
};
const settingsSchema = z.object({
  organization: z.object({ display_name: z.string().trim().max(200), timezone: z.string().trim().max(64), locale: z.string().trim().max(16), support_contact: z.string().trim().max(254) }).partial(),
  system: z.object({ monitoring_cadence_hours: z.number().int().min(1).max(168), evidence_currency_days: z.number().int().min(30).max(1095), session_idle_minutes: z.number().int().min(5).max(480) }).partial(),
  notifications: z.object({ alert_min_severity: z.enum(['critical', 'high', 'medium', 'low', 'info']), digest: z.enum(['off', 'daily', 'weekly']), recipients: z.array(z.string().trim().email()).max(20) }).partial(),
  security: z.object({ password_min_length: z.number().int().min(8).max(64), session_ttl_hours: z.number().int().min(1).max(72), require_mfa_note: z.string().trim().max(500), ip_allowlist: z.array(z.string().trim().regex(/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/)).max(50) }).partial(),
  retention: z.object({ evidence_days: z.number().int().min(365).max(3650), audit_days: z.number().int().min(365).max(3650), package_days: z.number().int().min(365).max(3650) }).partial(),
}).partial();

const requestSchema = z.object({ subject_email: z.string().trim().email(), requested_role: z.enum(ROLES as unknown as [string, ...string[]]), engagement_id: z.string().uuid().optional().nullable(), justification: z.string().trim().min(10).max(2000) });
const decideSchema = z.object({ decision: z.enum(['approved', 'rejected', 'fulfilled']), notes: z.string().trim().min(3).max(2000) });
const reviewSchema = z.object({ title: z.string().trim().min(3).max(200) });
const reviewDecisionSchema = z.object({ user_id: z.string().min(1), decision: z.enum(['keep', 'remove', 'change_role']), note: z.string().trim().max(1000).optional().nullable() });
const idParam = z.object({ id: z.string().uuid() }).passthrough();

const publicUser = (u: Record<string, unknown>) => ({ id: u.id, email: u.email, display_name: u.display_name ?? null, role: u.role, last_login_at: u.last_login_at ?? null, disabled: !!u.disabled_at, created_at: u.created_at });

export function createAdminRouter(db: Db) {
  const r = Router();

  // ---------------------------------------------------------------- settings
  r.get('/settings', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      const row = await tx(req, db, (t) => t.tenantSettings.findUnique({ where: { tenant_id: user(req).tenant_id } }));
      const merged = Object.fromEntries((Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[]).map((k) => [k, { ...DEFAULT_SETTINGS[k], ...((row?.[k] as object) ?? {}) }]));
      res.json({ ...merged, version: row?.version ?? 0, updated_by: row?.updated_by ?? null, updated_at: row?.updated_at ?? null, editable: isOrgAdmin(req) });
    } catch (e) { next(e); }
  });

  r.put('/settings', bearerAuth, requireRole(...ADMIN), validate(settingsSchema), async (req, res, next) => {
    try {
      if (!isOrgAdmin(req)) { res.status(403).json({ error: 'Settings are changed by the organisation administrator, the compliance manager or BHD', code: 'NOT_ORG_ADMIN' }); return; }
      const body = req.body as z.infer<typeof settingsSchema>;
      const cur = await tx(req, db, (t) => t.tenantSettings.findUnique({ where: { tenant_id: user(req).tenant_id } }));
      const next_ = Object.fromEntries((Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[]).map((k) => [k, { ...((cur?.[k] as object) ?? {}), ...((body[k] as object) ?? {}) }]));
      const row = cur
        ? await tx(req, db, (t) => t.tenantSettings.update({ where: { tenant_id: user(req).tenant_id }, data: { ...next_, version: (cur.version ?? 1) + 1, updated_by: user(req).sub, updated_at: new Date() } }))
        : await tx(req, db, (t) => t.tenantSettings.create({ data: { tenant_id: user(req).tenant_id, ...next_, version: 1, updated_by: user(req).sub } }));
      await audit(db, { action: 'settings.update', actor: user(req), target_type: 'tenant_settings', target_id: user(req).tenant_id, tenant_id: user(req).tenant_id, detail: { sections: Object.keys(body), version: row.version } }, { strict: true });
      res.json({ ...row, editable: true });
    } catch (e) { next(e); }
  });

  // ---------------------------------------------------------------- access
  r.get('/access/users', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      const rows = await db.user.findMany({ where: { tenant_id: user(req).tenant_id } });
      res.json(rows.map(publicUser));
    } catch (e) { next(e); }
  });

  r.get('/access/requests', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      const rows = await tx(req, db, (t) => t.accessRequest.findMany({ where: { tenant_id: user(req).tenant_id } }));
      rows.sort((a: { created_at: Date }, b: { created_at: Date }) => +new Date(b.created_at) - +new Date(a.created_at));
      res.json(rows);
    } catch (e) { next(e); }
  });
  r.post('/access/requests', bearerAuth, requireRole(...READ), validate(requestSchema), async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof requestSchema>;
      if (body.requested_role === 'platform_admin') { res.status(422).json({ error: 'platform_admin is granted by Blue Heron Defense only', code: 'VALIDATION_ERROR', part: 'body', details: [{ path: 'requested_role', message: 'not requestable' }] }); return; }
      const row = await tx(req, db, (t) => t.accessRequest.create({ data: { ...body, tenant_id: user(req).tenant_id, requested_by: user(req).sub, status: 'open' } }));
      await audit(db, { action: 'access.request', actor: user(req), target_type: 'access_request', target_id: row.id, tenant_id: user(req).tenant_id, detail: { subject_email: body.subject_email, requested_role: body.requested_role } });
      res.status(201).json(row);
    } catch (e) { next(e); }
  });
  r.post('/access/requests/:id/decide', bearerAuth, requireRole(...ADMIN), validate(idParam, 'params'), validate(decideSchema), async (req, res, next) => {
    try {
      if (!isOrgAdmin(req)) { res.status(403).json({ error: 'Access requests are decided by the organisation administrator or BHD', code: 'NOT_ORG_ADMIN' }); return; }
      const q = await tx(req, db, (t) => t.accessRequest.findUnique({ where: { id: req.params.id } }));
      if (!q || q.tenant_id !== user(req).tenant_id) return notFound(res);
      if (q.requested_by === user(req).sub && user(req).role !== 'bhd_operator') { res.status(409).json({ error: 'Separation of duties: you cannot decide your own request', code: 'SOD_SAME_PERSON' }); return; }
      const body = req.body as z.infer<typeof decideSchema>;
      const row = await tx(req, db, (t) => t.accessRequest.update({ where: { id: q.id }, data: { status: body.decision, decided_by: user(req).sub, decided_at: new Date(), decision_notes: body.notes, updated_at: new Date() } }));
      await audit(db, { action: `access.request.${body.decision}`, actor: user(req), target_type: 'access_request', target_id: q.id, tenant_id: user(req).tenant_id, detail: { subject_email: q.subject_email, requested_role: q.requested_role } }, { strict: true });
      res.json({ ...row, note: body.decision === 'approved' ? 'Approved. The role itself is set by a platform administrator under Users (platform_admin only) — mark the request fulfilled once done.' : undefined });
    } catch (e) { next(e); }
  });

  r.get('/access/reviews', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      const rows = await tx(req, db, (t) => t.accessReview.findMany({ where: { tenant_id: user(req).tenant_id } }));
      rows.sort((a: { started_at: Date }, b: { started_at: Date }) => +new Date(b.started_at) - +new Date(a.started_at));
      res.json(rows);
    } catch (e) { next(e); }
  });
  /** Start a review: snapshot of every user of the tenant, to be attested one by one (AC.L2-3.1.x / periodic access review evidence). */
  r.post('/access/reviews', bearerAuth, requireRole(...ADMIN), validate(reviewSchema), async (req, res, next) => {
    try {
      if (!isOrgAdmin(req)) { res.status(403).json({ error: 'Access reviews are run by the organisation administrator, the compliance manager or BHD', code: 'NOT_ORG_ADMIN' }); return; }
      const users = (await db.user.findMany({ where: { tenant_id: user(req).tenant_id } })).map(publicUser);
      const row = await tx(req, db, (t) => t.accessReview.create({ data: { tenant_id: user(req).tenant_id, title: (req.body as { title: string }).title, snapshot: users, decisions: [], status: 'open', started_by: user(req).sub } }));
      await audit(db, { action: 'access.review.start', actor: user(req), target_type: 'access_review', target_id: row.id, tenant_id: user(req).tenant_id, detail: { users: users.length } }, { strict: true });
      res.status(201).json(row);
    } catch (e) { next(e); }
  });
  r.post('/access/reviews/:id/decide', bearerAuth, requireRole(...ADMIN), validate(idParam, 'params'), validate(reviewDecisionSchema), async (req, res, next) => {
    try {
      if (!isOrgAdmin(req)) { res.status(403).json({ error: 'NOT_ORG_ADMIN', code: 'NOT_ORG_ADMIN' }); return; }
      const rv = await tx(req, db, (t) => t.accessReview.findUnique({ where: { id: req.params.id } }));
      if (!rv || rv.tenant_id !== user(req).tenant_id) return notFound(res);
      if (rv.status !== 'open') { res.status(409).json({ error: 'Review completed', code: 'REVIEW_CLOSED' }); return; }
      const body = req.body as z.infer<typeof reviewDecisionSchema>;
      if (!(rv.snapshot as { id: string }[]).some((u) => u.id === body.user_id)) { res.status(422).json({ error: 'User not in this review', code: 'VALIDATION_ERROR', part: 'body', details: [{ path: 'user_id', message: 'not in snapshot' }] }); return; }
      if (body.user_id === user(req).sub) { res.status(409).json({ error: 'Separation of duties: you cannot attest your own access', code: 'SOD_SAME_PERSON' }); return; }
      const decisions = (rv.decisions as { user_id: string }[]).filter((d) => d.user_id !== body.user_id);
      decisions.push({ ...body, by: user(req).sub, at: new Date().toISOString() } as never);
      const row = await tx(req, db, (t) => t.accessReview.update({ where: { id: rv.id }, data: { decisions } }));
      res.json(row);
    } catch (e) { next(e); }
  });
  r.post('/access/reviews/:id/complete', bearerAuth, requireRole(...ADMIN), validate(idParam, 'params'), async (req, res, next) => {
    try {
      if (!isOrgAdmin(req)) { res.status(403).json({ error: 'NOT_ORG_ADMIN', code: 'NOT_ORG_ADMIN' }); return; }
      const rv = await tx(req, db, (t) => t.accessReview.findUnique({ where: { id: req.params.id } }));
      if (!rv || rv.tenant_id !== user(req).tenant_id) return notFound(res);
      const decided = new Set((rv.decisions as { user_id: string }[]).map((d) => d.user_id));
      const pending = (rv.snapshot as { id: string }[]).filter((u) => u.id !== user(req).sub && !decided.has(u.id));
      if (pending.length) { res.status(409).json({ error: `${pending.length} user(s) not yet attested`, code: 'REVIEW_INCOMPLETE', pending: pending.length }); return; }
      const row = await tx(req, db, (t) => t.accessReview.update({ where: { id: rv.id }, data: { status: 'completed', completed_by: user(req).sub, completed_at: new Date() } }));
      await audit(db, { action: 'access.review.complete', actor: user(req), target_type: 'access_review', target_id: rv.id, tenant_id: user(req).tenant_id, detail: { decisions: (rv.decisions as unknown[]).length, remove: (rv.decisions as { decision: string }[]).filter((d) => d.decision === 'remove').length } }, { strict: true });
      res.json(row);
    } catch (e) { next(e); }
  });

  // ---------------------------------------------------------------- health
  r.get('/health', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      let dbOk = true, dbMs = 0;
      const t0 = Date.now();
      try { await db.$queryRaw`SELECT 1`; } catch { dbOk = false; }
      dbMs = Date.now() - t0;
      const tenant = user(req).tenant_id;
      const count = async (model: string, where: Record<string, unknown>) => { try { return (await tx(req, db, (t) => t[model].findMany({ where }))).length; } catch { return null; } };
      const engagements = await tx(req, db, (t) => t.engagement.findMany({ where: { tenant_id: tenant } }));
      const snaps = await tx(req, db, (t) => t.monitorSnapshot.findMany({ where: { tenant_id: tenant } }));
      const lastEval = new Map<string, Date>();
      for (const s of snaps as { engagement_id: string; taken_at: Date }[]) { const cur = lastEval.get(s.engagement_id); if (!cur || +new Date(s.taken_at) > +cur) lastEval.set(s.engagement_id, new Date(s.taken_at)); }
      res.json({
        service: { status: dbOk ? 'ok' : 'degraded', version: process.env.CES_VERSION ?? 'dev', node: process.version, uptime_seconds: Math.floor((Date.now() - STARTED_AT) / 1000), started_at: new Date(STARTED_AT).toISOString() },
        database: { status: dbOk ? 'ok' : 'unreachable', latency_ms: dbMs, rls: 'tenant_isolation policies (fail-closed)' },
        records: { engagements: engagements.length, organizations: await count('organization', { tenant_id: tenant }), customer_tenants: await count('customerTenant', { tenant_id: tenant }), assessment_runs: await count('assessmentRun', { tenant_id: tenant }), plan_actions: await count('planAction', { tenant_id: tenant }), remediation_runs: await count('remediationRun', { tenant_id: tenant }), evidence_items: await count('evidenceItem', { tenant_id: tenant }), monitor_findings: await count('monitorFinding', { tenant_id: tenant }), evidence_packages: await count('evidencePackage', { tenant_id: tenant }) },
        background_jobs: { scheduler: 'none configured — monitoring runs on "Evaluate now" or an external cron calling POST /monitor/evaluate', last_monitor_evaluation: engagements.map((e: { id: string; name: string | null }) => ({ engagement_id: e.id, name: e.name, at: lastEval.get(e.id)?.toISOString() ?? null })) },
        integrations: [
          { id: 'tenant_runner', label: 'Tenant runner (Stamper / AdminOps live execution)', status: 'not_wired', note: 'Sprint 5 — live runs stay queued' },
          { id: 'ces_eo', label: 'ces-eo assessment engine (server-side runs)', status: 'not_wired', note: 'Runs are imported from readiness-result records' },
          { id: 'stamper_registry', label: 'Stamper command registry (vendored index)', status: 'ok', note: `${(STAMPER_INDEX as { count: number; vendored_on: string }).count} entries · ${(STAMPER_INDEX as { vendored_on: string }).vendored_on}` },
          { id: 'adminops_registry', label: 'AdminOps operations (vendored index)', status: 'ok', note: `${(ADMINOPS_INDEX as { count: number; vendored_on: string }).count} ops · ${(ADMINOPS_INDEX as { vendored_on: string }).vendored_on}` },
          { id: 'ces_shared', label: 'CES-Shared catalogue (archetypes / mappings / rules)', status: 'ok', note: 'served from this database' },
          { id: 'mailer', label: 'Password-reset mailer', status: process.env.SMTP_HOST ? 'configured' : 'console', note: process.env.SMTP_HOST ? process.env.SMTP_HOST : 'logs to console' },
        ],
      });
    } catch (e) { next(e); }
  });

  return r;
}
