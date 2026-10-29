// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// S1.2 (SPA): CES-Shared edit screens — CSV export/import planning, the
// governance bar (no self-approval in the UI), status labels, and the catalog
// page's add flow against a faked muster-api. Production components; only
// global fetch is faked.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseCsv, planImport, requirementsCsv, requirementsViewCsv } from '../requirementCsvData';
import { REQUIREMENTS } from '../referenceData';
import { SharedViewerContext, statusOf } from '../governedState';
import { DeleteItemDialog, GovernanceBar } from '../governed';
import CatalogPage from '../pages/shared/CatalogPage';
import type { ItemView, RequirementMeta } from '@/shared/api/sharedApi';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const known = new Set(REQUIREMENTS.map((r) => r.control_id));
const row = (status: 'draft' | 'published', version: number, by = 'u-a') => ({
  id: `id-${status}-${version}`,
  kind: 'requirement_meta' as const,
  item_key: 'AC.L1-3.1.1',
  version,
  status,
  data: { control_id: 'AC.L1-3.1.1', priority: 'high', modules: ['muster'], implementation_guidance: '' } as RequirementMeta,
  created_by: by,
  created_at: '2026-10-24T10:00:00Z',
  updated_by: by,
  updated_at: '2026-10-24T10:00:00Z',
  published_by: status === 'published' ? 'u-b' : null,
  published_at: status === 'published' ? '2026-10-24T10:00:00Z' : null,
  retired_by: null,
  retired_at: null,
});

describe('CSV', () => {
  it('export quotes commas and quotes, and parses back to the same cells', () => {
    const csv = requirementsCsv(REQUIREMENTS.slice(0, 3), () => ({ control_id: 'x', priority: 'low', modules: ['muster', 'adminops'], implementation_guidance: 'Use "MFA", always' }));
    const rows = parseCsv(csv);
    expect(rows[0][0]).toBe('control_id');
    expect(rows).toHaveLength(4);
    expect(rows[1][6]).toBe('low');
    expect(rows[1][7]).toBe('muster;adminops');
    expect(rows[1][8]).toBe('Use "MFA", always');
    expect(rows[1][9]).toBe(REQUIREMENTS[0].practice);
  });

  it('QA #4/#5: the table export uses the table column names, only the visible columns, and re-imports', () => {
    const meta = () => ({ control_id: 'x', priority: 'high' as const, modules: ['muster' as const], implementation_guidance: '' });
    const csv = requirementsViewCsv(REQUIREMENTS.slice(0, 2), meta, ['id', 'title', 'family', 'priority', 'modules']);
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(['Req ID', 'Requirement Title', 'Control Family', 'Priority', 'Used In Modules']);
    expect(rows[1][0]).toBe(REQUIREMENTS[0].control_id);
    expect(rows[1][2]).toBe(`${REQUIREMENTS[0].family} - ${REQUIREMENTS[0].family_name}`);
    expect(rows[1][3]).toBe('High');
    expect(rows[1][4]).toBe('Muster');
    // the same file goes back through the importer (headers are aliased)
    const plan = planImport(csv, new Set(REQUIREMENTS.map((r) => r.control_id)), new Map());
    expect(plan.headerError).toBeNull();
    expect(plan.lines.map((l) => l.status)).toEqual(['change', 'change']);
  });

  it('import plan: changes, unchanged rows and errors; locked columns are ignored', () => {
    const existing = new Map<string, ItemView<RequirementMeta>>([
      ['AC.L1-3.1.2', { kind: 'requirement_meta', key: 'AC.L1-3.1.2', published: row('published', 1) as never, draft: null, retired: null, current: { control_id: 'AC.L1-3.1.2', priority: 'low', modules: [], implementation_guidance: '' }, status: 'published' }],
    ]);
    const text = [
      'control_id,priority,modules,implementation_guidance,sprs_weight',
      'AC.L1-3.1.1,High,muster;stamper,Check CA,1',
      'AC.L1-3.1.2,low,,,5',
      'AC.L2-3.9.99,high,,,',
      'AC.L2-3.1.3,urgent,,,',
      'AC.L2-3.1.4,,evidenceops;cloud,,',
      'AC.L1-3.1.1,low,,,',
    ].join('\n');
    const { lines, headerError } = planImport(text, known, existing);
    expect(headerError).toBeNull();
    expect(lines.map((l) => l.status)).toEqual(['change', 'unchanged', 'error', 'error', 'error', 'error']);
    const first = lines[0];
    expect(first.status === 'change' && first.data).toEqual({ control_id: 'AC.L1-3.1.1', priority: 'high', modules: ['muster', 'stamper'], implementation_guidance: 'Check CA' });
    expect(first.status === 'change' && first.isNew).toBe(true);
    expect(lines.map((l) => (l.status === 'error' ? l.message : ''))).toEqual(['', '', 'Not one of the 110. To add an organisation-defined requirement, fill the title column', 'Priority "urgent" must be High, Medium, Low or empty', 'Unknown module "cloud"', 'Listed twice']);
    expect(planImport('priority\nhigh', known, existing).headerError).toMatch(/control_id/);
  });
});

