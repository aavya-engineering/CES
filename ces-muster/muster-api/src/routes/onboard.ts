// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// onboard.ts — Sprint 3 slice "Onboard" (2026-11-10): organisations, customer
// Microsoft 365 tenant registrations and the compliance scope (assets by CMMC
// category + versioned CUI boundary) behind the unified lifecycle UI.
//
//   /api/organizations                      GET POST            /:id GET PATCH DELETE
//   /api/customer-tenants                   GET POST            /:id GET PATCH DELETE   /:id/test-connection POST
//   /api/engagements/:engagementId/scope    /assets GET POST    /assets/:id PATCH DELETE
//                                           /boundaries GET POST (new draft)  /boundaries/:id/confirm POST
//
// Rules: every row tenant-scoped through withTenant() (RLS fail-closed); writes
// audited; read = prime | bhd_operator | assessor_read_only | sub (platform roles
// inherit, permissions.ts); write = prime | bhd_operator. A boundary confirmation
// is a human act (BHD rule): it needs confirmed_by = the caller and supersedes the
// previous confirmed version. test-connection never touches a tenant here — it
// reports what ces-tenant would need (certificate + app registration) until the
// tenant-runner integration lands in Sprint 5.

import { Router, type Request } from 'express';
import { z } from 'zod';
import { bearerAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { withTenant } from '../lib/prisma.js';
import { audit } from '../lib/audit.js';

const READ = ['prime', 'bhd_operator', 'assessor_read_only', 'sub'] as const;
const WRITE = ['prime', 'bhd_operator'] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
const user = (req: Request) => req.user!;
// Rows are untyped here (Db = any) so the slice compiles before `prisma generate` runs.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tx = (req: Request, db: Db, fn: (t: Db) => Promise<any>): Promise<any> => withTenant(user(req).tenant_id, fn, db);

// ---------------------------------------------------------------- schemas
const uei = z.string().trim().regex(/^[A-Z0-9]{12}$/i, 'UEI is 12 alphanumeric characters').optional().nullable();
const cage = z.string().trim().regex(/^[A-Z0-9]{5}$/i, 'CAGE is 5 alphanumeric characters').optional().nullable();
const CLAUSES = ['DFARS 252.204-7012', 'DFARS 252.204-7019', 'DFARS 252.204-7020', 'DFARS 252.204-7021', 'FAR 52.204-21'] as const;

export const organizationSchema = z.object({
  legal_name: z.string().trim().min(2).max(200),
  dba_name: z.string().trim().max(200).optional().nullable(),
  uei,
  cage,
  website: z.string().trim().url().max(300).optional().nullable().or(z.literal('').transform(() => null)),
  address: z.string().trim().max(500).optional().nullable(),
  primary_contact_name: z.string().trim().max(200).optional().nullable(),
  primary_contact_email: z.string().trim().email().max(254).optional().nullable().or(z.literal('').transform(() => null)),
  contract_clauses: z.array(z.enum(CLAUSES)).max(5).default([]),
  status: z.enum(['active', 'inactive']).default('active'),
  notes: z.string().trim().max(2000).optional().nullable(),
});
const organizationPatch = organizationSchema.partial();

export const customerTenantSchema = z.object({
  organization_id: z.string().uuid().optional().nullable(),
  display_name: z.string().trim().min(2).max(200),
  entra_tenant_id: z.string().trim().uuid().optional().nullable().or(z.literal('').transform(() => null)),
  primary_domain: z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'A domain such as contoso.onmicrosoft.us').optional().nullable().or(z.literal('').transform(() => null)),
  cloud: z.enum(['gcc_high', 'gcc', 'commercial']).default('gcc_high'),
  app_registration_id: z.string().trim().uuid().optional().nullable().or(z.literal('').transform(() => null)),
  certificate_thumbprint: z.string().trim().regex(/^[A-F0-9]{40}$/i, 'SHA-1 thumbprint: 40 hex characters').optional().nullable().or(z.literal('').transform(() => null)),
  status: z.enum(['registered', 'consented', 'live_enabled', 'disabled']).default('registered'),
  notes: z.string().trim().max(2000).optional().nullable(),
});
const customerTenantPatch = customerTenantSchema.partial();

