// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// monitorScheduler.ts — in-process scheduled monitoring (2026-11-10).
//
// Every tick (default 15 min) it looks at every tenant's settings
// (system.monitoring_cadence_hours, default 24; evidence_currency_days,
// default 365) and evaluates each engagement that is not closed/on hold and
// whose last snapshot is older than the cadence. Each evaluation runs inside
// withTenant(tenant) — the loop crosses tenants only to find work; it never
// reads customer rows outside that tenant's RLS context. The actor is the
// system principal `scheduler` (role bhd_operator-equivalent for audit only).
// Off unless MONITOR_SCHEDULER=1 (or opts.enabled); POST /monitor/evaluate
// keeps working regardless. Errors are logged per engagement and never stop
// the tick.

import { withTenant } from '../lib/prisma.js';
import { evaluateEngagement } from './monitorEvaluate.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface MonitorSchedulerOptions {
  db: Db;
  /** Wall-clock gap between ticks. Default 15 minutes. */
  intervalMs?: number;
  now?: () => Date;
  log?: { info: (o: unknown, msg: string) => void; warn: (o: unknown, msg: string) => void };
  /** Test seam. */
  evaluate?: typeof evaluateEngagement;
}

export interface TickReport { tenants: number; considered: number; evaluated: number; skipped_fresh: number; failed: { engagement_id: string; error: string }[]; at: string }

export interface MonitorScheduler {
  start(): void;
  stop(): void;
  tick(): Promise<TickReport>;
  status(): { enabled: boolean; interval_ms: number; last_tick_at: string | null; last_report: TickReport | null; ticks: number };
}

export const SCHEDULER_ACTOR = { sub: 'scheduler', role: 'bhd_operator', tenant_id: '' };
const ACTIVE = new Set(['planned', 'in_progress']);

export function createMonitorScheduler(opts: MonitorSchedulerOptions): MonitorScheduler {
  const intervalMs = opts.intervalMs ?? 15 * 60_000;
  const now = opts.now ?? (() => new Date());
  const evaluate = opts.evaluate ?? evaluateEngagement;
  const log = opts.log ?? { info: () => {}, warn: () => {} };
  let timer: NodeJS.Timeout | null = null;
  let ticking = false;
  let ticks = 0;
  let lastTick: string | null = null;
  let lastReport: TickReport | null = null;

  async function tick(): Promise<TickReport> {
    const at = now();
    const report: TickReport = { tenants: 0, considered: 0, evaluated: 0, skipped_fresh: 0, failed: [], at: at.toISOString() };
    if (ticking) return report; // never overlap
    ticking = true;
    try {
      const tenants: { id: string }[] = await opts.db.tenant.findMany({});
      report.tenants = tenants.length;
      for (const tenant of tenants) {
        const settings: { system?: unknown } | null = await withTenant(tenant.id, (t: Db) => t.tenantSettings.findUnique({ where: { tenant_id: tenant.id } }), opts.db);
        const system = (settings?.system ?? {}) as { monitoring_cadence_hours?: number; evidence_currency_days?: number };
        const cadenceMs = (system.monitoring_cadence_hours ?? 24) * 3_600_000;
        const engagements: { id: string; status: string }[] = await withTenant(tenant.id, (t: Db) => t.engagement.findMany({ where: { tenant_id: tenant.id } }), opts.db);
        for (const e of engagements) {
          if (!ACTIVE.has(e.status ?? 'planned')) continue;
          report.considered++;
          const snaps: { taken_at: Date }[] = await withTenant(tenant.id, (t: Db) => t.monitorSnapshot.findMany({ where: { engagement_id: e.id } }), opts.db);
          const last = snaps.reduce<number>((m, s) => Math.max(m, +new Date(s.taken_at)), 0);
          if (last && at.getTime() - last < cadenceMs) { report.skipped_fresh++; continue; }
          try {
            await evaluate(opts.db, { tenant_id: tenant.id, engagement_id: e.id, actor: { ...SCHEDULER_ACTOR, tenant_id: tenant.id }, now: at, evidenceCurrencyDays: system.evidence_currency_days ?? 365 });
            report.evaluated++;
          } catch (err) {
            report.failed.push({ engagement_id: e.id, error: err instanceof Error ? err.message : String(err) });
            log.warn({ tenant_id: tenant.id, engagement_id: e.id, err }, 'scheduled monitoring failed for engagement');
          }
        }
      }
    } finally {
      ticking = false;
      ticks++;
      lastTick = at.toISOString();
      lastReport = report;
      log.info(report, 'monitor scheduler tick');
    }
    return report;
  }

  return {
    start() { if (timer) return; timer = setInterval(() => { void tick(); }, intervalMs); timer.unref?.(); void tick(); },
    stop() { if (timer) clearInterval(timer); timer = null; },
    tick,
    status: () => ({ enabled: timer !== null, interval_ms: intervalMs, last_tick_at: lastTick, last_report: lastReport, ticks }),
  };
}
