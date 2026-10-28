// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// S1.10 (SPA): fixes found while checking S1.9 against the demo feedback —
// a visible Create Requirement button for editors, and the row ⋮ menu keeps
// opening on the first click (focusing its first item must not scroll).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SharedViewerContext } from '../governedState';
import { RowActions } from '../governed';
import RequirementsPage from '../pages/RequirementsPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('S1.10', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it('editors see Create Requirement next to Import / Update; readers do not', async () => {
    await act(async () =>
      root.render(
        <SharedViewerContext.Provider value={{ signedIn: true, canEdit: true, userId: 'u-a' }}>
          <RequirementsPage />
        </SharedViewerContext.Provider>
      )
    );
    expect(host.querySelector('[data-testid="req-create-visible"]')?.textContent).toContain('Create Requirement');
    await act(async () =>
      root.render(
        <SharedViewerContext.Provider value={{ signedIn: true, canEdit: false, userId: 'u-o' }}>
          <RequirementsPage />
        </SharedViewerContext.Provider>
      )
    );
    expect(host.querySelector('[data-testid="req-create-visible"]')).toBeNull();
  });

  it('the row menu focuses its first item without scrolling, so it stays open', async () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    act(() => root.render(<RowActions label="ORG-1" testId="ra" actions={[{ label: 'View', onSelect: () => {} }, { label: 'Delete', tone: 'danger', onSelect: () => {} }]} />));
    act(() => (host.querySelector('[data-testid="ra"]') as HTMLButtonElement).click());
    await act(async () => new Promise((r) => requestAnimationFrame(() => r(null))));
    expect(host.querySelector('[role="menu"]')?.textContent).toContain('Delete');
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    focus.mockRestore();
  });
});