describe('governance UI', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  const view = (draftBy: string): ItemView<RequirementMeta> => ({
    kind: 'requirement_meta',
    key: 'AC.L1-3.1.1',
    published: row('published', 1) as never,
    draft: row('draft', 2, draftBy) as never,
    retired: null,
    current: row('published', 1).data,
    status: 'published',
  });

  it('labels: published with a pending draft', () => {
    expect(statusOf(view('u-a')).label).toBe('Published · draft pending');
  });

  it('the draft author cannot publish; another administrator can', () => {
    act(() =>
      root.render(
        <SharedViewerContext.Provider value={{ signedIn: true, canEdit: true, userId: 'u-a' }}>
          <GovernanceBar kind="requirement_meta" view={view('u-a')} onChanged={() => {}} />
        </SharedViewerContext.Provider>
      )
    );
    const publish = container.querySelector('[data-testid="gov-publish"]') as HTMLButtonElement;
    expect(publish.disabled).toBe(true);
    expect(container.textContent).toContain('a second administrator must publish it');
    act(() =>
      root.render(
        <SharedViewerContext.Provider value={{ signedIn: true, canEdit: true, userId: 'u-b' }}>
          <GovernanceBar kind="requirement_meta" view={view('u-a')} onChanged={() => {}} />
        </SharedViewerContext.Provider>
      )
    );
    expect((container.querySelector('[data-testid="gov-publish"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('readers see no governance controls', () => {
    act(() =>
      root.render(
        <SharedViewerContext.Provider value={{ signedIn: true, canEdit: false, userId: 'u-op' }}>
          <GovernanceBar kind="requirement_meta" view={view('u-a')} onChanged={() => {}} />
        </SharedViewerContext.Provider>
      )
    );
    expect(container.querySelector('[data-testid="gov-bar"]')).toBeNull();
  });

  it('catalog: lists archetypes from the API and saves a new one as a draft', async () => {
    const posted: unknown[] = [];
    const archetype = { code: 'EMX-IAM-001', name: 'Account list', domain: 'IAM', description: 'd', assessor_methods: ['examine'], acceptable_forms: [], collection_notes: '', retention_notes_template: '' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (init?.method === 'POST' && u.endsWith('/items/archetype')) {
          posted.push(JSON.parse(String(init.body)));
          return new Response(JSON.stringify({ data: { version: 1 } }), { status: 201 });
        }
        if (u.includes('/items/archetype')) {
          return new Response(JSON.stringify({ data: [{ kind: 'archetype', key: 'EMX-IAM-001', published: { ...row('published', 1), data: archetype }, draft: null, retired: null, current: archetype, status: 'published' }] }), { status: 200 });
        }
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      })
    );
    await act(async () =>
      root.render(
        <SharedViewerContext.Provider value={{ signedIn: true, canEdit: true, userId: 'u-a' }}>
          <CatalogPage />
        </SharedViewerContext.Provider>
      )
    );
    await act(async () => {});
    expect(container.querySelector('[data-testid="stat-archetypes"]')?.textContent).toContain('1');
    expect(container.querySelector('[data-testid="catalog-table"]')?.textContent).toContain('Account list');
    act(() => (container.querySelector('[data-testid="catalog-add"]') as HTMLButtonElement).click());
    const set = (id: string, v: string) => {
      const el = container.querySelector(`[data-testid="${id}"]`) as HTMLInputElement;
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    act(() => {
      set('archetype-code', 'emx-iam-099');
      set('archetype-name', 'Privileged access review');
      set('archetype-description', 'Quarterly review.');
    });
    await act(async () => (container.querySelector('[data-testid="archetype-save"]') as HTMLButtonElement).click());
    await act(async () => {});
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ code: 'EMX-IAM-099', name: 'Privileged access review' });
    expect(document.body.textContent).toContain('Another administrator publishes it.');
  });

  it('standard delete: a never-published draft is deleted; a published item is retired (soft delete)', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method} ${String(url).replace(/^.*\/ces-shared/, '')}`);
        return init?.method === 'DELETE' ? new Response(null, { status: 204 }) : new Response(JSON.stringify({ data: {} }), { status: 200 });
      })
    );
    const done = vi.fn();
    const draftOnly: ItemView<RequirementMeta> = { ...view('u-a'), published: null, current: null, status: 'draft_only' };
    act(() => root.render(<DeleteItemDialog kind="requirement_meta" view={draftOnly} name="X" onCancel={() => {}} onDone={done} />));
    expect(container.textContent).toContain('never published');
    await act(async () => (document.querySelector('[data-testid="confirm-ok"]') as HTMLButtonElement).click());
    act(() => root.render(<DeleteItemDialog kind="requirement_meta" view={view('u-a')} name="Y" onCancel={() => {}} onDone={done} />));
    expect(container.textContent).toContain('never erased');
    await act(async () => (document.querySelector('[data-testid="confirm-ok"]') as HTMLButtonElement).click());
    expect(calls).toEqual(['DELETE /items/requirement_meta/AC.L1-3.1.1/draft', 'POST /items/requirement_meta/AC.L1-3.1.1/retire']);
    expect(done).toHaveBeenLastCalledWith('Y deleted (retired). Its history is kept.');
  });
});
