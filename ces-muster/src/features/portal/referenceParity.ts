// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// referenceParity.ts — R1: integrity check over the three reference files the
// portal reads (BHD response to Tech Arch V1.0: "validate that all 110
// requirement records have matching SPRS entries, and flag missing or
// duplicate identifiers"). Pure function so tests can feed it broken copies.

export interface ParityInput {
  controls: readonly { control_id: string; nist_ref: string; cmmc_level: number }[];
  weights: readonly { control_id: string; nist_ref: string; level: string }[];
  objectives: readonly { objectiveId: string; controlId: string }[];
  poamProhibited: readonly string[];
  partialCredit: readonly { control_id: string }[];
}

/** Returns one message per problem; an empty list means the files agree. */
export function checkReferenceParity(input: ParityInput, expected = 110): string[] {
  const problems: string[] = [];
  const dupes = (ids: readonly string[], what: string) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) problems.push(`duplicate ${what}: ${id}`);
      seen.add(id);
    }
    return seen;
  };
  const controls = dupes(input.controls.map((c) => c.control_id), 'requirement');
  const weights = dupes(input.weights.map((w) => w.control_id), 'SPRS entry');
  dupes(input.objectives.map((o) => o.objectiveId), 'objective');

  if (controls.size !== expected) problems.push(`expected ${expected} requirements, found ${controls.size}`);
  for (const id of controls) if (!weights.has(id)) problems.push(`requirement without SPRS entry: ${id}`);
  for (const id of weights) if (!controls.has(id)) problems.push(`SPRS entry without requirement: ${id}`);

  const weightById = new Map(input.weights.map((w) => [w.control_id, w]));
  for (const c of input.controls) {
    const w = weightById.get(c.control_id);
    if (!w) continue;
    if (w.nist_ref !== c.nist_ref) problems.push(`NIST reference differs for ${c.control_id}: ${c.nist_ref} vs ${w.nist_ref}`);
    if (w.level !== `L${c.cmmc_level}`) problems.push(`level differs for ${c.control_id}: ${c.cmmc_level} vs ${w.level}`);
  }

  const withObjectives = new Set<string>();
  for (const o of input.objectives) {
    withObjectives.add(o.controlId);
    if (!controls.has(o.controlId)) problems.push(`objective for unknown requirement: ${o.objectiveId}`);
    else if (!o.objectiveId.startsWith(`${o.controlId}[`)) problems.push(`objective ID does not match its requirement: ${o.objectiveId}`);
  }
  for (const id of controls) if (!withObjectives.has(id)) problems.push(`requirement without objectives: ${id}`);

  const nistRefs = new Set(input.controls.map((c) => c.nist_ref));
  for (const ref of input.poamProhibited) if (!nistRefs.has(ref)) problems.push(`poam_prohibited names unknown requirement: ${ref}`);
  for (const p of input.partialCredit) if (!controls.has(p.control_id)) problems.push(`partial_credit names unknown requirement: ${p.control_id}`);
  return problems;
}