export const SCOPE_CATEGORIES = ['cui', 'security_protection', 'contractor_risk_managed', 'specialized', 'out_of_scope'] as const;
export const scopeAssetSchema = z.object({
  name: z.string().trim().min(1).max(200),
  asset_type: z.string().trim().min(1).max(100),
  category: z.enum(SCOPE_CATEGORIES),
  location: z.string().trim().max(200).optional().nullable(),
  owner: z.string().trim().max(200).optional().nullable(),
  external_provider: z.boolean().default(false),
  notes: z.string().trim().max(2000).optional().nullable(),
});
const scopeAssetPatch = scopeAssetSchema.partial();

export const boundaryDraftSchema = z.object({
  narrative: z.string().trim().max(5000).optional().nullable(),
  data_flows: z.array(z.object({ from: z.string().trim().min(1), to: z.string().trim().min(1), data: z.string().trim().min(1), protection: z.string().trim().optional() })).max(200).optional(),
});

// passthrough: keeps :engagementId of the parent router (zod strips unknown keys otherwise).
const idParam = z.object({ id: z.string().uuid() }).passthrough();

// ---------------------------------------------------------------- helpers
function notFound(res: import('express').Response) {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
}

async function engagementOf(req: Request, db: Db, engagementId: string) {
  const e = await db.engagement.findUnique({ where: { id: engagementId } });
  if (!e || e.tenant_id !== user(req).tenant_id) return null;
  return e;
}

