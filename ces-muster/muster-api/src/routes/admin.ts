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
import bcrypt from 'bcryptjs';
import { temporaryPassword } from '../lib/passwords.js';
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
/** Org-scoped user administration (2026-11-11): the organisation administrator (or BHD) manages the
 *  customer's own accounts inside their tenant. Roles they may grant: the customer roles and the C3PAO
 *  read-only role — never platform_admin (PB-01 fence) and never bhd_operator (BHD's identity). */
const ORG_GRANTABLE_ROLES = ['org_admin', 'compliance_manager', 'it_security_admin', 'evidence_reviewer', 'senior_approver', 'assessor_read_only'] as const;
const isUserManager = (req: Request) => ['org_admin', 'bhd_operator'].includes(user(req).role);
const orgCreateSchema = z.object({ email: z.string().trim().toLowerCase().email(), display_name: z.string().trim().min(1).max(120).optional(), role: z.enum(ORG_GRANTABLE_ROLES), access_request_id: z.string().uuid().optional() });
const userIdParam = z.object({ id: z.string().min(1).max(64) }).passthrough();
const orgPatchSchema = z.object({ role: z.enum(ORG_GRANTABLE_ROLES).optional(), display_name: z.string().trim().min(1).max(120).nullable().optional(), disabled: z.boolean().optional() }).refine((b) => Object.keys(b).length > 0, { message: 'nothing to change' });
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

export interface AdminRouterOptions { schedulerStatus?: () => { enabled: boolean; interval_ms: number; last_tick_at: string | null; last_report: unknown; ticks: number } }

