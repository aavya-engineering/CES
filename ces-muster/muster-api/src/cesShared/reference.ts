// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// reference.ts — S1.1: the locked CES-Shared reference data served by the API,
// read from the vendored ces-shared copies (byte-identical, cesSharedSync.ts)
// and the NIST SP 800-171 Rev 2 text from the Aavya workbook. Read-only.
import CONTROLS from '../vendored/ces-shared/data/cmmc-l2-controls.reference.json';
import SPRS from '../vendored/ces-shared/data/sprs-weights.json';
import OBJ from '../vendored/ces-shared/data/assessment-objectives.reference.json';
import NIST from '../data/nist-800-171r2.json';

export interface ReferenceRequirement {
  controlId: string;
  nistRef: string;
  family: { code: string; name: string };
  level: 'L1' | 'L2';
  practice: string;
  nistText: string | null;
  requirementType: 'Basic' | 'Derived' | null;
  sprs: {
    weight: number;
    poamAllowed: boolean;
    poamProhibited: boolean;
    unscored: boolean;
    partialCredit: { weight: number; condition: string } | null;
  };
  objectiveCount: number;
}

type C = { control_id: string; nist_ref: string; family: string; cmmc_level: number; practice: string };
type W = { control_id: string; weight: number; poam_allowed: boolean; unscored?: boolean };
type P = { control_id: string; partial_weight: number; partial_condition: string };

const families = (CONTROLS as unknown as { families: { abbreviation: string; name: string }[] }).families;
const familyName = new Map(families.map((f) => [f.abbreviation, f.name]));
const sprs = SPRS as unknown as { controls: W[]; partial_credit: P[]; poam_prohibited: string[]; version: string };
const weights = new Map(sprs.controls.map((w) => [w.control_id, w]));
const partial = new Map(sprs.partial_credit.map((p) => [p.control_id, p]));
const prohibited = new Set(sprs.poam_prohibited);
const nist = new Map(
  (NIST as unknown as { requirements: { nist_ref: string; requirement_type: string; nist_text: string }[] }).requirements.map(
    (n) => [n.nist_ref, n]
  )
);
const objectiveCount = new Map<string, number>();
for (const o of (OBJ as unknown as { objectives: { controlId: string }[] }).objectives) {
  objectiveCount.set(o.controlId, (objectiveCount.get(o.controlId) ?? 0) + 1);
}

function nistKey(ref: string): number[] {
  return ref.split('.').map(Number);
}

export const REFERENCE_VERSION = sprs.version;

export const REQUIREMENTS: readonly ReferenceRequirement[] = (CONTROLS as unknown as { controls: C[] }).controls
  .map((c) => {
    const w = weights.get(c.control_id);
    if (!w) throw new Error(`no SPRS weight for ${c.control_id}`);
    const n = nist.get(c.nist_ref);
    const p = partial.get(c.control_id);
    return {
      controlId: c.control_id,
      nistRef: c.nist_ref,
      family: { code: c.family, name: familyName.get(c.family) ?? c.family },
      level: c.cmmc_level === 1 ? 'L1' : 'L2',
      practice: c.practice,
      nistText: n?.nist_text ?? null,
      requirementType: n?.requirement_type === 'Basic' || n?.requirement_type === 'Derived' ? n.requirement_type : null,
      sprs: {
        weight: w.weight,
        poamAllowed: w.poam_allowed,
        poamProhibited: prohibited.has(c.nist_ref),
        unscored: !!w.unscored,
        partialCredit: p ? { weight: p.partial_weight, condition: p.partial_condition } : null,
      },
      objectiveCount: objectiveCount.get(c.control_id) ?? 0,
    } satisfies ReferenceRequirement;
  })
  .sort((a, b) => {
    const x = nistKey(a.nistRef);
    const y = nistKey(b.nistRef);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] ?? 0) - (y[i] ?? 0);
    return 0;
  });

export const FAMILIES = families.map((f, i) => ({
  code: f.abbreviation,
  name: f.name,
  displayOrder: i + 1,
  controlCount: REQUIREMENTS.filter((r) => r.family.code === f.abbreviation).length,
}));

export const CONTROL_IDS = new Set(REQUIREMENTS.map((r) => r.controlId));
