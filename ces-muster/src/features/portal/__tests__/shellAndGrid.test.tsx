// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// S1.4 (SPA): wireframe shell and standard data grid — sidebar sub-groups,
// top-bar search hand-off, and sort / select / columns / rows-per-page on the
// 110 Requirements table (offline viewer: no network call).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { navFor, routesFor, type Viewer } from '../nav';
import { searchHits, setPendingSearch, takePendingSearch } from '../searchHandoff';
import RequirementsPage from '../pages/RequirementsPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const op: Viewer = { kind: 'signed-in', role: 'bhd_operator' };

describe('S1.4 sidebar follows the wireframe tree', () => {
  it('CES-Shared groups: Reference Data, Standard Evidence & Evaluation Rules, Contract Validation', () => {
    const shared = navFor(op).find((s) => s.id === 'shared')!;
    const groups = [...new Set(shared.items.map((i) => i.group).filter(Boolean))];
    expect(groups).toEqual(['Reference Data', 'Standard Evidence & Evaluation Rules', 'Contract Validation', 'Evidence Store']);
    expect(shared.items.filter((i) => i.group === 'Contract Validation').map((i) => i.label)).toEqual(['Golden Files', 'Contract Tests', 'Version Compatibility']);
  });

  it('Engagements: Tenant Registration, All Engagements, Create Engagement, Engagement Workspace', () => {
    const eng = navFor(op).find((s) => s.id === 'engagements')!;
    expect(eng.items.map((i) => i.label)).toEqual(['Tenant Registration', 'All Engagements', 'Create Engagement', 'Engagement Workspace']);
  });
});

describe('S1.4 top-bar search', () => {
  it('finds requirements by ID or text and offers the other CES-Shared lists', () => {
    const hits = searchHits('3.1.1', routesFor(op));
    expect(hits[0]).toMatchObject({ route: 'shared/requirements', q: 'AC.L1-3.1.1' });
    expect(hits.map((h) => h.route)).toEqual(expect.arrayContaining(['shared/evidence', 'shared/mapping', 'shared/rules']));
  });

  it('offers nothing for one character, and never a route the viewer cannot open', () => {
    expect(searchHits('a', routesFor(op))).toEqual([]);
    const only = new Set(['shared/requirements'] as const);
    expect(searchHits('access', only).every((h) => h.route === 'shared/requirements')).toBe(true);
  });

  it('hands the query to the page it opens', () => {
    setPendingSearch('shared/mapping', 'MFA');
    expect(takePendingSearch('shared/mapping')).toBe('MFA');
    expect(takePendingSearch('shared/rules')).toBe('');
  });
});

describe('S1.4 standard grid on 110 Requirements', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const ids = () => [...host.querySelectorAll('[data-testid="req-table"] tbody tr td:nth-child(2) .row-btn')].map((b) => b.textContent);
  const click = (el: Element | null) => act(() => (el as HTMLElement).click());

  it('sorts, selects, hides columns and changes rows per page', () => {
    act(() => root.render(<RequirementsPage />));
    expect(ids()).toHaveLength(10);

    // Retesting #13 (2026-10-29): the mockup's columns are the default — Type and
    // Weight are off until chosen in Columns; Security Family is on.
    const headers = () => [...host.querySelectorAll('[data-testid="req-table"] th')].map((t) => t.textContent);
    expect(headers()).toContain('Security Family');
    expect(headers()).not.toContain('Weight');
    expect(host.querySelector('[data-testid="sort-weight"]')).toBeNull();
    click(host.querySelector('[data-testid="req-columns"]'));
    click(host.querySelector('[data-testid="col-toggle-weight"]'));
    click(host.querySelector('[data-testid="col-toggle-type"]'));
    expect(headers()).toContain('Type');

    click(host.querySelector('[data-testid="sort-weight"]'));
    click(host.querySelector('[data-testid="sort-weight"]'));
    expect(host.querySelector('th[aria-sort="descending"]')).not.toBeNull();
    // Retesting #15: the arrow is shown on the sorted column only.
    expect(host.querySelectorAll('.th-sort-ind')).toHaveLength(1);
    expect(host.querySelector('[data-testid="req-table"] tbody tr td.num .pill')?.textContent).toBe('5');

    click(host.querySelector('input[aria-label="Select all requirements"]'));
    expect(host.querySelector('[data-testid="req-export"]')?.textContent).toContain('Export 110 selected');

    // the Columns menu is still open from above
    click(host.querySelector('[data-testid="col-toggle-type"]'));
    expect(headers()).not.toContain('Type');

    const sel = host.querySelector('[data-testid="rows-per-page"]') as HTMLSelectElement;
    act(() => {
      sel.value = '25';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(ids()).toHaveLength(25);
  });

  it('opens with the query the top-bar search left for it', () => {
    setPendingSearch('shared/requirements', 'AC.L2-3.1.5');
    act(() => root.render(<RequirementsPage />));
    expect(ids()).toEqual(['AC.L2-3.1.5']);
  });
});

describe('S1.9 sidebar from the Create Requirement mockup', () => {
  it('adds Contract Registry, Version Compatibility, Interfaces and Evidence Store; modules come before Engagements', () => {
    const ids = navFor(op).map((s) => s.id);
    expect(ids.indexOf('evidenceops')).toBeLessThan(ids.indexOf('engagements'));
    const shared = navFor(op).find((s) => s.id === 'shared')!;
    expect(shared.items.map((i) => i.label)).toEqual(expect.arrayContaining(['Contract Registry', 'Version Compatibility', 'Interfaces', 'Storage Integrity']));
  });
  it('a platform administrator does not get the Evidence Store (customer evidence)', () => {
    const shared = navFor({ kind: 'signed-in', role: 'platform_admin' }).find((s) => s.id === 'shared')!;
    expect(shared.items.some((i) => i.group === 'Evidence Store')).toBe(false);
  });
});
