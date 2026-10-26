// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// R1: the three ces-shared reference files the portal reads agree with each
// other (BHD response to Tech Arch V1.0: parity at startup or in CI), and the
// R1 data the pages show matches the files. Each mutation case proves the
// check would catch that drift.
import { describe, it, expect } from 'vitest';
import CONTROLS from '@/vendored/ces-shared/data/cmmc-l2-controls.reference.json';
import SPRS from '@/vendored/ces-shared/data/sprs-weights.json';
import OBJ from '@/vendored/ces-shared/data/assessment-objectives.reference.json';
import { checkReferenceParity, type ParityInput } from '../referenceParity';
import { REQUIREMENTS, PARTIAL_CREDIT, POAM_PROHIBITED, SPRS_META, levelOf } from '../referenceData';
import { OBJECTIVES, objectiveCounts } from '../objectivesData';

const real = (): ParityInput =>
  structuredClone({
    controls: (CONTROLS as unknown as { controls: ParityInput['controls'] }).controls,
    weights: (SPRS as unknown as { controls: ParityInput['weights'] }).controls,
    objectives: (OBJ as unknown as { objectives: ParityInput['objectives'] }).objectives,
    poamProhibited: (SPRS as unknown as { poam_prohibited: string[] }).poam_prohibited,
    partialCredit: (SPRS as unknown as { partial_credit: ParityInput['partialCredit'] }).partial_credit,
  });

describe('R1 reference parity', () => {
  it('the shipped files agree: 110 requirements, 110 SPRS entries, objectives for each', () => {
    expect(checkReferenceParity(real())).toEqual([]);
  });

  it('catches a requirement with no SPRS entry', () => {
    const d = real();
    d.weights = d.weights.filter((w) => w.control_id !== 'AC.L2-3.1.3');
    expect(checkReferenceParity(d)).toContain('requirement without SPRS entry: AC.L2-3.1.3');
  });

  it('catches a duplicate SPRS entry and a duplicate objective', () => {
    const d = real();
    d.weights = [...d.weights, d.weights[0]];
    d.objectives = [...d.objectives, d.objectives[5]];
    const p = checkReferenceParity(d);
    expect(p).toContain(`duplicate SPRS entry: ${d.weights[0].control_id}`);
    expect(p).toContain(`duplicate objective: ${d.objectives[5].objectiveId}`);
  });

  it('catches a level or NIST reference that differs between the files', () => {
    const d = real();
    d.weights = d.weights.map((w) => (w.control_id === 'AC.L1-3.1.1' ? { ...w, level: 'L2', nist_ref: '3.1.9' } : w));
    const p = checkReferenceParity(d);
    expect(p).toContain('level differs for AC.L1-3.1.1: 1 vs L2');
    expect(p).toContain('NIST reference differs for AC.L1-3.1.1: 3.1.1 vs 3.1.9');
  });

  it('catches a requirement whose objectives are missing, and an orphan objective', () => {
    const d = real();
    d.objectives = d.objectives.filter((o) => o.controlId !== 'SI.L2-3.14.7');
    d.objectives = [...d.objectives, { objectiveId: 'XX.L2-9.9.9[a]', controlId: 'XX.L2-9.9.9' }];
    const p = checkReferenceParity(d);
    expect(p).toContain('requirement without objectives: SI.L2-3.14.7');
    expect(p).toContain('objective for unknown requirement: XX.L2-9.9.9[a]');
  });

  it('catches an exception list naming a requirement that does not exist', () => {
    const d = real();
    d.poamProhibited = [...d.poamProhibited, '3.99.1'];
    expect(checkReferenceParity(d)).toContain('poam_prohibited names unknown requirement: 3.99.1');
  });

  it('catches a requirement count that is not 110', () => {
    const d = real();
    d.controls = d.controls.slice(1);
    expect(checkReferenceParity(d).some((m) => m.startsWith('expected 110 requirements'))).toBe(true);
  });
});

describe('R1 data shown on the pages', () => {
  it('320 objectives across all 110 requirements, in requirement order', () => {
    expect(OBJECTIVES).toHaveLength(320);
    expect(objectiveCounts().size).toBe(110);
    expect(OBJECTIVES[0].objectiveId).toBe('AC.L1-3.1.1[a]');
    expect(OBJECTIVES[0].letter).toBe('a');
    expect(objectiveCounts().get('CM.L2-3.4.7')).toBe(15);
  });

  it('full SPRS methodology, including partial credit, the prohibited list and the unscored SSP', () => {
    expect(SPRS_META).toMatchObject({
      version: '1.2.1',
      schema_version: 'sprs-weights/2.0.0',
      starting_score: 110,
      floor_score: -203,
      conditional_l2_min_ratio: 0.8,
      ssp_prerequisite_control: 'CA.L2-3.12.4',
    });
    expect(PARTIAL_CREDIT.map((p) => p.control_id)).toEqual(['IA.L2-3.5.3', 'SC.L2-3.13.11']);
    expect([...POAM_PROHIBITED]).toEqual(['3.1.20', '3.1.22', '3.10.3', '3.10.4', '3.10.5', '3.12.4']);
    const byId = new Map(REQUIREMENTS.map((r) => [r.control_id, r]));
    expect(byId.get('IA.L2-3.5.3')?.partial).toMatchObject({ weight: 3 });
    expect(byId.get('SC.L2-3.13.11')?.partial?.poamAllowedAtPartial).toBe(true);
    expect(byId.get('AC.L1-3.1.20')?.poam_prohibited).toBe(true);
    expect(byId.get('AC.L2-3.1.3')?.poam_prohibited).toBe(false);
    expect(byId.get('CA.L2-3.12.4')).toMatchObject({ weight: 0, unscored: true });
    expect(REQUIREMENTS.filter((r) => r.poam_prohibited)).toHaveLength(6);
  });

  it('one level encoding: L1 / L2', () => {
    expect(new Set(REQUIREMENTS.map((r) => r.level))).toEqual(new Set(['L1', 'L2']));
    expect(REQUIREMENTS.filter((r) => r.level === 'L1')).toHaveLength(17);
    expect(() => levelOf(3)).toThrow('unsupported CMMC level 3');
  });
});
