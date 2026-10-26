// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// MG-05 — the infrastructure model is never inferred as m365_azure from
// "any cloud stack", and an unconfirmed model plans no Azure resources.

import { describe, expect, test } from 'vitest';
import { deriveSitFacts } from '../siDerivation';
import { buildSiBaselineFromAnswers } from '../siBaselineAdapter';
import { tcpWanted } from '../planCompileService';
import { buildPlanArtifacts } from '../tenantManifestAdapter';
import { loadBanks } from './planTestSupport';
import { FIXTURE_RESULTS } from './fixtureInputs';
import type { SiQuestionBank } from '../siBaselineAdapter';
import type { SITAnswer } from '@/vendored/ces-planner/types/siBaseline';

const banks = loadBanks();
const siBank = banks.siQuestionBank as SiQuestionBank;

function sit020(stacks: string[]) {
  return deriveSitFacts({ selectedStacks: stacks }).facts.find((f) => f.question_id === 'SIT-020');
}

function infraModelOf(si: unknown): unknown {
  return (si as { si_baseline?: { dependencies?: { infrastructure_model?: unknown } } }).si_baseline?.dependencies
    ?.infrastructure_model;
}

describe('MG-05 SIT-020 derivation', () => {
  test.each([[['m365_e5_gcc']], [['m365_e3']], [['m365_e5_gcc', 'microsoft_intune', 'sharepoint']], [['on_prem_ad', 'm365_e3']]])(
    'stacks %j derive no infrastructure model (SIT-020 stays asked)',
    (stacks) => {
      expect(sit020(stacks)).toBeUndefined();
    }
  );

  test('a declared Sentinel stack derives m365_sentinel, with its own provenance', () => {
    const f = sit020(['m365_e5_gcc', 'microsoft_sentinel']);
    expect(f?.answer).toBe('m365_sentinel');
    expect(f?.provenance).toBe('derived:si:stacks:microsoft_sentinel');
  });

  test('no stack combination derives m365_azure', () => {
    const tiles = ['m365_e3', 'm365_e5_gcc', 'microsoft_intune', 'microsoft_sentinel', 'on_prem_ad', 'sharepoint'];
    for (let mask = 1; mask < 1 << tiles.length; mask++) {
      const stacks = tiles.filter((_, i) => mask & (1 << i));
      expect(sit020(stacks)?.answer, stacks.join(',')).not.toBe('m365_azure');
    }
  });
});

describe('MG-05 SI Baseline and Infrastructure Manifest', () => {
  test('an unanswered SIT-020 becomes m365_only, so no TCP and no Infra Manifest are built', () => {
    const si = buildSiBaselineFromAnswers({}, siBank);
    expect(infraModelOf(si)).toBe('m365_only');
    expect(tcpWanted(si, [])).toBe(false);
  });

  test('an answered SIT-020 is carried unchanged', () => {
    const si = buildSiBaselineFromAnswers(
      {
        'SIT-020': {
          question_id: 'SIT-020',
          answer_type: 'enum',
          raw_answer: 'm365_azure',
          captured_at: '2026-10-23T00:00:00.000Z',
          provenance_class: 'client_assertion',
        } as SITAnswer,
      },
      siBank
    );
    expect(infraModelOf(si)).toBe('m365_azure');
  });

  test('a plan compiled without an infrastructure answer pushes no Infra Manifest', () => {
    const artifacts = buildPlanArtifacts({ sitAnswers: {}, requirementResults: FIXTURE_RESULTS, tenantConfig: null }, banks);
    expect(artifacts.infrastructureManifest).toBeNull();
    expect(infraModelOf(artifacts.siBaseline)).toBe('m365_only');
  });
});
