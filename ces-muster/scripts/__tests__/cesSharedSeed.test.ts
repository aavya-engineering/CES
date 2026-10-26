// @vitest-environment node
// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// S1.1: muster-api/src/data/ces-shared-seed.json must equal what
// scripts/build-ces-shared-seed.ts builds from the vendored catalog, Store and
// registry — so a change to any source is noticed in CI.
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildSeed } from '../build-ces-shared-seed';

const file = path.resolve(__dirname, '../../muster-api/src/data/ces-shared-seed.json');

describe('S1.1 CES-Shared seed', () => {
  it('is up to date with its sources', () => {
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual(buildSeed());
  });

  it('has the counts BHD named: 50 archetypes, mappings for the 110 requirements, 107 registry rules', () => {
    const seed = buildSeed();
    expect(seed.archetype).toHaveLength(50);
    expect(seed.rule).toHaveLength(107);
    expect(new Set(seed.mapping.map((m) => m.control_id)).size).toBe(110);
    expect(seed.mapping).toHaveLength(450);
    // P2-13: upper-case archetype codes everywhere.
    expect(seed.mapping.every((m) => /^EMX-[A-Z0-9]+-\d{3}$/.test(String(m.archetype_code)))).toBe(true);
  });
});
