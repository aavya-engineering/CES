// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// monitorScheduler.test.ts — scheduled monitoring honours each tenant's cadence,
// skips closed engagements and fresh snapshots, runs inside the tenant, never dies on one failure.

import { describe, it, expect, beforeEach } from 'vitest';
import { createMonitorScheduler, SCHEDULER_ACTOR } from '../src/services/monitorScheduler.js';
import { createMockDb } from './helpers/mockDb.js';

const T1 = '00000000-aaaa-0000-0000-000000000001';
const T2 = '00000000-aaaa-0000-0000-000000000002';
let db: ReturnType<typeof createMockDb>;
const NOW = new Date('2026-11-10T12:00:00Z');

beforeEach(async () => {
  db = createMockDb();
  await db.tenant.create({ data: { id: T1, name: 'Contoso' } });
  await db.tenant.create({ data: { id: T2, name: 'Fabrikam' } });
  await db.tenantSettings.create({ data: { tenant_id: T1, system: { monitoring_cadence_hours: 6 } } });
  await db.engagement.create({ data: { id: 'e1', tenant_id: T1, status: 'in_progress', engagement_kind: 'prime_only' } });
  await db.engagement.create({ data: { id: 'e2', tenant_id: T1, status: 'closed', engagement_kind: 'prime_only' } });
  await db.engagement.create({ data: { id: 'e3', tenant_id: T2, status: 'planned', engagement_kind: 'prime_only' } });
  await db.engagement.create({ data: { id: 'e4', tenant_id: T2, status: 'in_progress', engagement_kind: 'prime_only' } });
  // e3 was evaluated 10 h ago: fresh for T2 (default 24 h) — would be stale for T1's 6 h cadence.
  await db.monitorSnapshot.create({ data: { tenant_id: T2, engagement_id: 'e3', taken_at: new Date(NOW.getTime() - 10 * 3_600_000) } });
});

describe('monitor scheduler', () => {
  it('evaluates due engagements per tenant cadence with the system actor, skips closed + fresh, isolates failures', async () => {
    const calls: { tenant_id: string; engagement_id: string; actor: { sub: string }; evidenceCurrencyDays?: number }[] = [];
    const s = createMonitorScheduler({ db, now: () => NOW, evaluate: async (_db, ctx) => { calls.push(ctx); if (ctx.engagement_id === 'e4') throw new Error('boom'); return { created: 0, updated: 0, cleared: 0, expired_evidence: 0, open: 0, snapshot: null }; } });
    const r = await s.tick();
    expect(r).toMatchObject({ tenants: 2, considered: 3, evaluated: 1, skipped_fresh: 1 });
    expect(r.failed).toEqual([{ engagement_id: 'e4', error: 'boom' }]);
    expect(calls.map((c) => c.engagement_id).sort()).toEqual(['e1', 'e4']);
    expect(calls[0].actor.sub).toBe(SCHEDULER_ACTOR.sub);
    expect(calls[0].tenant_id).toBe(T1);
    expect(calls[0].evidenceCurrencyDays).toBe(365);
    expect(s.status()).toMatchObject({ enabled: false, ticks: 1, last_tick_at: NOW.toISOString() });
  });

  it('a snapshot older than the tenant cadence makes the engagement due again', async () => {
    await db.monitorSnapshot.create({ data: { tenant_id: T1, engagement_id: 'e1', taken_at: new Date(NOW.getTime() - 7 * 3_600_000) } });
    const seen: string[] = [];
    const s = createMonitorScheduler({ db, now: () => NOW, evaluate: async (_db, ctx) => { seen.push(ctx.engagement_id); return { created: 0, updated: 0, cleared: 0, expired_evidence: 0, open: 0, snapshot: null }; } });
    await s.tick();
    expect(seen).toContain('e1'); // 7 h > 6 h cadence
    s.start(); s.stop();
    expect(s.status().enabled).toBe(false);
  });
});
