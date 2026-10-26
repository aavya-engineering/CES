// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// evidenceData.ts — UI-02: the Planner's Evidence Archetype Catalog and Assessor
// Evidence Matrix, which Muster already ships as static knowledge files
// (public/knowledge, pinned in vendor-manifest.json). Fetched from this app's
// own static assets — never an API origin. Read-only.
import { load } from 'js-yaml';

export const ARCHETYPE_FILE = '/knowledge/domain Evidence Archetype Catalog.yaml';
export const MATRIX_FILE = '/knowledge/domain Assessor Evidence Matrix.yaml';

export interface EvidenceArchetype {
  archetype_id: string;
  domain: string;
  name: string;
  description: string;
  assessor_methods_expected: string[];
  acceptable_forms_examples: string[];
  collection_notes?: string;
  retention_notes_template?: string;
  maps_to_cmmc_practices: string[];
}

export interface ArchetypeCatalog {
  version: string;
  generated_on: string;
  domains: string[];
  archetypes: EvidenceArchetype[];
}

export interface EvidenceMapping {
  practice_id: string;
  assessor_methods: string[];
  evidence: { emx_id: string; strength: string; description: string }[];
  anti_patterns: string[];
  truth_tag?: string;
}

export interface EvidenceMatrix {
  version: string;
  generated_on: string;
  strength_tiers: string[];
  mappings: EvidenceMapping[];
}

/** js-yaml reads an unquoted 2026-02-03 as a Date; show it as written. */
function dateText(v: unknown): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
}

export function parseArchetypeCatalog(text: string): ArchetypeCatalog {
  const d = load(text) as {
    version: string;
    generated_on: string;
    domains: string[];
    evidence_archetypes: EvidenceArchetype[];
  };
  return {
    version: String(d.version),
    generated_on: dateText(d.generated_on),
    domains: d.domains ?? [],
    archetypes: (d.evidence_archetypes ?? []).map((a) => ({
      ...a,
      assessor_methods_expected: a.assessor_methods_expected ?? [],
      acceptable_forms_examples: a.acceptable_forms_examples ?? [],
      maps_to_cmmc_practices: a.maps_to_cmmc_practices ?? [],
    })),
  };
}

export function parseEvidenceMatrix(text: string): EvidenceMatrix {
  const d = (load(text) as { ces: Record<string, unknown> }).ces;
  return {
    version: String(d.version),
    generated_on: dateText(d.generated_on),
    strength_tiers: (d.evidence_strength_tiers as string[]) ?? [],
    mappings: (d.mappings as EvidenceMapping[]) ?? [],
  };
}

async function fetchText(path: string): Promise<string> {
  const res = await fetch(encodeURI(path));
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
}

export async function loadArchetypeCatalog(): Promise<ArchetypeCatalog> {
  return parseArchetypeCatalog(await fetchText(ARCHETYPE_FILE));
}

export async function loadEvidenceMatrix(): Promise<EvidenceMatrix> {
  return parseEvidenceMatrix(await fetchText(MATRIX_FILE));
}

export const DOMAIN_LABELS: Record<string, string> = {
  BOUNDARY: 'Boundary & scope',
  DATAFLOW: 'Data flow',
  IAM: 'Identity & access',
  ENDPOINT: 'Endpoint',
  LOG: 'Logging & monitoring',
  CONFIG: 'Configuration',
  SUPPLIER: 'Supplier',
  VULN: 'Vulnerability management',
  IR: 'Incident response',
  MEDIA: 'Media protection',
  DEVOPS: 'DevOps',
  RISK: 'Risk',
  TRAINING: 'Training',
};

export function domainLabel(code: string): string {
  return DOMAIN_LABELS[code] ?? code;
}
