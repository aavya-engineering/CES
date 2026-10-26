// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

import { Router } from 'express';
import { z } from 'zod';
import { bearerAuth, requireRole } from '../middleware/auth.js';
import { createProgressService } from '../services/progressService.js';
import { withTenant } from '../lib/prisma.js';
import { audit } from '../lib/audit.js';

// S1.8 (migration 011): engagement details. All optional; status defaults to 'planned'.
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine((v) => !Number.isNaN(Date.parse(v)), 'Not a real date');
const detailsSchema = z.object({
  name: z.string().trim().min(1).max(200).nullable().optional(),
  reference_id: z.string().trim().min(1).max(60).nullable().optional(),
  cmmc_level: z.union([z.literal(1), z.literal(2)]).nullable().optional(),
  status: z.enum(['planned', 'in_progress', 'on_hold', 'closed']).optional(),
  start_date: isoDate.nullable().optional(),
  target_date: isoDate.nullable().optional(),
});
const datesInOrder = (d: { start_date?: string | null; target_date?: string | null }) => !d.start_date || !d.target_date || d.target_date >= d.start_date;
const DATES_MESSAGE = { message: 'Target date must be on or after the start date', path: ['target_date'] };

const createEngagementSchema = detailsSchema
  .extend({ engagement_kind: z.enum(['prime_and_subs', 'individual_contractor']) })
  .strict()
  .refine(datesInOrder, DATES_MESSAGE);
const updateEngagementSchema = detailsSchema.strict().refine(datesInOrder, DATES_MESSAGE);
const milestoneCreateSchema = z.object({ name: z.string().trim().min(1).max(200), due_date: isoDate }).strict();
const milestoneUpdateSchema = z
  .object({ name: z.string().trim().min(1).max(200).optional(), due_date: isoDate.optional(), completed: z.boolean().optional() })
  .strict();

const WRITE_ROLES = ['prime', 'bhd_operator'] as const;
const READ_ROLES = ['prime', 'bhd_operator', 'assessor_read_only'] as const;

