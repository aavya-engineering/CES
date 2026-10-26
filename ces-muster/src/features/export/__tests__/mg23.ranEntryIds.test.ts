// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// MG-23 — the readiness result must list the discovery entries that actually
// ran. The executor's full observation rows are staged through the handoff
// store, persisted on the session, and exported verbatim (schema-validated).
import { describe, test, expect, beforeEach } from 'vitest';
import { QUESTION_GRAPH } from '@/features/interview/questionGraph';
import { buildReadinessResult } from '@/features/export/readinessResultService';
import {
  storeDiscoveryObservations,
  loadDiscoveryObservations,
  clearDiscoveryObservations,
} from '@/features/assessment/assessmentHelpers';
import type { ReadinessObservation } from '@/shared/types/readinessResult';

const OBS: ReadinessObservation[] = [
  { control_id: 'AC.L2-3.1.5', objective_ids: [], confidence: 'high', ran_entry_ids: ['tenant:AC.get-roles'], raw_capture_ref: 'captures/AC.get-roles.json', derived_posture: 'met' },
  { control_id: 'AC.L2-3.1.6', objective_ids: [], confidence: 'unknown', ran_entry_ids: ['tenant:AC.get-empty'], derived_posture: 'unknown' },
];

const manifest = { mode: 'self-hosted', auth_tier: 'lite', tenant_slug: 't', tenant_kind: 'sim', operator_name: 'op', operator_role: 'bhd_operator' };
const exportWith = (session: Record<string, unknown>) =>
  buildReadinessResult(
    { id: 'e1', engagement_kind: 'individual_contractor' } as never,
    { id: 'p1' } as never,
    { id: 's1', facts: [], created_at: '2026-10-23T00:00:00.000Z', readiness_manifest: manifest, ...session } as never,
    QUESTION_GRAPH,
  );

beforeEach(() => clearDiscoveryObservations());

describe('MG-23 ran_entry_ids', () => {
  test('observation handoff round-trips and is consumed once', () => {
    storeDiscoveryObservations(OBS);
    expect(loadDiscoveryObservations()).toEqual(OBS);
    clearDiscoveryObservations();
    expect(loadDiscoveryObservations()).toEqual([]);
  });

  test('storing an empty list clears any stale rows', () => {
    storeDiscoveryObservations(OBS);
    storeDiscoveryObservations([]);
    expect(loadDiscoveryObservations()).toEqual([]);
  });

  test('a session with persisted executor rows exports the entries that ran (and passes ajv)', () => {
    const out = exportWith({
      discovery_results: OBS.map(({ control_id, objective_ids, confidence }) => ({ control_id, objective_ids, confidence })),
      discovery_observations: OBS,
    });
    const ran = out.observations.flatMap((o) => o.ran_entry_ids).sort();
    expect(ran).toEqual(['tenant:AC.get-empty', 'tenant:AC.get-roles']);
    expect(out.observations.find((o) => o.control_id === 'AC.L2-3.1.5')?.raw_capture_ref).toBe('captures/AC.get-roles.json');
  });

  test('a fixture / bare-results session still exports (empty ran_entry_ids is the documented fallback)', () => {
    const out = exportWith({ discovery_results: [{ control_id: 'AC.L2-3.1.5', objective_ids: [], confidence: 'high' }] });
    expect(out.observations[0].ran_entry_ids).toEqual([]);
  });
});
