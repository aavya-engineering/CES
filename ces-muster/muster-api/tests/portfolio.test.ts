// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// S1.8 (doc 28): Home / Portfolio — the health and milestone rules, engagement
// details and milestone CRUD (validation, tenant scope, audit), and the
// portfolio endpoint (operator full view, platform administrator counts only).
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'node:http';
import { createFakePortfolioDb } from './support/fakePortfolioDb.js';
import { createEngagementsRouter } from '../src/routes/engagements.js';
import { createPortfolioRouter } from '../src/routes/portfolio.js';
import { buildPortfolio, healthOf, milestoneState, type EngagementRow, type MilestoneRow } from '../src/services/portfolioService.js';
import { mintToken } from '../src/lib/jwt.js';

const TODAY = new Date('2026-10-25T09:00:00Z');
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const eng = (over: Partial<EngagementRow> = {}): EngagementRow => ({
  id: 'e1', engagement_kind: 'individual_contractor', name: 'Alpha', reference_id: null, cmmc_level: 2, status: 'in_progress', start_date: null, target_date: null, created_at: d('2026-10-01'), ...over,
});
const ms = (due: string, done = false): MilestoneRow => ({ id: `m-${due}`, engagement_id: 'e1', name: `M ${due}`, due_date: d(due), completed_at: done ? TODAY : null });

describe('rules', () => {
  test('health: closed, overdue, on hold / overdue milestone → at risk, otherwise on track', () => {
    expect(healthOf(eng({ status: 'closed', target_date: d('2026-01-01') }), [], TODAY)).toBe('closed');
    expect(healthOf(eng({ target_date: d('2026-10-24') }), [], TODAY)).toBe('overdue');
    expect(healthOf(eng({ target_date: d('2026-10-25') }), [], TODAY)).toBe('on_track');
    expect(healthOf(eng({ status: 'on_hold' }), [], TODAY)).toBe('at_risk');
    expect(healthOf(eng(), [ms('2026-10-20')], TODAY)).toBe('at_risk');
    expect(healthOf(eng(), [ms('2026-10-20', true)], TODAY)).toBe('on_track');
  });

  test('milestone state: overdue, due within 7 days, upcoming', () => {
    expect(milestoneState(ms('2026-10-24'), TODAY)).toBe('overdue');
    expect(milestoneState(ms('2026-11-01'), TODAY)).toBe('due_soon');
    expect(milestoneState(ms('2026-11-02'), TODAY)).toBe('upcoming');
  });

  test('portfolio: organisations counted once, readiness from completed interviews, TBD modules are null', () => {
    const p = buildPortfolio(
      {
        engagements: [eng(), eng({ id: 'e2', name: null, reference_id: 'ENG-2', cmmc_level: 1, status: 'closed', created_at: d('2026-01-01') })],
        parties: [
          { id: 'p1', engagement_id: 'e1', name: 'Apex', lifecycle: 'complete', created_at: d('2026-10-02'), last_activity_at: d('2026-10-10') },
          { id: 'p2', engagement_id: 'e2', name: 'apex ', lifecycle: 'in_progress', created_at: d('2026-01-02'), last_activity_at: null },
        ],
        milestones: [ms('2026-11-30'), ms('2026-10-01', true)],
        audit: [],
        actorNames: new Map(),
      },
      { today: TODAY, days: 30 }
    );
    expect(p.totals).toMatchObject({ organisations: 1, organisations_new: 0, engagements: 2, engagements_new: 1, on_track: 1, closed: 1 });
    expect(p.by_level).toEqual({ level_1: 1, level_2: 1, not_set: 0 });
    expect(p.readiness).toEqual({ muster: { complete: 1, total: 2, pct: 50 }, stamper: null, adminops: null, evidenceops: null });
    expect(p.engagements.find((e) => e.id === 'e2')!.name).toBe('ENG-2');
    expect(p.milestones.map((m) => m.name)).toEqual(['M 2026-11-30']);
    expect(p.activity.map((a) => a.activity)).toContain('Completed interview');
  });
});

