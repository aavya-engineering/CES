// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// portfolio.ts — S1.8: GET /api/portfolio?days=30 for the Home / Portfolio
// dashboard (doc 28). BHD operator and prime: the engagements of their own
// tenant (the same scope as GET /api/engagements). Platform administrator:
// counts only, no names or readiness (decision D-1).
import { Router } from 'express';
import { bearerAuth, requireRole } from '../middleware/auth.js';
import { withTenant } from '../lib/prisma.js';
import { buildPortfolio, countsOnly, type AuditRow, type EngagementRow, type MilestoneRow, type PartyRow } from '../services/portfolioService.js';

export const PORTFOLIO_ROLES = ['bhd_operator', 'prime'] as const;
export const PORTFOLIO_COUNT_ROLES = ['platform_admin'] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadPortfolioRows(db: any, tenantId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return withTenant(tenantId, async (tx: any) => {
    const engagements: EngagementRow[] = await tx.engagement.findMany({ where: { tenant_id: tenantId }, orderBy: { created_at: 'desc' } });
    const ids = engagements.map((e) => e.id);
    const parties: PartyRow[] = ids.length ? await tx.party.findMany({ where: { engagement_id: { in: ids } } }) : [];
    const milestones: MilestoneRow[] = ids.length ? await tx.engagementMilestone.findMany({ where: { engagement_id: { in: ids } } }) : [];
    const audit: AuditRow[] = await tx.auditEvent.findMany({
      where: { tenant_id: tenantId, OR: [{ action: { startsWith: 'engagement.' } }, { action: { startsWith: 'milestone.' } }] },
      orderBy: { at: 'desc' },
      take: 20,
    });
    const actorIds = [...new Set(audit.map((a) => a.actor_user_id).filter(Boolean) as string[])];
    const users: { id: string; display_name: string | null; email: string }[] = actorIds.length
      ? await tx.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, display_name: true, email: true } })
      : [];
    return { engagements, parties, milestones, audit, actorNames: new Map(users.map((u) => [u.id, u.display_name ?? u.email])) };
  }, db);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createPortfolioRouter(db: any, now: () => Date = () => new Date()) {
  const router = Router();
  router.get('/', bearerAuth, requireRole(...PORTFOLIO_ROLES, ...PORTFOLIO_COUNT_ROLES), async (req, res, next) => {
    try {
      const raw = Number(req.query.days ?? 30);
      const days = [7, 30, 90, 365].includes(raw) ? raw : 30;
      const rows = await loadPortfolioRows(db, req.user!.tenant_id);
      const portfolio = buildPortfolio(rows, { today: now(), days });
      res.json(req.user!.role === 'platform_admin' ? countsOnly(portfolio) : portfolio);
    } catch (err) {
      next(err);
    }
  });
  return router;
}
