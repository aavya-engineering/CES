// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// build-ces-shared-seed.ts — S1.1 (doc 26): build muster-api's CES-Shared seed
// from the sources BHD named (response to Tech Arch V1.0, P1-9):
//   archetypes  ← public/knowledge/domain Evidence Archetype Catalog.yaml (50)
//   mappings    ← public/knowledge/domain CES CMMC Fundamental Requirements Store.yaml,
//                 evidence_minimum of each of the 110 requirements:
//                 must_have → required, nice_to_have → recommended. Assessor
//                 methods = the methods of the Store's objectives that list the
//                 archetype. Strength, rationale and truth tag are not in the
//                 source, so they are left empty (null / "").
//   rules       ← ces-shared control-signal-registry.json (one signal-check rule
//                 per registry entry: its evaluator and signals, unchanged).
// Archetype codes are upper-cased (P2-13). Requirement metadata is not seeded:
// no source holds priority, modules or guidance.
//
// Usage:  npx tsx scripts/build-ces-shared-seed.ts           (write)
//         npx tsx scripts/build-ces-shared-seed.ts --check   (exit 1 if stale)
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'muster-api/src/data/ces-shared-seed.json');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

type Archetype = {
  archetype_id: string;
  domain: string;
  name: string;
  description: string;
  assessor_methods_expected: string[];
  acceptable_forms_examples: string[];
  collection_notes: string;
  retention_notes_template: string;
};
type StoreReq = {
  requirement_id: string;
  assessment_objectives?: { methods: string[]; evidence_archetypes?: string[] }[];
  evidence_minimum?: { must_have?: string[]; nice_to_have?: string[] };
};

export function buildSeed() {
  const catalog = load(read('public/knowledge/domain Evidence Archetype Catalog.yaml')) as { version: string; evidence_archetypes: Archetype[] };
  const store = load(read('public/knowledge/domain CES CMMC Fundamental Requirements Store.yaml')) as { requirements: StoreReq[] };
  const controls = JSON.parse(read('muster-api/src/vendored/ces-shared/data/cmmc-l2-controls.reference.json')) as {
    controls: { control_id: string; cmmc_level: number; practice: string }[];
  };
  const registry = JSON.parse(read('muster-api/src/vendored/ces-shared/data/control-signal-registry.json')) as Record<
    string,
    { signals: Record<string, unknown>[]; evaluator?: string }
  >;
  const ids = new Map(controls.controls.map((c) => [c.control_id, c]));
  const methodsOk = (m: string[]) => m.filter((x) => x === 'examine' || x === 'interview' || x === 'test');

  const archetypes = catalog.evidence_archetypes.map((a) => ({
    code: a.archetype_id.toUpperCase(),
    name: a.name,
    domain: a.domain.toUpperCase(),
    description: a.description,
    assessor_methods: methodsOk(a.assessor_methods_expected),
    acceptable_forms: a.acceptable_forms_examples ?? [],
    collection_notes: a.collection_notes ?? '',
    retention_notes_template: a.retention_notes_template ?? '',
  }));
  const known = new Set(archetypes.map((a) => a.code));

  const mappings: Record<string, unknown>[] = [];
  for (const r of store.requirements) {
    if (!ids.has(r.requirement_id)) continue; // Level 3 and the L2 aliases of L1 practices
    const methodsFor = (code: string) =>
      [...new Set((r.assessment_objectives ?? []).filter((o) => (o.evidence_archetypes ?? []).some((e) => e.toUpperCase() === code)).flatMap((o) => o.methods))]
        .filter((m) => m === 'examine' || m === 'interview' || m === 'test')
        .sort();
    for (const [tier, type] of [['must_have', 'required'], ['nice_to_have', 'recommended']] as const) {
      for (const raw of r.evidence_minimum?.[tier] ?? []) {
        const code = raw.toUpperCase();
        if (!known.has(code)) throw new Error(`${r.requirement_id}: archetype ${raw} is not in the catalog`);
        mappings.push({
          control_id: r.requirement_id,
          archetype_code: code,
          mapping_type: type,
          expected_strength: null,
          assessor_methods: methodsFor(code),
          rationale: '',
          truth_tag: null,
          anti_patterns: [],
        });
      }
    }
  }

  const rules = Object.entries(registry)
    .filter(([id]) => ids.has(id))
    .map(([id, e]) => ({
      code: `EVR-${id}`,
      name: `Signal check — ${id}`,
      rule_type: 'signal_check',
      cmmc_level: ids.get(id)!.cmmc_level,
      category: id.slice(0, 2),
      description: `Reads ${e.signals.length} tenant signal${e.signals.length === 1 ? '' : 's'}${e.evaluator ? ` and applies the ${e.evaluator} evaluator` : ''} (control-signal-registry.json).`,
      tags: ['registry'],
      effective_from: null,
      effective_to: null,
      logic: {
        evaluator: e.evaluator ?? null,
        signals: e.signals, // unchanged from the registry
        conditions: [],
        operator: 'AND',
      },
      applies_to: { requirements: [id], archetypes: [] },
      output: { outcomes: ['met', 'not_met', 'partial', 'not_assessed'], evidence_strength: [], message: '' },
    }));

  return {
    _source:
      'Generated by scripts/build-ces-shared-seed.ts from the Evidence Archetype Catalog, the Fundamental Requirements Store and control-signal-registry.json. Do not edit by hand.',
    catalog_version: catalog.version,
    archetype: archetypes,
    mapping: mappings,
    rule: rules,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const next = JSON.stringify(buildSeed(), null, 2) + '\n';
  if (process.argv.includes('--check')) {
    const now = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf-8') : '';
    if (now !== next) {
      console.error('ces-shared-seed.json is stale: run npx tsx scripts/build-ces-shared-seed.ts');
      process.exit(1);
    }
    console.log('ces-shared-seed.json is up to date');
  } else {
    fs.writeFileSync(OUT, next);
    console.log('wrote', path.relative(ROOT, OUT));
  }
}
