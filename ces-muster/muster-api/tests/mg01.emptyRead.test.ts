// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// MG-01 — an empty discovery read must not score as met. The executor records
// it with confidence 'unknown' + posture 'unknown', and status 'empty', so no
// downstream consumer can treat "the read ran" as "the requirement is met".
import { describe, it, expect, vi } from 'vitest';
import {
  runDiscovery,
  type RegistryGetEntry,
  type DiscoverySession,
  type CaptureSink,
} from '../src/services/discoveryService.js';

const capture: CaptureSink = { write: (id) => `captures/${id}.json` };
const session = (stdout: string): DiscoverySession => ({
  execute: vi.fn(async () => ({ stdout, stderr: '', exitCode: 0, durationMs: 1 })),
});
const ENTRY: RegistryGetEntry[] = [
  { entry_id: 'AC.get-ca', control_ids: ['AC.L2-3.1.12'], engine: 'mgraph', get_command: 'Get-MgPolicy' },
];

describe('MG-01 empty discovery read', () => {
  for (const blank of ['', '   ', '\r\n']) {
    it(`records ${JSON.stringify(blank)} output as unknown/unknown, status empty, no capture`, async () => {
      const { observations, statuses } = await runDiscovery(ENTRY, session(blank), capture);
      expect(observations).toHaveLength(1);
      expect(observations[0].confidence).toBe('unknown');
      expect(observations[0].derived_posture).toBe('unknown');
      expect(observations[0].raw_capture_ref).toBeUndefined();
      expect(statuses[0].status).toBe('empty');
    });
  }

  it('still records a non-empty read as high/met with a capture ref (unchanged)', async () => {
    const { observations, statuses } = await runDiscovery(ENTRY, session('[{"state":"enabled"}]'), capture);
    expect(observations[0].confidence).toBe('high');
    expect(observations[0].derived_posture).toBe('met');
    expect(observations[0].raw_capture_ref).toBe('captures/AC.get-ca.json');
    expect(statuses[0].status).toBe('ok');
  });
});
