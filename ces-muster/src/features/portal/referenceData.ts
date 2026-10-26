// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// referenceData.ts — UI-02: the 110 requirements and their SPRS weights, read
// from the vendored ces-shared copies (kept byte-identical by cesSharedSync.ts).
//
// Read-only by decision (2026-10-24): CES has one canonical copy of this data
// (PRD SH-FR-04); the mockup's editable weights (0.05 … summing to 1.00) are
// not how SPRS works. Real weights are 5, 3 or 1 points deducted per unmet
// requirement (one is 0: the SSP, a prerequisite), from a starting score of 110.
import CONTROLS from '@/vendored/ces-shared/data/cmmc-l2-controls.reference.json';
import SPRS from '@/vendored/ces-shared/data/sprs-weights.json';

export interface RequirementRow {
  control_id: string;
  nist_ref: string;
  family: string;
  family_name: string;
  cmmc_level: number;
  practice: string;
  weight: number;
  poam_allowed: boolean;
  unscored: boolean;
  /** R1: CMMC level as text ('L1' / 'L2') — the one encoding the UI uses (BHD P2-12). */
  level: Level;
  /** R1: reduced deduction when the requirement is only partly met (sprs-weights.json partial_credit). */
  partial?: { weight: number; condition: string; poamAllowedAtPartial: boolean };
  /** R1: on sprs-weights.json poam_prohibited — can never be closed out on a POA&M. */
  poam_prohibited: boolean;
  note?: string;
}

export type Level = 'L1' | 'L2';
/** cmmc-l2-controls.reference.json stores the level as a number, sprs-weights.json as 'L1'/'L2'. */
export function levelOf(n: number): Level {
  if (n === 1 || n === 2) return `L${n}`;
  throw new Error(`unsupported CMMC level ${n}`);
}

interface PartialJson {
  control_id: string;
  nist_ref: string;
  full_weight: number;
  partial_weight: number;
  partial_condition: string;
  poam_allowed_at_partial?: boolean;
}

interface ControlJson {
  control_id: string;
  family: string;
  cmmc_level: number;
  nist_ref: string;
  practice: string;
}
interface FamilyJson {
  abbreviation: string;
  name: string;
  control_count: number;
}
interface WeightJson {
  control_id: string;
  nist_ref: string;
  level: string;
  weight: number;
  poam_allowed: boolean;
  unscored?: boolean;
  note?: string;
}

const families = (CONTROLS as { families: FamilyJson[] }).families;
const familyName = new Map(families.map((f) => [f.abbreviation, f.name]));
const weights = new Map((SPRS as { controls: WeightJson[] }).controls.map((w) => [w.control_id, w]));

/** sprs-weights.json partial_credit (3.5.3 and 3.13.11: 5 points, or 3 when partly met). */
export const PARTIAL_CREDIT: readonly PartialJson[] = (SPRS as { partial_credit: PartialJson[] }).partial_credit;
/** sprs-weights.json poam_prohibited: NIST references that can never be on a POA&M. */
export const POAM_PROHIBITED: readonly string[] = (SPRS as { poam_prohibited: string[] }).poam_prohibited;
const partialById = new Map(PARTIAL_CREDIT.map((p) => [p.control_id, p]));
const prohibited = new Set(POAM_PROHIBITED);

/** Numeric sort on the NIST reference (3.1.2 before 3.1.10). */
function nistKey(ref: string): number[] {
  return ref.split('.').map((n) => Number(n));
}
function compareNist(a: string, b: string): number {
  const x = nistKey(a);
  const y = nistKey(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export const REQUIREMENTS: readonly RequirementRow[] = (CONTROLS as { controls: ControlJson[] }).controls
  .map((c) => {
    const w = weights.get(c.control_id);
    if (!w) throw new Error(`no SPRS weight for ${c.control_id}`);
    const p = partialById.get(c.control_id);
    return {
      control_id: c.control_id,
      nist_ref: c.nist_ref,
      family: c.family,
      family_name: familyName.get(c.family) ?? c.family,
      cmmc_level: c.cmmc_level,
      practice: c.practice,
      weight: w.weight,
      poam_allowed: w.poam_allowed,
      unscored: !!w.unscored,
      level: levelOf(c.cmmc_level),
      poam_prohibited: prohibited.has(c.nist_ref),
      ...(p
        ? { partial: { weight: p.partial_weight, condition: p.partial_condition, poamAllowedAtPartial: !!p.poam_allowed_at_partial } }
        : {}),
      ...(w.note ? { note: w.note } : {}),
    };
  })
  .sort((a, b) => compareNist(a.nist_ref, b.nist_ref));

export const FAMILIES: readonly FamilyJson[] = families;

const S = SPRS as {
  version: string;
  schema_version: string;
  source: string;
  scores_against: string;
  generated_on: string;
  starting_score: number;
  floor_score: number;
  conditional_l2_min_ratio: number;
  ssp_prerequisite_control: string;
};
/** R1: every methodology field in sprs-weights.json (BHD P1-6), not a subset. */
export const SPRS_META = {
  version: S.version,
  schema_version: S.schema_version,
  source: S.source,
  scores_against: S.scores_against,
  starting_score: S.starting_score,
  floor_score: S.floor_score,
  generated_on: S.generated_on,
  conditional_l2_min_ratio: S.conditional_l2_min_ratio,
  ssp_prerequisite_control: S.ssp_prerequisite_control,
};

export interface FamilySummary {
  family: string;
  name: string;
  count: number;
  maxDeduction: number;
  byWeight: Record<5 | 3 | 1 | 0, number>;
  level1: number;
  level2: number;
}

export function familySummaries(rows: readonly RequirementRow[] = REQUIREMENTS): FamilySummary[] {
  const out = new Map<string, FamilySummary>();
  for (const r of rows) {
    const s =
      out.get(r.family) ??
      { family: r.family, name: r.family_name, count: 0, maxDeduction: 0, byWeight: { 5: 0, 3: 0, 1: 0, 0: 0 }, level1: 0, level2: 0 };
    s.count += 1;
    s.maxDeduction += r.weight;
    s.byWeight[r.weight as 5 | 3 | 1 | 0] += 1;
    if (r.cmmc_level === 1) s.level1 += 1;
    else s.level2 += 1;
    out.set(r.family, s);
  }
  return [...out.values()];
}

export function weightCounts(rows: readonly RequirementRow[] = REQUIREMENTS): Record<5 | 3 | 1 | 0, number> {
  const c = { 5: 0, 3: 0, 1: 0, 0: 0 } as Record<5 | 3 | 1 | 0, number>;
  for (const r of rows) c[r.weight as 5 | 3 | 1 | 0] += 1;
  return c;
}

/** Sum of all weights = the most a score can fall (110 → −203 means 313). */
export function totalDeduction(rows: readonly RequirementRow[] = REQUIREMENTS): number {
  return rows.reduce((n, r) => n + r.weight, 0);
}