// ================================================================ organizations
export function createOrganizationsRouter(db: Db) {
  const r = Router();

  r.get('/', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      const rows = await tx(req, db, (t) => t.organization.findMany({ where: { tenant_id: user(req).tenant_id }, orderBy: { legal_name: 'asc' } }));
      res.json(rows);
    } catch (e) { next(e); }
  });

  r.post('/', bearerAuth, requireRole(...WRITE), validate(organizationSchema), async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof organizationSchema>;
      const dup = await tx(req, db, (t) => t.organization.findMany({ where: { tenant_id: user(req).tenant_id, legal_name: body.legal_name } }));
      if (dup.length) { res.status(409).json({ error: 'An organisation with this legal name already exists', code: 'ORGANIZATION_EXISTS' }); return; }
      const row = await tx(req, db, (t) => t.organization.create({ data: { ...body, tenant_id: user(req).tenant_id, created_by: user(req).sub } }));
      await audit(db, { action: 'organization.create', actor: user(req), target_type: 'organization', target_id: row.id, tenant_id: user(req).tenant_id, detail: { legal_name: row.legal_name } });
      res.status(201).json(row);
    } catch (e) { next(e); }
  });

  r.get('/:id', bearerAuth, requireRole(...READ), validate(idParam, 'params'), async (req, res, next) => {
    try {
      const row = await tx(req, db, (t) => t.organization.findUnique({ where: { id: req.params.id } }));
      if (!row || row.tenant_id !== user(req).tenant_id) return notFound(res);
      const tenants = await tx(req, db, (t) => t.customerTenant.findMany({ where: { organization_id: row.id } }));
      res.json({ ...row, customer_tenants: tenants });
    } catch (e) { next(e); }
  });

  r.patch('/:id', bearerAuth, requireRole(...WRITE), validate(idParam, 'params'), validate(organizationPatch), async (req, res, next) => {
    try {
      const before = await tx(req, db, (t) => t.organization.findUnique({ where: { id: req.params.id } }));
      if (!before || before.tenant_id !== user(req).tenant_id) return notFound(res);
      const row = await tx(req, db, (t) => t.organization.update({ where: { id: req.params.id }, data: { ...(req.body as object), updated_at: new Date() } }));
      await audit(db, { action: 'organization.update', actor: user(req), target_type: 'organization', target_id: row.id, tenant_id: user(req).tenant_id, detail: { fields: Object.keys(req.body as object) } });
      res.json(row);
    } catch (e) { next(e); }
  });

  r.delete('/:id', bearerAuth, requireRole(...WRITE), validate(idParam, 'params'), async (req, res, next) => {
    try {
      const before = await tx(req, db, (t) => t.organization.findUnique({ where: { id: req.params.id } }));
      if (!before || before.tenant_id !== user(req).tenant_id) return notFound(res);
      const linked = await tx(req, db, (t) => t.customerTenant.findMany({ where: { organization_id: before.id } }));
      if (linked.length) { res.status(409).json({ error: 'Remove or re-assign its tenant registrations first', code: 'ORGANIZATION_IN_USE', count: linked.length }); return; }
      await tx(req, db, (t) => t.organization.delete({ where: { id: before.id } }));
      await audit(db, { action: 'organization.delete', actor: user(req), target_type: 'organization', target_id: before.id, tenant_id: user(req).tenant_id, detail: { legal_name: before.legal_name } }, { strict: true });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  return r;
}

// ================================================================ customer tenants
export function createCustomerTenantsRouter(db: Db) {
  const r = Router();

  r.get('/', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      const rows = await tx(req, db, (t) => t.customerTenant.findMany({ where: { tenant_id: user(req).tenant_id }, orderBy: { display_name: 'asc' } }));
      res.json(rows);
    } catch (e) { next(e); }
  });

  r.post('/', bearerAuth, requireRole(...WRITE), validate(customerTenantSchema), async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof customerTenantSchema>;
      if (body.organization_id) {
        const org = await tx(req, db, (t) => t.organization.findUnique({ where: { id: body.organization_id } }));
        if (!org || org.tenant_id !== user(req).tenant_id) { res.status(422).json({ error: 'Unknown organisation', code: 'VALIDATION_ERROR', part: 'body', details: [{ path: 'organization_id', message: 'Unknown organisation' }] }); return; }
      }
      const row = await tx(req, db, (t) => t.customerTenant.create({ data: { ...body, tenant_id: user(req).tenant_id, created_by: user(req).sub } }));
      await audit(db, { action: 'customer_tenant.register', actor: user(req), target_type: 'customer_tenant', target_id: row.id, tenant_id: user(req).tenant_id, detail: { display_name: row.display_name, cloud: row.cloud } });
      res.status(201).json(row);
    } catch (e) { next(e); }
  });

  r.get('/:id', bearerAuth, requireRole(...READ), validate(idParam, 'params'), async (req, res, next) => {
    try {
      const row = await tx(req, db, (t) => t.customerTenant.findUnique({ where: { id: req.params.id } }));
      if (!row || row.tenant_id !== user(req).tenant_id) return notFound(res);
      res.json(row);
    } catch (e) { next(e); }
  });

  r.patch('/:id', bearerAuth, requireRole(...WRITE), validate(idParam, 'params'), validate(customerTenantPatch), async (req, res, next) => {
    try {
      const before = await tx(req, db, (t) => t.customerTenant.findUnique({ where: { id: req.params.id } }));
      if (!before || before.tenant_id !== user(req).tenant_id) return notFound(res);
      const row = await tx(req, db, (t) => t.customerTenant.update({ where: { id: before.id }, data: { ...(req.body as object), updated_at: new Date() } }));
      await audit(db, { action: 'customer_tenant.update', actor: user(req), target_type: 'customer_tenant', target_id: row.id, tenant_id: user(req).tenant_id, detail: { fields: Object.keys(req.body as object) } });
      res.json(row);
    } catch (e) { next(e); }
  });

  r.delete('/:id', bearerAuth, requireRole(...WRITE), validate(idParam, 'params'), async (req, res, next) => {
    try {
      const before = await tx(req, db, (t) => t.customerTenant.findUnique({ where: { id: req.params.id } }));
      if (!before || before.tenant_id !== user(req).tenant_id) return notFound(res);
      if (before.status === 'live_enabled') { res.status(409).json({ error: 'Disable live access before removing a tenant registration', code: 'TENANT_LIVE' }); return; }
      await tx(req, db, (t) => t.customerTenant.delete({ where: { id: before.id } }));
      await audit(db, { action: 'customer_tenant.delete', actor: user(req), target_type: 'customer_tenant', target_id: before.id, tenant_id: user(req).tenant_id, detail: { display_name: before.display_name } }, { strict: true });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  /** Reports what a live connection needs. Never contacts the tenant (tenant-runner integration: Sprint 5). */
  r.post('/:id/test-connection', bearerAuth, requireRole(...WRITE), validate(idParam, 'params'), async (req, res, next) => {
    try {
      const row = await tx(req, db, (t) => t.customerTenant.findUnique({ where: { id: req.params.id } }));
      if (!row || row.tenant_id !== user(req).tenant_id) return notFound(res);
      const checks = [
        { id: 'entra_tenant_id', label: 'Entra tenant id recorded', ok: !!row.entra_tenant_id },
        { id: 'primary_domain', label: 'Primary domain recorded', ok: !!row.primary_domain },
        { id: 'app_registration', label: 'App registration id recorded', ok: !!row.app_registration_id },
        { id: 'certificate', label: 'Certificate thumbprint recorded', ok: !!row.certificate_thumbprint },
        { id: 'cloud', label: 'Cloud is GCC High (only cloud implemented)', ok: row.cloud === 'gcc_high' },
        { id: 'runner', label: 'Tenant runner has claimed a run (Windows host)', ok: false, note: 'The runner pulls queued live runs (remediation/runner/queue); this check turns green once it has claimed one — see Administration › System health.' },
      ];
      const ready = checks.filter((c) => c.id !== 'runner').every((c) => c.ok);
      const connection_status = ready ? 'prerequisites_complete' : 'prerequisites_missing';
      const updated = await tx(req, db, (t) => t.customerTenant.update({ where: { id: row.id }, data: { connection_status, connection_tested_at: new Date(), updated_at: new Date() } }));
      await audit(db, { action: 'customer_tenant.test_connection', actor: user(req), target_type: 'customer_tenant', target_id: row.id, tenant_id: user(req).tenant_id, detail: { connection_status } });
      res.json({ tenant: updated, connection_status, checks });
    } catch (e) { next(e); }
  });

  return r;
}

// ================================================================ scope (per engagement)
export function createScopeRouter(db: Db) {
  const r = Router({ mergeParams: true });
  const eid = (req: Request) => (req.params as { engagementId: string }).engagementId;

  r.get('/assets', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      if (!(await engagementOf(req, db, eid(req)))) return notFound(res);
      const rows = await tx(req, db, (t) => t.scopeAsset.findMany({ where: { engagement_id: eid(req) }, orderBy: { name: 'asc' } }));
      res.json(rows);
    } catch (e) { next(e); }
  });

  r.post('/assets', bearerAuth, requireRole(...WRITE), validate(scopeAssetSchema), async (req, res, next) => {
    try {
      if (!(await engagementOf(req, db, eid(req)))) return notFound(res);
      const row = await tx(req, db, (t) => t.scopeAsset.create({ data: { ...(req.body as object), tenant_id: user(req).tenant_id, engagement_id: eid(req), created_by: user(req).sub } }));
      await audit(db, { action: 'scope.asset.create', actor: user(req), target_type: 'scope_asset', target_id: row.id, tenant_id: user(req).tenant_id, detail: { engagement_id: eid(req), category: row.category } });
      res.status(201).json(row);
    } catch (e) { next(e); }
  });

  r.patch('/assets/:id', bearerAuth, requireRole(...WRITE), validate(idParam, 'params'), validate(scopeAssetPatch), async (req, res, next) => {
    try {
      const before = await tx(req, db, (t) => t.scopeAsset.findUnique({ where: { id: req.params.id } }));
      if (!before || before.engagement_id !== eid(req) || before.tenant_id !== user(req).tenant_id) return notFound(res);
      const row = await tx(req, db, (t) => t.scopeAsset.update({ where: { id: before.id }, data: { ...(req.body as object), updated_at: new Date() } }));
      await audit(db, { action: 'scope.asset.update', actor: user(req), target_type: 'scope_asset', target_id: row.id, tenant_id: user(req).tenant_id, detail: { fields: Object.keys(req.body as object) } });
      res.json(row);
    } catch (e) { next(e); }
  });

  r.delete('/assets/:id', bearerAuth, requireRole(...WRITE), validate(idParam, 'params'), async (req, res, next) => {
    try {
      const before = await tx(req, db, (t) => t.scopeAsset.findUnique({ where: { id: req.params.id } }));
      if (!before || before.engagement_id !== eid(req) || before.tenant_id !== user(req).tenant_id) return notFound(res);
      await tx(req, db, (t) => t.scopeAsset.delete({ where: { id: before.id } }));
      await audit(db, { action: 'scope.asset.delete', actor: user(req), target_type: 'scope_asset', target_id: before.id, tenant_id: user(req).tenant_id, detail: { name: before.name } }, { strict: true });
      res.status(204).end();
    } catch (e) { next(e); }
  });

  r.get('/boundaries', bearerAuth, requireRole(...READ), async (req, res, next) => {
    try {
      if (!(await engagementOf(req, db, eid(req)))) return notFound(res);
      const rows = await tx(req, db, (t) => t.scopeBoundary.findMany({ where: { engagement_id: eid(req) }, orderBy: { version: 'desc' } }));
      res.json(rows);
    } catch (e) { next(e); }
  });

  /** Creates the next draft version from the current asset list. */
  r.post('/boundaries', bearerAuth, requireRole(...WRITE), validate(boundaryDraftSchema), async (req, res, next) => {
    try {
      if (!(await engagementOf(req, db, eid(req)))) return notFound(res);
      const [existing, assets] = await Promise.all([
        tx(req, db, (t) => t.scopeBoundary.findMany({ where: { engagement_id: eid(req) } })),
        tx(req, db, (t) => t.scopeAsset.findMany({ where: { engagement_id: eid(req) } })),
      ]);
      const version = existing.reduce((m: number, b: { version: number }) => Math.max(m, b.version), 0) + 1;
      const body = req.body as z.infer<typeof boundaryDraftSchema>;
      const row = await tx(req, db, (t) => t.scopeBoundary.create({ data: { tenant_id: user(req).tenant_id, engagement_id: eid(req), version, status: 'draft', narrative: body.narrative ?? null, data_flows: body.data_flows ?? null, asset_count: assets.length, created_by: user(req).sub } }));
      await audit(db, { action: 'scope.boundary.draft', actor: user(req), target_type: 'scope_boundary', target_id: row.id, tenant_id: user(req).tenant_id, detail: { engagement_id: eid(req), version } });
      res.status(201).json(row);
    } catch (e) { next(e); }
  });

  /** Human confirmation (BHD rule): the caller confirms; the previous confirmed version is superseded. */
  r.post('/boundaries/:id/confirm', bearerAuth, requireRole(...WRITE), validate(idParam, 'params'), async (req, res, next) => {
    try {
      const draft = await tx(req, db, (t) => t.scopeBoundary.findUnique({ where: { id: req.params.id } }));
      if (!draft || draft.engagement_id !== eid(req) || draft.tenant_id !== user(req).tenant_id) return notFound(res);
      if (draft.status !== 'draft') { res.status(409).json({ error: 'Only a draft boundary can be confirmed', code: 'BOUNDARY_NOT_DRAFT' }); return; }
      const assets = await tx(req, db, (t) => t.scopeAsset.findMany({ where: { engagement_id: eid(req) } }));
      const uncategorised = assets.filter((a: { category?: string }) => !a.category);
      if (!assets.length || uncategorised.length) { res.status(409).json({ error: assets.length ? 'Every asset needs a category before confirmation' : 'Add at least one in-scope asset before confirming the boundary', code: 'BOUNDARY_INCOMPLETE' }); return; }
      await tx(req, db, (t) => t.scopeBoundary.updateMany({ where: { engagement_id: eid(req), status: 'confirmed' }, data: { status: 'superseded' } }));
      const row = await tx(req, db, (t) => t.scopeBoundary.update({ where: { id: draft.id }, data: { status: 'confirmed', confirmed_by: user(req).sub, confirmed_at: new Date(), asset_count: assets.length } }));
      await audit(db, { action: 'scope.boundary.confirm', actor: user(req), target_type: 'scope_boundary', target_id: row.id, tenant_id: user(req).tenant_id, detail: { engagement_id: eid(req), version: row.version, asset_count: assets.length } }, { strict: true });
      res.json(row);
    } catch (e) { next(e); }
  });

  return r;
}
