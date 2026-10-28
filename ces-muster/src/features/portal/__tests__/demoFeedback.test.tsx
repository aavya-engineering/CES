// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// S1.9 (SPA): demo-feedback release — bulk import of organisation-defined
// requirements, the Create Requirement form, the 30-minute idle sign-out and
// the reset-link parser. Production code; only fetch and timers are faked.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { planImport, requirementTemplateCsv } from '../requirementCsvData';
import { REQUIREMENTS } from '../referenceData';
import { SharedViewerContext } from '../governedState';
import RequirementFormPage from '../pages/RequirementFormPage';
import { IDLE_LIMIT_MS, useIdleSignOut } from '@/features/app/idleSignOut';
import { resetTokenFromHash } from '@/features/auth/resetLink';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const known = new Set(REQUIREMENTS.map((r) => r.control_id));

describe('bulk import', () => {
  it('the template imports cleanly: one metadata row and one new organisation-defined requirement', () => {
    const { lines, headerError } = planImport(requirementTemplateCsv(), known, new Map());
    expect(headerError).toBeNull();
    expect(lines.map((l) => (l.status === 'change' ? l.kind : l.status))).toEqual(['requirement_meta', 'custom_requirement']);
    const custom = lines[1];
    expect(custom.status === 'change' && custom.data).toMatchObject({ control_id: 'ORG-PE-01', family: 'PE', priority: 'medium', modules: ['evidenceops'], status: 'active', effective_date: '2026-11-01' });
  });

  it('a new requirement needs a valid family, priority and description', () => {
    const csv = ['control_id,title,family,priority,description', 'ORG-1,Thing,ZZ,high,Some text', 'ORG-2,Thing,AC,urgent,Some text', 'ORG-3,Thing,AC,low,'].join('\n');
    const { lines } = planImport(csv, known, new Map());
    expect(lines.map((l) => (l.status === 'error' ? l.message : l.status))).toEqual([
      'Family "ZZ" must be one of the 14 codes (AC, AT, AU …)',
      'Priority must be High, Medium or Low',
      'Description must be 3–2000 characters',
    ]);
  });
});

describe('Create Requirement form', () => {
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
    vi.unstubAllGlobals();
  });
  const set = (id: string, v: string) => {
    const el = host.querySelector(`[data-testid="${id}"]`) as HTMLInputElement;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  };

  it('checks required fields, refuses a reserved ID, then saves a draft', async () => {
    const posted: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => (posted.push(JSON.parse(String(init?.body))), new Response(JSON.stringify({ data: { version: 1 } }), { status: 201 }))));
    const saved = vi.fn();
    await act(async () =>
      root.render(
        <SharedViewerContext.Provider value={{ signedIn: true, canEdit: true, userId: 'u-a' }}>
          <RequirementFormPage form={{ mode: 'create' }} options={REQUIREMENTS.map((r) => ({ id: r.control_id, title: r.practice }))} onBack={() => {}} onSaved={saved} />
        </SharedViewerContext.Provider>
      )
    );
    await act(async () => (host.querySelector('[data-testid="req-form-save"]') as HTMLButtonElement).click());
    expect(host.querySelectorAll('.field-error').length).toBeGreaterThanOrEqual(4);
    act(() => {
      set('req-form-id', 'AC.L1-3.1.1');
      set('req-form-title', 'Visitor access log');
      set('req-form-family', 'PE');
      set('req-form-priority', 'medium');
      set('req-form-description', 'Keep a log of visitors.');
    });
    await act(async () => (host.querySelector('[data-testid="req-form-save"]') as HTMLButtonElement).click());
    expect(host.textContent).toContain('This ID is already used.');
    act(() => set('req-form-id', 'org-pe-01'));
    await act(async () => (host.querySelector('[data-testid="req-form-save"]') as HTMLButtonElement).click());
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ control_id: 'ORG-PE-01', title: 'Visitor access log', family: 'PE', priority: 'medium', status: 'active' });
    expect(saved).toHaveBeenCalledWith(expect.stringContaining('Another platform administrator publishes it'));
  });
});

describe('idle sign-out and reset link', () => {
  it('signs out after 30 minutes without activity, warns 2 minutes before, and activity resets the clock', async () => {
    vi.useFakeTimers();
    localStorage.clear();
    const host = document.createElement('div');
    const root = createRoot(host);
    const out = vi.fn();
    let api: ReturnType<typeof useIdleSignOut> | null = null;
    function Probe() {
      api = useIdleSignOut(true, out);
      return null;
    }
    act(() => root.render(<Probe />));
    act(() => vi.advanceTimersByTime(IDLE_LIMIT_MS - 60_000));
    expect(api!.left).not.toBeNull();
    act(() => api!.stay());
    act(() => vi.advanceTimersByTime(IDLE_LIMIT_MS - 5_000));
    expect(out).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(10_000));
    expect(out).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    vi.useRealTimers();
  });

  it('reads the token from a reset link only', () => {
    expect(resetTokenFromHash('#/reset-password?token=abcdefghijklmnopqrstuvwxyz012345')).toBe('abcdefghijklmnopqrstuvwxyz012345');
    expect(resetTokenFromHash('#/shared/requirements')).toBeNull();
    expect(resetTokenFromHash('#/reset-password?token=short')).toBeNull();
  });
});
