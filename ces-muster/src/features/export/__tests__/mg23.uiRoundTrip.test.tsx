// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// MG-23 — UI round trip: an imported readiness record's executor rows are
// staged by the confirm step, persisted by the interview, and exported with
// their ran_entry_ids intact (before MG-23 they were dropped and exported as []).
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import AssessmentPage from '@/features/assessment/AssessmentPage';
import BoundaryConfirmPanel from '@/features/discovery/BoundaryConfirmPanel';
import {
  parseReadinessResultFile,
  discoveryResultsFromPayload,
  factsFromPayload,
  consentsFromPayload,
} from '@/features/discovery/importReadinessResult';
import { executeReadinessExport } from '../readinessResultService';
import { READINESS_RESULT_SCRIPT_UPLOAD } from '@/__fixtures__/readinessResults';
import { db } from '@/shared/db/schema';

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  localStorage.clear();
  await db.engagements.clear();
  await db.assessed_parties.clear();
  await db.interview_sessions.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
});

async function tick(n = 10): Promise<void> {
  for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
}
function setInputValue(el: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('MG-23 — executor rows survive import → confirm → interview → export', () => {
  test('ran_entry_ids in the export equal the imported record’s', async () => {
    const payload = parseReadinessResultFile(JSON.stringify(READINESS_RESULT_SCRIPT_UPLOAD));
    const expected = payload.observations.flatMap((o) => o.ran_entry_ids).sort();
    expect(expected.length).toBeGreaterThan(0); // the script-upload record has real entry ids

    await act(async () => {
      root.render(
        <BoundaryConfirmPanel
          results={discoveryResultsFromPayload(payload)}
          payloadFacts={factsFromPayload(payload)}
          payloadConsents={consentsFromPayload(payload)}
          payloadObservations={payload.observations}
          onContinue={() => {}}
        />
      );
    });
    await act(async () => (container.querySelector('[data-testid="boundary-continue-btn"]') as HTMLButtonElement).click());

    act(() => root.unmount());
    root = createRoot(container);
    await act(async () => {
      root.render(<AssessmentPage onEngagementReady={() => {}} onComplete={() => {}} />);
    });
    await tick();
    await act(async () => {
      setInputValue(container.querySelector('input[placeholder="Acme Defense LLC"]') as HTMLInputElement, 'Rows Co');
      setInputValue(container.querySelector('[data-testid="rm-operator-name"]') as HTMLInputElement, 'Test Operator');
      (container.querySelector('input[name="on_prem_ot"][value="no"]') as HTMLInputElement).click();
    });
    await act(async () => (container.querySelector('[data-testid="begin-interview"]') as HTMLButtonElement).click());
    await tick(20);

    const sessions = await db.interview_sessions.toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].discovery_observations?.length).toBe(payload.observations.length);
    const out = await executeReadinessExport(sessions[0].id);
    expect(out.observations.flatMap((o) => o.ran_entry_ids).sort()).toEqual(expected);
    // The handoff is consumed once.
    expect(localStorage.getItem('muster-discovery-observations')).toBeNull();
  });
});
