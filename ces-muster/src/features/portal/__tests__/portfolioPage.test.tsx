// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// S1.8 (SPA): Home / Portfolio — renders the wireframe sections from
// GET /api/portfolio, sends the chosen time range, and shows a platform
// administrator counts only. Only global fetch is faked.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PortfolioPage, { type PortfolioData } from '../PortfolioPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const totals = { organisations: 4, organisations_new: 1, engagements: 5, engagements_new: 2, open: 4, on_track: 2, at_risk: 1, overdue: 1, closed: 1 };
const FULL: PortfolioData = {
  generated_at: '2026-10-25T04:00:00Z',
  range_days: 30,
  totals,
  by_level: { level_1: 1, level_2: 4, not_set: 0 },
  readiness: { muster: { complete: 1, total: 4, pct: 25 }, stamper: null, adminops: null, evidenceops: null },
  engagements: [{ id: 'e1', name: 'Apex CMMC Assessment', reference_id: 'ENG-1', organisation: 'Apex Defense', cmmc_level: 2, status: 'in_progress', health: 'at_risk', target_date: '2026-12-15', progress: { complete: 0, total: 1, pct: 0 } }],
  milestones: [{ id: 'm1', engagement: 'Apex CMMC Assessment', name: 'Readiness review', due_date: '2026-10-28', state: 'due_soon' }],
  activity: [{ at: '2026-10-24T10:00:00Z', user: 'Operator', activity: 'Added milestone', details: 'Apex CMMC Assessment – Readiness review' }],
};

describe('Home / Portfolio', () => {
  let host: HTMLDivElement;
  let root: Root;
  const urls: string[] = [];
  const serve = (body: unknown) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(String(url));
        return new Response(JSON.stringify(body), { status: 200 });
      })
    );
  beforeEach(() => {
    urls.length = 0;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
  const text = (id: string) => host.querySelector(`[data-testid="${id}"]`)?.textContent ?? '';

  it('shows KPIs, charts, engagements, milestones, activity and quick links', async () => {
    serve(FULL);
    await act(async () => root.render(<PortfolioPage go={() => {}} openMuster={() => {}} />));
    await act(async () => {});
    expect(text('kpi-tenants')).toContain('4');
    expect(text('kpi-engagements')).toContain('↑2');
    expect(text('kpi-at-risk')).toContain('20% of total');
    expect(text('chart-status')).toContain('Overdue');
    expect(text('chart-levels')).toContain('Level 2');
    expect(text('chart-levels')).not.toContain('Level 3');
    expect(text('readiness')).toContain('25%');
    expect(text('readiness')).toContain('TBD');
    expect(text('portfolio-engagements')).toContain('Apex Defense');
    expect(text('portfolio-engagements')).toContain('At Risk');
    expect(text('portfolio-milestones')).toContain('Due soon');
    expect(text('portfolio-activity')).toContain('Added milestone');
    expect(host.querySelector('[data-testid="quick-muster"]')).not.toBeNull();
  });

  it('asks for the chosen time range', async () => {
    serve(FULL);
    await act(async () => root.render(<PortfolioPage go={() => {}} openMuster={() => {}} />));
    const sel = host.querySelector('[data-testid="portfolio-range"]') as HTMLSelectElement;
    await act(async () => {
      sel.value = '90';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(urls.some((u) => u.endsWith('/portfolio?days=90'))).toBe(true);
  });

  it('platform administrator: counts and charts only, no customer names or readiness', async () => {
    serve({ generated_at: FULL.generated_at, range_days: 30, restricted: true, totals, by_level: FULL.by_level });
    await act(async () => root.render(<PortfolioPage go={() => {}} openMuster={() => {}} />));
    await act(async () => {});
    expect(text('kpi-engagements')).toContain('5');
    expect(host.querySelector('[data-testid="portfolio-restricted"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="portfolio-engagements"]')).toBeNull();
    expect(host.querySelector('[data-testid="readiness"]')).toBeNull();
  });
});
