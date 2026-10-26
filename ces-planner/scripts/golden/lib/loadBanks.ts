// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MONO-2026A
// See LICENSE and TERMS.md.

/**
 * MG-04 golden generator — filesystem bank loader.
 *
 * Node equivalent of src/shared/services/dataLoader.ts: the browser loader
 * fetches the same files from /data and runs yaml.load with no transformation,
 * so reading them from public/data gives the generators identical input.
 * File names come from DATA_FILES in that module so the two cannot drift.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

/**
 * DATA_FILES is read from dataLoader.ts as text rather than imported: importing the
 * module pulls in Dexie, AJV and Vite-only `import.meta.env`, none of which exist in
 * plain Node. Parsing keeps one source of truth for the file names.
 */
const DATA_LOADER_TS = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../src/shared/services/dataLoader.ts',
);

function readDataFiles(): Record<string, string> {
  const src = readFileSync(DATA_LOADER_TS, 'utf8');
  const block = /export const DATA_FILES = \{([\s\S]*?)\};/.exec(src);
  if (!block) throw new Error(`DATA_FILES not found in ${DATA_LOADER_TS}`);
  const files: Record<string, string> = {};
  for (const m of block[1].matchAll(/^\s*([A-Z0-9_]+):\s*'([^']+)'/gm)) {
    files[m[1]] = m[2];
  }
  if (Object.keys(files).length === 0) throw new Error('DATA_FILES block parsed empty');
  return files;
}

const DATA_FILES = readDataFiles();

export type BankKey =
  | 'SI_QUESTION_BANK'
  | 'RR_QUESTION_BANK'
  | 'TCP_QUESTION_BANK'
  | 'CMMC_REQUIREMENTS'
  | 'EVIDENCE_ARCHETYPES'
  | 'ASSESSOR_KB'
  | 'EVIDENCE_MATRIX'
  | 'CAPABILITY_TAXONOMY'
  | 'IMPLEMENTATION_PATTERNS'
  | 'VENDOR_PLAYBOOK_M365'
  | 'TECH_REF_CMMC_L2'
  | 'FEDRAMP_INHERITANCE_TABLE';

export function loadBank<T = unknown>(dataDir: string, key: BankKey): T {
  const fileName = DATA_FILES[key];
  if (!fileName) throw new Error(`DATA_FILES has no entry for ${key}`);
  const text = readFileSync(join(dataDir, fileName), 'utf8');
  return (fileName.endsWith('.json') ? JSON.parse(text) : yaml.load(text)) as T;
}

/** Banks the plan chain needs, keyed like the browser hooks. */
export function loadPlanBanks(dataDir: string) {
  return {
    siQuestionBank: loadBank(dataDir, 'SI_QUESTION_BANK'),
    rrQuestionBank: loadBank(dataDir, 'RR_QUESTION_BANK'),
    tcpQuestionBank: loadBank(dataDir, 'TCP_QUESTION_BANK'),
    cmmcRequirements: loadBank(dataDir, 'CMMC_REQUIREMENTS'),
    evidenceArchetypes: loadBank(dataDir, 'EVIDENCE_ARCHETYPES'),
    assessorKB: loadBank(dataDir, 'ASSESSOR_KB'),
    evidenceMatrix: loadBank(dataDir, 'EVIDENCE_MATRIX'),
    capabilityTaxonomy: loadBank(dataDir, 'CAPABILITY_TAXONOMY'),
    implementationPatterns: loadBank(dataDir, 'IMPLEMENTATION_PATTERNS'),
    vendorPlaybook: loadBank(dataDir, 'VENDOR_PLAYBOOK_M365'),
    techRef: loadBank(dataDir, 'TECH_REF_CMMC_L2'),
    fedRAMPInheritanceTable: loadBank(dataDir, 'FEDRAMP_INHERITANCE_TABLE'),
  };
}