describe('routes', () => {
  const fake = createFakePortfolioDb();
  let server: http.Server;
  let base: string;
  const tok = (sub: string, role: string, tenant = 't-1') => mintToken({ sub, tenant_id: tenant, party_id: null, role });
  const OP = tok('op-1', 'bhd_operator');
  const OTHER = tok('op-2', 'bhd_operator', 't-2');
  const ADMIN = tok('pa-1', 'platform_admin');
  const SUB = tok('sub-1', 'sub');

  async function call(token: string, method: string, path: string, body?: unknown) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  beforeAll(() => {
    const app = express();
    app.use(express.json());
    app.use('/api/portfolio', createPortfolioRouter(fake, () => TODAY));
    app.use('/api/engagements', createEngagementsRouter(fake));
    app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(500).json({ error: err.message }));
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => server?.close());

  let id = '';
  test('create with details; bad dates and unknown fields are refused', async () => {
    const bad = await call(OP, 'POST', '/api/engagements', { engagement_kind: 'individual_contractor', start_date: '2026-11-01', target_date: '2026-10-01' });
    expect(bad.status).toBe(400);
    expect((await call(OP, 'POST', '/api/engagements', { engagement_kind: 'individual_contractor', cmmc_level: 3 })).status).toBe(400);
    expect((await call(OP, 'POST', '/api/engagements', { engagement_kind: 'individual_contractor', colour: 'red' })).status).toBe(400);
    const ok = await call(OP, 'POST', '/api/engagements', { engagement_kind: 'individual_contractor', name: 'Apex CMMC Assessment', reference_id: 'ENG-2026-001', cmmc_level: 2, start_date: '2026-10-01', target_date: '2026-12-15' });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('planned');
    id = ok.body.id;
    expect(fake.auditEvent.rows.some((a) => a.action === 'engagement.created' && a.target_id === id)).toBe(true);
  });

  test('PATCH edits; a target date before the stored start date is refused', async () => {
    expect((await call(OP, 'PATCH', `/api/engagements/${id}`, { status: 'in_progress' })).body.status).toBe('in_progress');
    expect((await call(OP, 'PATCH', `/api/engagements/${id}`, { target_date: '2026-09-01' })).status).toBe(400);
    expect((await call(OTHER, 'PATCH', `/api/engagements/${id}`, { status: 'closed' })).status).toBe(404);
    expect((await call(SUB, 'PATCH', `/api/engagements/${id}`, { status: 'closed' })).status).toBe(403);
  });

  test('milestones: add, complete, rename, delete — and another tenant sees none', async () => {
    const a = await call(OP, 'POST', `/api/engagements/${id}/milestones`, { name: 'Readiness Review', due_date: '2026-11-15' });
    expect(a.status).toBe(201);
    expect((await call(OP, 'POST', `/api/engagements/${id}/milestones`, { name: ' ', due_date: '2026-11-15' })).status).toBe(400);
    const done = await call(OP, 'PATCH', `/api/engagements/${id}/milestones/${a.body.id}`, { completed: true });
    expect(done.body.completed_at).not.toBeNull();
    expect((await call(OP, 'PATCH', `/api/engagements/${id}/milestones/${a.body.id}`, { completed: false, name: 'Readiness review' })).body).toMatchObject({ completed_at: null, name: 'Readiness review' });
    expect((await call(OTHER, 'GET', `/api/engagements/${id}/milestones`)).status).toBe(404);
    expect((await call(OP, 'GET', `/api/engagements/${id}/milestones`)).body).toHaveLength(1);
    expect((await call(OP, 'DELETE', `/api/engagements/${id}/milestones/${a.body.id}`)).status).toBe(204);
    expect((await call(OP, 'GET', `/api/engagements/${id}/milestones`)).body).toHaveLength(0);
    expect(fake.auditEvent.rows.map((r) => r.action)).toEqual(expect.arrayContaining(['milestone.created', 'milestone.completed', 'milestone.updated', 'milestone.deleted']));
  });

  test('portfolio: operator sees names; platform administrator sees counts only; sub is refused', async () => {
    await call(OP, 'POST', `/api/engagements/${id}/milestones`, { name: 'Final Assessment', due_date: '2026-12-15' });
    const op = await call(OP, 'GET', '/api/portfolio?days=90');
    expect(op.status).toBe(200);
    expect(op.body.range_days).toBe(90);
    expect(op.body.engagements[0]).toMatchObject({ name: 'Apex CMMC Assessment', health: 'on_track', cmmc_level: 2 });
    expect(op.body.milestones[0]).toMatchObject({ name: 'Final Assessment', state: 'upcoming' });
    expect(op.body.activity.length).toBeGreaterThan(0);

    const admin = await call(ADMIN, 'GET', '/api/portfolio');
    expect(admin.status).toBe(200);
    expect(admin.body.restricted).toBe(true);
    expect(admin.body.engagements).toBeUndefined();
    expect(JSON.stringify(admin.body)).not.toContain('Apex');

    expect((await call(SUB, 'GET', '/api/portfolio')).status).toBe(403);
    expect((await call(OTHER, 'GET', '/api/portfolio')).body.totals.engagements).toBe(0);
  });
});
