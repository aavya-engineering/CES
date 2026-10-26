// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// MG-01 — an empty discovery read must not score as met (SPA side).
// Covers the whole chain: payload import -> fact join -> question pruning ->
// SPRS -> readiness re-export. Rows produced by the pre-fix executor carry
// confidence 'low' + derived_posture 'unknown'; rows from the fixed executor
// carry confidence 'unknown'. Neither may become a class-A 'yes'.
import { describe, test, expect } from 'vitest';
import { QUESTION_GRAPH } from '@/features/interview/questionGraph';
import { synthesizeFactsFromDiscovery } from '@/features/interview/discoveryFactJoin';
import { pruneByCoverage } from '@/features/interview/factCoveragePruner';
import { inferBoundaryDrafts } from '@/features/interview/boundaryInference';
import { discoveryResultsFromPayload } from '@/features/discovery/importReadinessResult';
import { requirementStatuses, buildReadinessResult } from '@/features/export/readinessResultService';
import { computeSprs } from '@/features/scoring/sprsCalc';
import type { DiscoveryResult } from '@/shared/types/discovery';
import type { ReadinessResult } from '@/shared/types/readinessResult';

const node = QUESTION_GRAPH.find((n) => n.cluster !== 'boundary' && n.mapped_requirements.length > 0)!;
const control = node.mapped_requirements[0];

function payloadWith(obs: Partial<ReadinessResult['observations'][number]>): ReadinessResult {
  return {
    observations: [
      { control_id: control, objective_ids: [], ran_entry_ids: ['E1'], confidence: 'low', derived_posture: 'unknown', ...obs },
    ],
  } as unknown as ReadinessResult;
}

const sprsFor = (results: DiscoveryResult[]) => {
  const facts = synthesizeFactsFromDiscovery(results, QUESTION_GRAPH);
  return computeSprs(requirementStatuses(facts, QUESTION_GRAPH)).sprs;
};
const NO_DISCOVERY_SPRS = computeSprs(requirementStatuses([], QUESTION_GRAPH)).sprs;

describe('MG-01 empty read never scores as met', () => {
  test('import carries derived_posture from the payload', () => {
    const [row] = discoveryResultsFromPayload(payloadWith({}));
    expect(row.derived_posture).toBe('unknown');
  });

  test('pre-fix executor row (low + posture unknown): no fact, node stays asked, SPRS unchanged', () => {
    const results = discoveryResultsFromPayload(payloadWith({ confidence: 'low' }));
    const facts = synthesizeFactsFromDiscovery(results, QUESTION_GRAPH);
    expect(facts.filter((f) => f.question_id === node.id)).toHaveLength(0);
    expect(pruneByCoverage(QUESTION_GRAPH, facts).some((n) => n.id === node.id)).toBe(true);
    expect(sprsFor(results)).toBe(NO_DISCOVERY_SPRS);
  });

  test('fixed executor row (unknown + posture unknown): never yes, node stays asked, SPRS unchanged', () => {
    const results = discoveryResultsFromPayload(payloadWith({ confidence: 'unknown' }));
    const facts = synthesizeFactsFromDiscovery(results, QUESTION_GRAPH);
    expect(facts.every((f) => f.answer !== 'yes')).toBe(true);
    expect(pruneByCoverage(QUESTION_GRAPH, facts).some((n) => n.id === node.id)).toBe(true);
    // An 'unsure' fact makes the requirement assessed-but-not-met: it deducts,
    // so the score can only be at or below the no-discovery score — never above.
    const status = requirementStatuses(facts, QUESTION_GRAPH).find((r) => r.requirement_id === control);
    expect(status?.status).not.toBe('met');
    expect(sprsFor(results)).toBeLessThanOrEqual(NO_DISCOVERY_SPRS);
  });

  test('a posture-unknown row drafts no CUI boundary', () => {
    const rows: DiscoveryResult[] = QUESTION_GRAPH.flatMap((n) => n.mapped_requirements).map((c) => ({
      control_id: c, objective_ids: [], confidence: 'high', derived_posture: 'unknown',
    }));
    expect(inferBoundaryDrafts(rows)).toHaveLength(0);
  });

  test('re-export of an imported empty read keeps posture unknown (not met)', () => {
    const results = discoveryResultsFromPayload(payloadWith({ confidence: 'low' }));
    const session = {
      id: 's1', facts: [], created_at: '2026-10-23T00:00:00.000Z', discovery_results: results,
      readiness_manifest: { mode: 'self-hosted', auth_tier: 'lite', tenant_slug: 't', tenant_kind: 'sim', operator_name: 'op', operator_role: 'bhd_operator' },
    };
    const out = buildReadinessResult(
      { id: 'e1', engagement_kind: 'individual_contractor' } as never,
      { id: 'p1' } as never,
      session as never,
      QUESTION_GRAPH,
    );
    const obs = out.observations.find((o) => o.control_id === control)!;
    expect(obs.derived_posture).toBe('unknown');
  });

  test('positive control: a met + high row still yields yes and prunes its node (unchanged)', () => {
    const results: DiscoveryResult[] = [{ control_id: control, objective_ids: [], confidence: 'high', derived_posture: 'met' }];
    const facts = synthesizeFactsFromDiscovery(results, QUESTION_GRAPH);
    expect(facts.some((f) => f.question_id === node.id && f.answer === 'yes')).toBe(true);
    expect(pruneByCoverage(QUESTION_GRAPH, facts).some((n) => n.id === node.id)).toBe(false);
  });
});
