// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// evidenceCatalog.test.ts — the vendored BHD evidence catalog loads and validates;
// coverage is per NIST examine object and per assessment objective; the row
// validator catches the three error classes Mark's batch review named
// (wrong-slot text, missing / double ids, foreign objective ids).

import { describe, it, expect } from 'vitest';
import { loadCatalog, requirementCoverage, catalogSummary, validateCatalogRows, toNistRef } from '../src/services/evidenceCatalog.js';

describe('evidence catalog (vendored)', () => {
  it('loads release 0 (14 definitions for 3.1.1), 110 examine lists and 320 objectives', () => {
    const cat = loadCatalog();
    expect(cat.releases).toHaveLength(1);
    expect(cat.definitions).toHaveLength(14);
    expect(cat.byNist.get('3.1.1')).toHaveLength(14);
    expect(cat.examine.size).toBe(110);
    expect(cat.objectiveById.size).toBe(320);
    expect(cat.examine.get('3.1.1')!.examine[0]).toBe('Access control policy');
    expect(toNistRef('AC.L2-3.1.1')).toBe('3.1.1');
  });

  it('coverage: an item filed against a definition covers its examine object and objectives; undefined objects stay undefined', () => {
    const items = [
      { id: 'i1', status: 'validated', requirement_ids: ['AC.L1-3.1.1'], objective_ids: [], metadata: { definition_id: 'AC.L2-3.1.1#E01' } },
      { id: 'i2', status: 'draft', requirement_ids: ['AC.L1-3.1.1'], objective_ids: ['AC.L1-3.1.1[c]'] },
    ];
    const c = requirementCoverage('AC.L1-3.1.1', items);
    expect(c.summary).toMatchObject({ examine_total: 14, examine_defined: 14, examine_covered: 1, objectives_total: 6 });
    expect(c.examine[0].state).toBe('covered');
    expect(c.examine[1].state).toBe('missing');
    expect(c.objectives.find((o) => o.objective_id === 'AC.L1-3.1.1[a]')!.state).toBe('covered'); // via E01's objective_ids
    const u = requirementCoverage('IA.L2-3.5.3', []);
    expect(u.examine.length).toBeGreaterThan(0);
    expect(u.examine.every((e) => e.state === 'undefined')).toBe(true); // no release covers 3.5.3 yet
    const summary = catalogSummary(items);
    expect(summary).toHaveLength(110);
    expect(summary.find((s) => s.nist_ref === '3.1.1')!.examine_covered).toBe(1);
  });

  it("validator: release 0 is clean; Mark's error classes are reported with a suggested fix", () => {
    const cat = loadCatalog();
    expect(validateCatalogRows(cat.definitions).findings.filter((f) => f.severity === 'fix')).toEqual([]);
    const good = cat.byId.get('AC.L2-3.1.1#E02')!;
    const rows = [
      { ...good, examine_text: cat.examine.get('3.1.9')!.examine[0], definition_id: 'AC.L2-3.1.1#E02' }, // 3.1.9's text under 3.1.1 (the 3.1.7 / 3.1.9 mix-up)
      { ...good, definition_id: undefined },                                                                 // no id
      { ...good, definition_id: 'AC.L2-3.1.1#E03', form_id: 'acp_policy; account_procedures' },             // two ids in one cell
      { ...good, definition_id: 'AC.L2-3.1.1#E04', objective_ids: ['IA.L2-3.5.3[a]'] },                       // objective of another requirement
      { ...good, definition_id: 'AC.L2-3.1.1#E05', examine_text: good.examine_text.toUpperCase() },           // same words, wrong case → tidy
    ];
    const r = validateCatalogRows(rows);
    const codes = (row: number) => r.findings.filter((f) => f.row === row).map((f) => `${f.severity}:${f.code}`);
    expect(codes(1)).toContain('fix:examine_text');
    expect(codes(2)).toContain('fix:id_missing');
    expect(codes(3)).toContain('fix:form_multiple');
    expect(codes(4)).toContain('fix:objective_foreign');
    expect(codes(5)).toEqual(['tidy:examine_text']);
    expect(r.findings.find((f) => f.row === 5)!.suggested_fix).toBe(good.examine_text);
    expect(r.ok).toBe(1);
  });
});
