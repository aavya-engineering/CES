// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// requirementMetaData.ts — S1.2: requirement metadata helpers (no components):
// NIST SP 800-171 Rev 2 text and type (CMMC workbook), labels, loading.
import { useMemo } from 'react';
import NIST from '../../../muster-api/src/data/nist-800-171r2.json';
import type { ItemView, ModuleId, RequirementMeta } from '@/shared/api/sharedApi';
import { useGovernedList, useSharedViewer } from './governedState';

const nist = new Map((NIST as { requirements: { nist_ref: string; requirement_type: string; nist_text: string }[] }).requirements.map((n) => [n.nist_ref, n]));
export const nistOf = (nistRef: string) => nist.get(nistRef) ?? null;

export const MODULE_LABEL: Record<ModuleId, string> = { muster: 'Muster', stamper: 'Stamper', adminops: 'AdminOps', evidenceops: 'EvidenceOps' };
export const PRIORITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' } as const;
export const PRIORITY_TONE = { high: 'bad', medium: 'warn', low: 'info' } as const;

/** Requirement metadata keyed by control ID (signed in only). */
export function useRequirementMeta() {
  const viewer = useSharedViewer();
  const { s, reload } = useGovernedList<RequirementMeta>('requirement_meta', viewer.signedIn);
  const byId = useMemo(() => new Map((s.state === 'ready' ? s.data : []).map((v) => [v.key, v])), [s]);
  return { byId, state: s.state, error: s.state === 'error' ? s.message : null, reload };
}

/** The metadata a viewer sees: an editor sees their draft, everyone else the published version. */
export function metaFor(view: ItemView<RequirementMeta> | undefined, canEdit: boolean): RequirementMeta | null {
  if (!view) return null;
  return (canEdit && view.draft ? view.draft.data : view.current) ?? null;
}