export function createAdminRouter(db: Db, opts: AdminRouterOptions = {}) {
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

  r.post('/access/users', bearerAuth, requireRole(...ADMIN), validate(orgCreateSchema), async (req, res, next) => {
    try {
      if (!isUserManager(req)) { res.status(403).json({ error: 'Accounts are created by the organisation administrator or BHD', code: 'NOT_ORG_ADMIN' }); return; }
      const body = req.body as z.infer<typeof orgCreateSchema>;
      if (await db.user.findUnique({ where: { email: body.email } })) { res.status(409).json({ error: 'A user with this email already exists', code: 'EMAIL_TAKEN' }); return; }
      let request: { id: string; status: string; subject_email: string; requested_role: string } | null = null;
      if (body.access_request_id) {
        request = await tx(req, db, (t) => t.accessRequest.findUnique({ where: { id: body.access_request_id } }));
        if (!request || request.status !== 'approved') { res.status(409).json({ error: 'The access request must be approved first', code: 'REQUEST_NOT_APPROVED' }); return; }
        if (request.subject_email.toLowerCase() !== body.email || request.requested_role !== body.role) { res.status(409).json({ error: 'Email and role must match the approved request', code: 'REQUEST_MISMATCH' }); return; }
      }
      const temp = temporaryPassword();
      const password_hash = await bcrypt.hash(temp, 10);
      const row = await db.user.create({ data: { email: body.email, display_name: body.display_name ?? null, role: body.role, tenant_id: user(req).tenant_id, party_id: null, password_hash, must_change_password: true } });
      await audit(db, { action: 'user.created', actor: user(req), target_type: 'user', target_id: row.id, tenant_id: user(req).tenant_id, detail: { email: row.email, role: row.role, via: 'org_admin', access_request_id: request?.id ?? null } }, { strict: true });
      if (request) { const rid = request.id; await tx(req, db, (t) => t.accessRequest.update({ where: { id: rid }, data: { status: 'fulfilled', updated_at: new Date() } })); }
      res.status(201).json({ user: publicUser(row), temporary_password: temp });
    } catch (e) { next(e); }
  });

  r.patch('/access/users/:id', bearerAuth, requireRole(...ADMIN), validate(userIdParam, 'params'), validate(orgPatchSchema), async (req, res, next) => {
    try {
      if (!isUserManager(req)) { res.status(403).json({ error: 'Accounts are changed by the organisation administrator or BHD', code: 'NOT_ORG_ADMIN' }); return; }
      const target = await db.user.findUnique({ where: { id: req.params.id } });
      if (!target || target.tenant_id !== user(req).tenant_id) return notFound(res);
      if (!(ORG_GRANTABLE_ROLES as readonly string[]).includes(target.role)) { res.status(403).json({ error: 'Platform and BHD accounts are managed by a platform administrator', code: 'NOT_ORG_SCOPED' }); return; }
      const change = req.body as z.infer<typeof orgPatchSchema>;
      if (target.id === user(req).sub && ((change.role !== undefined && change.role !== target.role) || change.disabled === true)) { res.status(409).json({ error: 'Separation of duties: you cannot change your own role or disable yourself', code: 'SOD_SAME_PERSON' }); return; }
      const losesOrgAdmin = target.role === 'org_admin' && !target.disabled_at && ((change.role !== undefined && change.role !== 'org_admin') || change.disabled === true);
      if (losesOrgAdmin && (await db.user.count({ where: { tenant_id: user(req).tenant_id, role: 'org_admin', disabled_at: null } })) <= 1) { res.status(409).json({ error: 'This is the last enabled organisation administrator', code: 'LAST_ORG_ADMIN' }); return; }
      const data: Record<string, unknown> = {};
      if (change.role !== undefined) data.role = change.role;
      if (change.display_name !== undefined) data.display_name = change.display_name;
      if (change.disabled !== undefined) data.disabled_at = change.disabled ? new Date() : null;
      const row = await db.user.update({ where: { id: target.id }, data });
      const events: [string, Record<string, unknown>][] = [];
      if (change.role !== undefined && change.role !== target.role) events.push(['user.role_changed', { from: target.role, to: change.role }]);
      if (change.disabled !== undefined && change.disabled !== !!target.disabled_at) events.push([change.disabled ? 'user.disabled' : 'user.enabled', {}]);
      if (change.display_name !== undefined && change.display_name !== target.display_name) events.push(['user.renamed', {}]);
      for (const [action, detail] of events) await audit(db, { action, actor: user(req), target_type: 'user', target_id: target.id, tenant_id: user(req).tenant_id, detail: { email: target.email, via: 'org_admin', ...detail } }, { strict: true });
      res.json(publicUser(row));
    } catch (e) { next(e); }
  });

  r.post('/access/users/:id/reset-password', bearerAuth, requireRole(...ADMIN), validate(userIdParam, 'params'), async (req, res, next) => {
    try {
      if (!isUserManager(req)) { res.status(403).json({ error: 'Passwords are reset by the organisation administrator or BHD', code: 'NOT_ORG_ADMIN' }); return; }
      const target = await db.user.findUnique({ where: { id: req.params.id } });
      if (!target || target.tenant_id !== user(req).tenant_id) return notFound(res);
      if (!(ORG_GRANTABLE_ROLES as readonly string[]).includes(target.role)) { res.status(403).json({ error: 'Platform and BHD accounts are managed by a platform administrator', code: 'NOT_ORG_SCOPED' }); return; }
      const temp = temporaryPassword();
      await db.user.update({ where: { id: target.id }, data: { password_hash: await bcrypt.hash(temp, 10), must_change_password: true } });
      await audit(db, { action: 'user.password_reset', actor: user(req), target_type: 'user', target_id: target.id, tenant_id: user(req).tenant_id, detail: { email: target.email, via: 'org_admin' } }, { strict: true });
      res.json({ temporary_password: temp });
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
      res.json({ ...row, note: body.decision === 'approved' ? 'Approved. Create the account (or change the role) under Access management › Users; pass access_request_id so the request is marked fulfilled.' : undefined });
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
      await audit(db, { action: 'access.review.decide', actor: user(req), target_type: 'access_review', target_id: rv.id, tenant_id: user(req).tenant_id, detail: { user_id: body.user_id, decision: body.decision } }, { strict: true });
      res.json(row);
    } catch (e) { next(e); }
  });
  r.post('/access/reviews/:id/complete', bearerAuth, requireRole(...ADMIN), validate(idParam, 'params'), async (req, res, next) => {
    try {
      if (!isOrgAdmin(req)) { res.status(403).json({ error: 'NOT_ORG_ADMIN', code: 'NOT_ORG_ADMIN' }); return; }
      const rv = await tx(req, db, (t) => t.accessReview.findUnique({ where: { id: req.params.id } }));
      if (!rv || rv.tenant_id !== user(req).tenant_id) return notFound(res);
      const decided = new Set((rv.decisions as { user_id: string }[]).map((d) => d.user_id));
      // Everyone in the snapshot is attested — the completer included (by someone else; review I11). An
      // organisation with a single administrator asks BHD to attest that account.
      const pending = (rv.snapshot as { id: string }[]).filter((u) => !decided.has(u.id));
      if (pending.length) { res.status(409).json({ error: `${pending.length} user(s) not yet attested${pending.some((u) => u.id === user(req).sub) ? ' (including your own account — another administrator or BHD attests it)' : ''}`, code: 'REVIEW_INCOMPLETE', pending: pending.length }); return; }
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
      const claims = (await tx(req, db, (t) => t.auditEvent.findMany({ where: { tenant_id: tenant, action: 'remediation.run.claim' } }))) as { at: Date; detail: { runner?: string } | null }[];
      const lastClaim = claims.sort((a, b) => +new Date(b.at) - +new Date(a.at))[0];
      const runnerSeen = lastClaim ? new Date(lastClaim.at) : null;
      const runnerName = lastClaim?.detail?.runner ?? 'runner';
      const lastEval = new Map<string, Date>();
      for (const s of snaps as { engagement_id: string; taken_at: Date }[]) { const cur = lastEval.get(s.engagement_id); if (!cur || +new Date(s.taken_at) > +cur) lastEval.set(s.engagement_id, new Date(s.taken_at)); }
      res.json({
        service: { status: dbOk ? 'ok' : 'degraded', version: process.env.CES_VERSION ?? 'dev', node: process.version, uptime_seconds: Math.floor((Date.now() - STARTED_AT) / 1000), started_at: new Date(STARTED_AT).toISOString() },
        database: { status: dbOk ? 'ok' : 'unreachable', latency_ms: dbMs, rls: 'tenant_isolation policies (fail-closed)' },
        records: { engagements: engagements.length, organizations: await count('organization', { tenant_id: tenant }), customer_tenants: await count('customerTenant', { tenant_id: tenant }), assessment_runs: await count('assessmentRun', { tenant_id: tenant }), plan_actions: await count('planAction', { tenant_id: tenant }), remediation_runs: await count('remediationRun', { tenant_id: tenant }), evidence_items: await count('evidenceItem', { tenant_id: tenant }), monitor_findings: await count('monitorFinding', { tenant_id: tenant }), evidence_packages: await count('evidencePackage', { tenant_id: tenant }) },
        background_jobs: { scheduler: opts.schedulerStatus ? { ...opts.schedulerStatus(), note: 'in-process; honours Settings › System › monitoring cadence per tenant' } : 'none configured — monitoring runs on "Evaluate now" or an external cron calling POST /monitor/evaluate', last_monitor_evaluation: engagements.map((e: { id: string; name: string | null }) => ({ engagement_id: e.id, name: e.name, at: lastEval.get(e.id)?.toISOString() ?? null })) },
        integrations: [
          { id: 'tenant_runner', label: 'Tenant runner (Stamper / AdminOps live execution)', status: runnerSeen ? 'ok' : 'not_wired', note: runnerSeen ? `Pull protocol live — last claim ${runnerSeen.toISOString()} by ${runnerName}` : 'Pull protocol ready (runner/queue → claim → result); no runner has claimed a run yet — live runs stay queued until one does' },
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
