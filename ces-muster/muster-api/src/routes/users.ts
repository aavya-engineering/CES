// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// users.ts — RBAC-01: user administration for platform administrators.
//
//   GET    /api/users                      list users (no password hashes, ever)
//   GET    /api/users/organizations        organisations a user can belong to
//   POST   /api/users                      create; returns a temporary password once
//   PATCH  /api/users/:id                  role, display name, disable / enable
//   POST   /api/users/:id/reset-password   new temporary password, returned once
//   GET    /api/audit-events               newest first (createAuditRouter)
//
// Rules: only platform_admin (users.manage). An admin cannot change their own
// role or disable themselves, and the last enabled platform_admin cannot be
// demoted or disabled — so the platform can never be left without an admin.
// Every change writes an audit event; if the audit write fails, the request
// fails. "Organisation" here is Muster's own tenant (customer organisation,
// RLS key) — not a Microsoft tenant from the ces-tenant registry.
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { bearerAuth } from '../middleware/auth.js';
import { can, isRole, ROLES } from '../lib/permissions.js';
import { audit, type AuditDb } from '../lib/audit.js';
import { temporaryPassword } from '../lib/passwords.js';

export interface UserRow {
  id: string;
  tenant_id: string;
  party_id: string | null;
  email: string;
  password_hash: string;
  role: string;
  display_name: string | null;
  disabled_at: Date | null;
  must_change_password: boolean;
  last_login_at: Date | null;
  created_at: Date;
}

export interface TenantRow {
  id: string;
  name: string;
}

/** The slice of the Prisma client these routes use (a fake fits it in tests). */
export interface UsersDb extends AuditDb {
  user: {
    findMany(args?: Record<string, unknown>): Promise<UserRow[]>;
    findUnique(args: { where: Record<string, unknown> }): Promise<UserRow | null>;
    create(args: { data: Record<string, unknown> }): Promise<UserRow>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<UserRow>;
    count(args?: { where?: Record<string, unknown> }): Promise<number>;
  };
  tenant: {
    findMany(args?: Record<string, unknown>): Promise<TenantRow[]>;
    findUnique(args: { where: { id: string } }): Promise<TenantRow | null>;
    create(args: { data: { name: string } }): Promise<TenantRow>;
  };
  auditEvent: AuditDb['auditEvent'] & {
    findMany(args?: Record<string, unknown>): Promise<unknown[]>;
  };
  /** Prisma interactive transaction: the change and its audit row commit together. */
  $transaction<T>(fn: (tx: UsersDb) => Promise<T>): Promise<T>;
}

function requireUsersManage(req: Request, res: Response, next: NextFunction): void {
  if (!can(req.user?.role, 'users.manage')) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}

/** The public shape of a user. Never includes password_hash. */
export function publicUser(u: UserRow, tenantName?: string) {
  return {
    id: u.id,
    email: u.email,
    display_name: u.display_name ?? null,
    role: u.role,
    tenant_id: u.tenant_id,
    organization: tenantName ?? null,
    party_id: u.party_id ?? null,
    disabled: !!u.disabled_at,
    must_change_password: !!u.must_change_password,
    last_login_at: u.last_login_at ?? null,
    created_at: u.created_at,
  };
}

const roleSchema = z.string().refine(isRole, { message: `role must be one of: ${ROLES.join(', ')}` });

const createSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    display_name: z.string().trim().min(1).max(120).optional(),
    role: roleSchema,
    tenant_id: z.string().min(1).optional(),
    organization_name: z.string().trim().min(1).max(200).optional(),
    party_id: z.string().min(1).nullable().optional(),
  })
  .refine((b) => !!b.tenant_id !== !!b.organization_name, {
    message: 'give exactly one of tenant_id (existing organisation) or organization_name (new organisation)',
  });

const patchSchema = z
  .object({
    role: roleSchema.optional(),
    display_name: z.string().trim().min(1).max(120).nullable().optional(),
    disabled: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: 'nothing to change' });

async function enabledAdminCount(db: UsersDb): Promise<number> {
  return db.user.count({ where: { role: 'platform_admin', disabled_at: null } });
}

