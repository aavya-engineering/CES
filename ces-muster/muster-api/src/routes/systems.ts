// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// systems.ts — Onboard › System & Environment Registry and Onboarding
// Checklist (2026-11-10).
//
//   GET/POST /api/engagements/:engagementId/systems ; PATCH/DELETE /:id ; POST /:id/link-scope-asset
//   GET      /api/engagements/:engagementId/onboard/checklist   organisation / tenant / engagement readiness, computed

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { bearerAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { withTenant } from '../lib/prisma.js';
import { audit } from '../lib/audit.js';

const READ = ['prime', 'bhd_operator', 'assessor_read_only', 'sub'] as const;
const WRITE = ['prime', 'bhd_operator', 'sub'] as const;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
const user = (req: Request) => req.user!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tx = (req: Request, db: Db, fn: (t: Db) => Promise<any>): Promise<any> => withTenant(user(req).tenant_id, fn, db);
const notFound = (res: Response) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });

export const SYSTEM_KINDS = ['system', 'environment', 'infrastructure', 'cloud_resource'] as const;
export const HOSTING = ['gcc_high', 'azure_government', 'on_premises', 'saas', 'other'] as const;
const systemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(SYSTEM_KINDS).default('system'),
  environment: z.enum(['production', 'test', 'development']).optional().nullable(),
  hosting: z.enum(HOSTING).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  owner: z.string().trim().max(200).optional().nullable(),
  handles_cui: z.boolean().default(false),
  scope_asset_id: z.string().uuid().optional().nullable(),
  attributes: z.record(z.string().max(500)).optional().nullable(),
});
const systemPatch = systemSchema.partial();
const idParam = z.object({ id: z.string().uuid() }).passthrough();