/** Date-only column value: 'YYYY-MM-DD' → Date at UTC midnight; null clears. */
const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(`${v}T00:00:00Z`));
function detailData(d: z.infer<typeof detailsSchema>) {
  const out: Record<string, unknown> = {};
  for (const k of ['name', 'reference_id', 'cmmc_level', 'status'] as const) if (d[k] !== undefined) out[k] = d[k];
  if (d.start_date !== undefined) out.start_date = toDate(d.start_date);
  if (d.target_date !== undefined) out.target_date = toDate(d.target_date);
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createEngagementsRouter(db: any) {
  const router = Router();

  // GET /api/engagements
  router.get(
    '/',
    bearerAuth,
    requireRole('prime', 'bhd_operator', 'assessor_read_only'),
    async (req, res, next) => {
      try {
        // engagement has no RLS policy; wrap for uniformity and future policies.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const engagements = await withTenant(req.user!.tenant_id, (tx: any) =>
          tx.engagement.findMany({
            where: { tenant_id: req.user!.tenant_id },
            orderBy: { created_at: 'desc' },
          })
        , db);
        res.json(engagements);
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/engagements
  router.post(
    '/',
    bearerAuth,
    requireRole('prime', 'bhd_operator'),
    async (req, res, next) => {
      try {
        const result = createEngagementSchema.safeParse(req.body);
        if (!result.success) {
          res.status(400).json({ error: result.error.flatten() });
          return;
        }
        // engagement has no RLS policy; wrap for uniformity and future policies.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const engagement: any = await withTenant(req.user!.tenant_id, (tx: any) =>
          tx.engagement.create({
            data: {
              tenant_id: req.user!.tenant_id,
              engagement_kind: result.data.engagement_kind,
              ...detailData(result.data),
            },
          })
        , db);
        await audit(db, { action: 'engagement.created', actor: req.user, target_type: 'engagement', target_id: engagement.id, tenant_id: req.user!.tenant_id, detail: { name: engagement.name ?? null } });
        res.status(201).json(engagement);
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/engagements/:id
  router.get(
    '/:id',
    bearerAuth,
    requireRole('prime', 'bhd_operator', 'assessor_read_only'),
    async (req, res, next) => {
      try {
        // engagement has no RLS policy; wrap for uniformity and future policies.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const engagement: any = await withTenant(req.user!.tenant_id, (tx: any) =>
          tx.engagement.findUnique({
            where: { id: req.params.id },
          })
        , db);
        if (!engagement) {
          res.status(404).json({ error: 'Not found' });
          return;
        }
        // Cross-tenant guard
        if (engagement.tenant_id !== req.user!.tenant_id) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
        res.json(engagement);
      } catch (err) {
        next(err);
      }
    }
  );

  // PATCH /api/engagements/:id — S1.8: edit name, reference, level, status, dates.
  router.patch('/:id', bearerAuth, requireRole(...WRITE_ROLES), async (req, res, next) => {
    try {
      const parsed = updateEngagementSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      const tenantId = req.user!.tenant_id;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updated = await withTenant(tenantId, async (tx: any) => {
        const existing = await tx.engagement.findUnique({ where: { id: req.params.id } });
        if (!existing || existing.tenant_id !== tenantId) return null;
        const data = detailData(parsed.data);
        const start = data.start_date !== undefined ? data.start_date : existing.start_date;
        const target = data.target_date !== undefined ? data.target_date : existing.target_date;
        if (start && target && (target as Date).getTime() < (start as Date).getTime()) return 'dates' as const;
        return tx.engagement.update({ where: { id: req.params.id }, data: { ...data, updated_at: new Date() } });
      }, db);
      if (updated === null) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      if (updated === 'dates') {
        res.status(400).json({ error: DATES_MESSAGE.message });
        return;
      }
      await audit(db, { action: 'engagement.updated', actor: req.user, target_type: 'engagement', target_id: req.params.id, tenant_id: tenantId, detail: { fields: Object.keys(parsed.data) } });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  // ── S1.8 milestones: /api/engagements/:id/milestones ─────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function ownEngagement(tx: any, id: string, tenantId: string) {
    const e = await tx.engagement.findUnique({ where: { id } });
    return e && e.tenant_id === tenantId ? e : null;
  }

  router.get('/:id/milestones', bearerAuth, requireRole(...READ_ROLES), async (req, res, next) => {
    try {
      const tenantId = req.user!.tenant_id;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = await withTenant(tenantId, async (tx: any) => {
        if (!(await ownEngagement(tx, req.params.id, tenantId))) return null;
        return tx.engagementMilestone.findMany({ where: { engagement_id: req.params.id }, orderBy: { due_date: 'asc' } });
      }, db);
      if (!rows) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/milestones', bearerAuth, requireRole(...WRITE_ROLES), async (req, res, next) => {
    try {
      const parsed = milestoneCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      const tenantId = req.user!.tenant_id;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = await withTenant(tenantId, async (tx: any) => {
        if (!(await ownEngagement(tx, req.params.id, tenantId))) return null;
        return tx.engagementMilestone.create({
          data: { tenant_id: tenantId, engagement_id: req.params.id, name: parsed.data.name, due_date: toDate(parsed.data.due_date), created_by: req.user!.sub },
        });
      }, db);
      if (!row) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      await audit(db, { action: 'milestone.created', actor: req.user, target_type: 'milestone', target_id: row.id, tenant_id: tenantId, detail: { engagement_id: req.params.id, name: row.name } });
      res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id/milestones/:mid', bearerAuth, requireRole(...WRITE_ROLES), async (req, res, next) => {
    try {
      const parsed = milestoneUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.flatten() });
        return;
      }
      const tenantId = req.user!.tenant_id;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = await withTenant(tenantId, async (tx: any) => {
        const m = await tx.engagementMilestone.findUnique({ where: { id: req.params.mid } });
        if (!m || m.engagement_id !== req.params.id || !(await ownEngagement(tx, req.params.id, tenantId))) return null;
        const data: Record<string, unknown> = {};
        if (parsed.data.name !== undefined) data.name = parsed.data.name;
        if (parsed.data.due_date !== undefined) data.due_date = toDate(parsed.data.due_date);
        if (parsed.data.completed !== undefined) data.completed_at = parsed.data.completed ? new Date() : null;
        return tx.engagementMilestone.update({ where: { id: req.params.mid }, data });
      }, db);
      if (!row) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      await audit(db, {
        action: parsed.data.completed ? 'milestone.completed' : 'milestone.updated',
        actor: req.user,
        target_type: 'milestone',
        target_id: row.id,
        tenant_id: tenantId,
        detail: { engagement_id: req.params.id, name: row.name },
      });
      res.json(row);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id/milestones/:mid', bearerAuth, requireRole(...WRITE_ROLES), async (req, res, next) => {
    try {
      const tenantId = req.user!.tenant_id;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = await withTenant(tenantId, async (tx: any) => {
        const m = await tx.engagementMilestone.findUnique({ where: { id: req.params.mid } });
        if (!m || m.engagement_id !== req.params.id || !(await ownEngagement(tx, req.params.id, tenantId))) return null;
        await tx.engagementMilestone.delete({ where: { id: req.params.mid } });
        return m;
      }, db);
      if (!row) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      await audit(db, { action: 'milestone.deleted', actor: req.user, target_type: 'milestone', target_id: row.id, tenant_id: tenantId, detail: { engagement_id: req.params.id, name: row.name } });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // GET /api/engagements/:id/progress
  router.get(
    '/:id/progress',
    bearerAuth,
    requireRole('prime', 'bhd_operator', 'assessor_read_only'),
    async (req, res, next) => {
      try {
        // engagement check uses plain db (no RLS on engagements)
        const engagement = await db.engagement.findUnique({
          where: { id: req.params.id },
        });
        if (!engagement) {
          res.status(404).json({ error: 'Not found' });
          return;
        }
        if (engagement.tenant_id !== req.user!.tenant_id) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
        // progressService reads parties (RLS-protected) — must run inside withTenant
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const progress = await withTenant(req.user!.tenant_id, (tx: any) =>
          createProgressService(tx).getEngagementProgress(req.params.id)
        , db);
        res.json(progress);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
