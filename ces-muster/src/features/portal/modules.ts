// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// modules.ts — UI-02: facts the info pages show — contract versions (ces-mono
// snapshot 2026-10-10, ces-shared/src/types/*.contract.ts) and where the other
// CES apps run on this machine (ports from doc 18 §2).

/** Contract versions as of the ces-mono snapshot (ces-shared/src/types/*.contract.ts). */
export const CONTRACTS = [
  { name: 'Mission plan', constant: 'MISSION_PLAN_CONTRACT_VERSION', version: '1.0.0', file: 'mission-plan.contract.ts', producer: 'Muster', consumer: 'Stamper' },
  { name: 'Execution results', constant: 'EXECUTION_RESULTS_CONTRACT_VERSION', version: '1.1.0', file: 'execution-results.contract.ts', producer: 'Stamper', consumer: 'Muster' },
  { name: 'AdminOps evidence row', constant: 'ADMINOPS_EVIDENCE_CONTRACT_VERSION', version: '1.3.0', file: 'adminops-evidence.contract.ts', producer: 'AdminOps', consumer: 'EvidenceOps' },
  { name: 'Evidence collector', constant: 'EC_CONTRACT_VERSION', version: '1.0.0', file: 'evidence-collector.contract.ts', producer: 'Evidence Collector', consumer: 'EvidenceOps' },
] as const;

export const MODULES = {
  stamper: {
    name: 'Stamper',
    what: 'Applies the plan to the Microsoft tenant and reads each setting back.',
    port: 5002,
  },
  adminops: {
    name: 'AdminOps',
    what: 'Day-2 admin changes with dry run, tiers and second-person approval.',
    port: 5003,
  },
  evidenceops: {
    name: 'EvidenceOps',
    what: 'Evidence snapshots, SPRS, SSP and POA&M; assessor view.',
    port: 5004,
  },
} as const;

export type ModuleKey = keyof typeof MODULES;

export function moduleUrl(key: ModuleKey): string {
  try {
    const v = localStorage.getItem(`ces-module-url-${key}`);
    if (v) return v;
  } catch {
    /* storage blocked */
  }
  return `http://localhost:${MODULES[key].port}`;
}

