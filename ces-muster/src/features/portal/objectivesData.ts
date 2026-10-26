// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// objectivesData.ts — R1: the 320 NIST SP 800-171A assessment objectives
// (determination statements such as 3.1.1[a]) from the vendored ces-shared
// assessment-objectives.reference.json, joined to the 110 requirements.
//
// BHD response to Tech Arch V1.0 (P0-2): objectives are first-class. Read-only;
// no evidence is linked here — no source file maps an archetype to a single
// objective yet (doc 25, Q-1).
import OBJ from '@/vendored/ces-shared/data/assessment-objectives.reference.json';
import { REQUIREMENTS, type RequirementRow } from './referenceData';

export type Method = 'examine' | 'interview' | 'test';

export interface ObjectiveJson {
  objectiveId: string;
  controlId: string;
  description: string;
  methods: Method[];
}

export interface ObjectiveRow extends ObjectiveJson {
  /** The letter(s) in brackets, e.g. "a" for AC.L1-3.1.1[a]. */
  letter: string;
  requirement: RequirementRow;
}

export const OBJECTIVES_JSON: readonly ObjectiveJson[] = (OBJ as { objectives: ObjectiveJson[] }).objectives;

const byControl = new Map(REQUIREMENTS.map((r) => [r.control_id, r]));

/** Objectives in requirement order (NIST numeric), then file order within a requirement. */
export const OBJECTIVES: readonly ObjectiveRow[] = (() => {
  const order = new Map(REQUIREMENTS.map((r, i) => [r.control_id, i]));
  return OBJECTIVES_JSON.map((o, i) => {
    const requirement = byControl.get(o.controlId);
    if (!requirement) throw new Error(`objective ${o.objectiveId} names unknown requirement ${o.controlId}`);
    const letter = /\[([^\]]+)\]$/.exec(o.objectiveId)?.[1] ?? '';
    return { ...o, letter, requirement, i };
  })
    .sort((a, b) => (order.get(a.controlId)! - order.get(b.controlId)!) || a.i - b.i)
    .map(({ i: _i, ...row }) => row);
})();

/** Objective count per requirement, for the roll-up view. */
export function objectiveCounts(rows: readonly ObjectiveRow[] = OBJECTIVES): Map<string, number> {
  const m = new Map<string, number>();
  for (const o of rows) m.set(o.controlId, (m.get(o.controlId) ?? 0) + 1);
  return m;
}