export function createSystemsRouter(db: Db) {
  const r = Router({ mergeParams: true });
  const eid = (req: Request) => (req.params as { engagementId: string }).engagementId;
  async function engagementOf(req: Request) {
    const e = await db.engagement.findUnique({ where: { id: eid(req) } });
    return e && e.tenant_id === user(req).tenant_id ? e : null;
  }
  const own = (req: Request, row: { engagement_id: string; tenant_id: string } | null) => !!row && row.engagement_id === eid(req) && row.tenant_id === user(req).tenant_id;

  r.get('/', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const rows = await tx(req, db, (t) => t.systemRecord.findMany({ where: { engagement_id: eid(req) } }));
      rows.sort((a: { kind: string; name: string }, b: { kind: string; name: string }) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
      res.json(rows);
    } catch (e) { next(e); }
  });
  r.post('/', bearerAuth, requireRole(...WRITE), validate(systemSchema), async (req, res, next) => {
    try {
      if (!(await engagementOf(req))) return notFound(res);
      const body = req.body as z.infer<typeof systemSchema>;
      if (body.scope_asset_id) { const a = await tx(req, db, (t) => t.scopeAsset.findUnique({ where: { id: body.scope_asset_id } })); if (!own(req, a)) { res.status(422).json({ error: 'Unknown scope asset', code: 'VALIDATION_ERROR', part: 'body', details: [{ path: 'scope_asset_id', message: 'unknown' }] }); return; } }
      const row = await tx(req, db, (t) => t.systemRecord.create({ data: { ...body, tenant_id: user(req).tenant_id, engagement_id: eid(req), created_by: user(req).sub } }));
      await audit(db, { action: 'system.create', actor: user(req), target_type: 'system', target_id: row.id, tenant_id: user(req).tenant_id, detail: { engagement_id: eid(req), kind: row.kind, handles_cui: row.handles_cui } });
      res.status(201).json(row);
    } catch (e) { next(e); }
  });
  r.patch('/:id', bearerAuth, requireRole(...WRITE), validate(idParam, 'params'), validate(systemPatch), async (req, res, next) => {
    try {
      const before = await tx(req, db, (t) => t.systemRecord.findUnique({ where: { id: req.params.id } }));
      if (!own(req, before)) return notFound(res);
      const row = await tx(req, db, (t) => t.systemRecord.update({ where: { id: before.id }, data: { ...(req.body as object), updated_at: new Date() } }));
      await audit(db, { action: 'system.update', actor: user(req), target_type: 'system', target_id: row.id, tenant_id: user(req).tenant_id, detail: { fields: Object.keys(req.body as object) } });
      res.json(row);
    } catch (e) { next(e); }
  });
  r.delete('/:id', bearerAuth, requireRole(...WRITE), validate(idParam, 'params'), async (req, res, next) => {
    try {
      const before = await tx(req, db, (t) => t.systemRecord.findUnique({ where: { id: req.params.id } }));
      if (!own(req, before)) return notFound(res);
      await tx(req, db, (t) => t.systemRecord.delete({ where: { id: before.id } }));
      await audit(db, { action: 'system.delete', actor: user(req), target_type: 'system', target_id: before.id, tenant_id: user(req).tenant_id, detail: { name: before.name } }, { strict: true });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return r;
}

export function createOnboardChecklistRouter(db: Db) {
  const r = Router({ mergeParams: true });
  const eid = (req: Request) => (req.params as { engagementId: string }).engagementId;
  r.get('/checklist', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      const e = await db.engagement.findUnique({ where: { id: eid(req) } });
      if (!e || e.tenant_id !== user(req).tenant_id) return notFound(res);
      const tenant = user(req).tenant_id;
      const [orgs, tenants, parties, contracts, assets, boundaries, systems, users] = await Promise.all([
        tx(req, db, (t) => t.organization.findMany({ where: { tenant_id: tenant } })),
        tx(req, db, (t) => t.customerTenant.findMany({ where: { tenant_id: tenant } })),
        tx(req, db, (t) => t.party.findMany({ where: { engagement_id: eid(req) } })),
        tx(req, db, (t) => t.contract.findMany({ where: { engagement_id: eid(req) } })),
        tx(req, db, (t) => t.scopeAsset.findMany({ where: { engagement_id: eid(req) } })),
        tx(req, db, (t) => t.scopeBoundary.findMany({ where: { engagement_id: eid(req) } })),
        tx(req, db, (t) => t.systemRecord.findMany({ where: { engagement_id: eid(req) } })),
        db.user.findMany({ where: { tenant_id: tenant } }),
      ]);
      const org = orgs[0] ?? null;
      const roles = new Set(users.map((u: { role: string }) => u.role));
      const sections = [
        { id: 'organization', label: 'Organisation readiness', items: [
          { id: 'org', label: 'Organisation profile created', ok: orgs.length > 0, route: 'onboard/organizations' },
          { id: 'ids', label: 'UEI and CAGE recorded', ok: !!(org?.uei && org?.cage), route: 'onboard/organizations' },
          { id: 'clauses', label: 'Contract clauses recorded (DFARS 7012 / 7021)', ok: !!org && (org.contract_clauses as string[]).length > 0, route: 'onboard/organizations' },
          { id: 'contact', label: 'Primary contact named', ok: !!org?.primary_contact_email, route: 'onboard/organizations' },
          { id: 'roles', label: 'Compliance manager and IT/security administrator accounts exist', ok: (roles.has('compliance_manager') || roles.has('prime')) && (roles.has('it_security_admin') || roles.has('sub')), route: 'platform/users' },
        ] },
        { id: 'tenant', label: 'Tenant readiness', items: [
          { id: 'tenant', label: 'Microsoft 365 tenant registered', ok: tenants.length > 0, route: 'onboard/tenants' },
          { id: 'cloud', label: 'Tenant is GCC High', ok: tenants.some((t: { cloud: string }) => t.cloud === 'gcc_high'), route: 'onboard/tenants' },
          { id: 'prereq', label: 'Connection prerequisites complete (app registration + certificate)', ok: tenants.some((t: { connection_status: string | null }) => t.connection_status === 'prerequisites_complete'), route: 'onboard/tenants' },
          { id: 'live', label: 'Live access decision recorded on the engagement', ok: typeof e.live_access_enabled === 'boolean' && !!e.live_access_set_at, route: 'muster' },
        ] },
        { id: 'engagement', label: 'Engagement readiness', items: [
          { id: 'details', label: 'Engagement named with CMMC level and target date', ok: !!(e.name && e.cmmc_level && e.target_date), route: 'onboard/engagements' },
          { id: 'parties', label: 'At least one party (prime / contractor) added', ok: parties.length > 0, route: 'engagements/all' },
          { id: 'contracts', label: 'Contract(s) with CMMC requirement recorded', ok: contracts.length > 0, route: 'muster' },
          { id: 'assets', label: 'Scope assets categorised', ok: assets.length > 0, route: 'onboard/scope' },
          { id: 'boundary', label: 'CUI boundary confirmed', ok: boundaries.some((b: { status: string }) => b.status === 'confirmed'), route: 'onboard/scope' },
          { id: 'systems', label: 'Systems and environments registered', ok: systems.length > 0, route: 'onboard/systems' },
        ] },
      ];
      const all = sections.flatMap((s) => s.items);
      res.json({ sections, done: all.filter((i) => i.ok).length, total: all.length, ready: all.every((i) => i.ok) });
    } catch (e) { next(e); }
  });
  return r;
}
