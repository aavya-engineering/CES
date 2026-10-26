// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// discovery.ts — THE DiscoveryResult row shape (GO-1 open-decision-3: "a future
// real engine's output format is decided once"). Moved here from
// src/__fixtures__/discoveryResults.ts in READINESS-1 M2 so the session record
// and the readiness exporter can reference it without depending on a fixtures
// file; the fixture re-exports this type, so there is still exactly ONE model.
export interface DiscoveryResult {
  control_id: string;
  objective_ids: string[];
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  /**
   * MG-01: the executor's derived posture for this row, carried through
   * import / join / re-export so an observation that did not establish
   * `met` can never be promoted to a class-A affirmative. Absent on
   * fixture / legacy rows, which keep their confidence-only behaviour.
   */
  derived_posture?: 'met' | 'not_met' | 'partial' | 'unknown';
}

/**
 * MG-01: true when a row carries an executor posture other than `met`.
 * Such a row is evidence of a read, not of compliance — it must not
 * synthesize an affirmative fact, draft a boundary, or re-export as met.
 */
export function postureBlocksMet(r: Pick<DiscoveryResult, 'derived_posture'>): boolean {
  return r.derived_posture !== undefined && r.derived_posture !== 'met';
}