export function createUsersRouter(db: UsersDb) {
  const router = Router();
  router.use(bearerAuth, requireUsersManage);

  router.get('/', async (_req, res, next) => {
    try {
      const [users, tenants] = await Promise.all([
        db.user.findMany({ orderBy: { created_at: 'asc' } }),
        db.tenant.findMany(),
      ]);
      const names = new Map(tenants.map((t) => [t.id, t.name]));
      res.json({ users: users.map((u) => publicUser(u, names.get(u.tenant_id))) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/organizations', async (_req, res, next) => {
    try {
      const tenants = await db.tenant.findMany({ orderBy: { name: 'asc' } });
      res.json({ organizations: tenants.map((t) => ({ id: t.id, name: t.name })) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      const body = parsed.data;
      if (await db.user.findUnique({ where: { email: body.email } })) {
        res.status(409).json({ error: 'A user with this email already exists', code: 'EMAIL_TAKEN' });
        return;
      }
      if (body.tenant_id && !(await db.tenant.findUnique({ where: { id: body.tenant_id } }))) {
        res.status(400).json({ error: 'Unknown organisation', code: 'UNKNOWN_ORGANIZATION' });
        return;
      }
      const temp = temporaryPassword();
      const password_hash = await bcrypt.hash(temp, 10);
      // One transaction: organisation, user and their audit rows commit together.
      const { user, tenant } = await db.$transaction(async (tx) => {
        let tenant = body.tenant_id ? await tx.tenant.findUnique({ where: { id: body.tenant_id } }) : null;
        if (!tenant) {
          tenant = await tx.tenant.create({ data: { name: body.organization_name! } });
          await audit(tx, { action: 'organization.created', actor: req.user, target_type: 'tenant', target_id: tenant.id, tenant_id: tenant.id, detail: { name: tenant.name } }, { strict: true });
        }
        const user = await tx.user.create({
          data: {
            email: body.email,
            display_name: body.display_name ?? null,
            role: body.role,
            tenant_id: tenant.id,
            party_id: body.party_id ?? null,
            password_hash,
            must_change_password: true,
          },
        });
        await audit(tx, { action: 'user.created', actor: req.user, target_type: 'user', target_id: user.id, tenant_id: tenant.id, detail: { email: user.email, role: user.role } }, { strict: true });
        return { user, tenant };
      });
      res.status(201).json({ user: publicUser(user, tenant.name), temporary_password: temp });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      const target = await db.user.findUnique({ where: { id: req.params.id } });
      if (!target) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      const change = parsed.data;
      const self = target.id === req.user!.sub;
      if (self && change.role !== undefined && change.role !== target.role) {
        res.status(409).json({ error: 'You cannot change your own role', code: 'SELF_ROLE_CHANGE' });
        return;
      }
      if (self && change.disabled === true) {
        res.status(409).json({ error: 'You cannot disable your own account', code: 'SELF_DISABLE' });
        return;
      }
      const losesAdmin =
        target.role === 'platform_admin' &&
        !target.disabled_at &&
        ((change.role !== undefined && change.role !== 'platform_admin') || change.disabled === true);
      if (losesAdmin && (await enabledAdminCount(db)) <= 1) {
        res.status(409).json({ error: 'This is the last enabled platform administrator', code: 'LAST_PLATFORM_ADMIN' });
        return;
      }
      const data: Record<string, unknown> = {};
      if (change.role !== undefined) data.role = change.role;
      if (change.display_name !== undefined) data.display_name = change.display_name;
      if (change.disabled !== undefined) data.disabled_at = change.disabled ? new Date() : null;
      const events: Array<[string, Record<string, unknown>]> = [];
      if (change.role !== undefined && change.role !== target.role) events.push(['user.role_changed', { from: target.role, to: change.role }]);
      if (change.disabled !== undefined && change.disabled !== !!target.disabled_at) events.push([change.disabled ? 'user.disabled' : 'user.enabled', {}]);
      if (change.display_name !== undefined && change.display_name !== target.display_name) events.push(['user.renamed', {}]);
      const updated = await db.$transaction(async (tx) => {
        const row = await tx.user.update({ where: { id: target.id }, data });
        for (const [action, detail] of events) {
          await audit(tx, { action, actor: req.user, target_type: 'user', target_id: target.id, tenant_id: target.tenant_id, detail: { email: target.email, ...detail } }, { strict: true });
        }
        return row;
      });
      const tenant = await db.tenant.findUnique({ where: { id: updated.tenant_id } });
      res.json({ user: publicUser(updated, tenant?.name) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/reset-password', async (req, res, next) => {
    try {
      const target = await db.user.findUnique({ where: { id: req.params.id } });
      if (!target) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      if (target.id === req.user!.sub) {
        res.status(409).json({ error: 'Use Change password for your own account', code: 'SELF_RESET' });
        return;
      }
      const temp = temporaryPassword();
      const password_hash = await bcrypt.hash(temp, 10);
      await db.$transaction(async (tx) => {
        await tx.user.update({ where: { id: target.id }, data: { password_hash, must_change_password: true } });
        await audit(tx, { action: 'user.password_reset', actor: req.user, target_type: 'user', target_id: target.id, tenant_id: target.tenant_id, detail: { email: target.email } }, { strict: true });
      });
      res.json({ temporary_password: temp });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export function createAuditRouter(db: UsersDb) {
  const router = Router();
  router.get('/', bearerAuth, (req, res, next) => {
    if (!can(req.user?.role, 'audit.read')) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    db.auditEvent
      .findMany({ orderBy: { at: 'desc' }, take: limit })
      .then((events) => res.json({ events }))
      .catch(next);
  });
  return router;
}
