// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// sharedApi.ts — S1.2: the SPA side of /api/v1/ces-shared (muster-api
// routes/cesShared.ts). Only signed-in CES-Shared pages call it; offline
// sessions keep the read-only pages and make no network call (DW#5).
import { getApiBase } from './musterApi';
import { getMusterToken } from './musterToken';

export type Kind = 'requirement_meta' | 'archetype' | 'mapping' | 'rule' | 'custom_requirement';
export type Status = 'draft' | 'published' | 'retired';

export interface ItemRow<D = Record<string, unknown>> {
  id: string;
  kind: Kind;
  item_key: string;
  version: number;
  status: Status;
  data: D;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
  published_by: string | null;
  published_at: string | null;
  retired_by: string | null;
  retired_at: string | null;
}

export interface ItemView<D = Record<string, unknown>> {
  kind: Kind;
  key: string;
  published: ItemRow<D> | null;
  draft: ItemRow<D> | null;
  retired: ItemRow<D> | null;
  current: D | null;
  status: 'published' | 'draft_only' | 'retired';
}

export interface ChangeRow {
  id: string;
  at: string;
  actor_user_id: string;
  actor_role: string | null;
  action: string;
  kind: Kind;
  item_key: string;
  version: number | null;
  detail: Record<string, unknown> | null;
}

export interface ItemDetail<D = Record<string, unknown>> extends ItemView<D> {
  versions: ItemRow<D>[];
  changes: ChangeRow[];
}

/** S1.9: fields the Create / Edit Requirement page adds (optional on older items). */
export interface RequirementExtras {
  assessment_criteria?: string;
  related?: string[];
  dependent?: string[];
  references?: string[];
  status?: 'active' | 'inactive';
  effective_date?: string | null;
}

export interface RequirementMeta extends RequirementExtras {
  control_id: string;
  priority: 'high' | 'medium' | 'low' | null;
  modules: ModuleId[];
  implementation_guidance: string;
}

/** S1.9: an organisation-defined requirement (not one of the 110; no SPRS weight). */
export interface CustomRequirement extends RequirementExtras {
  control_id: string;
  title: string;
  family: string;
  priority: 'high' | 'medium' | 'low';
  description: string;
  source_standard: string;
  source_section: string;
  modules: ModuleId[];
  implementation_guidance: string;
}
export type ModuleId = 'muster' | 'stamper' | 'adminops' | 'evidenceops';
export type Method = 'examine' | 'interview' | 'test';

export interface Archetype {
  code: string;
  name: string;
  domain: string;
  description: string;
  assessor_methods: Method[];
  acceptable_forms: string[];
  collection_notes: string;
  retention_notes_template: string;
}

export interface Mapping {
  control_id: string;
  archetype_code: string;
  mapping_type: 'required' | 'recommended';
  expected_strength: 'weak' | 'adequate' | 'strong' | null;
  assessor_methods: Method[];
  rationale: string;
  truth_tag: 'FACT' | 'INFERENCE' | 'OPEN_QUESTION' | null;
  anti_patterns: string[];
}

export interface RuleSignal {
  type: string;
  endpoint?: string;
  required?: boolean;
  filter?: string;
  variables?: string[];
}
export interface Rule {
  code: string;
  name: string;
  rule_type: 'signal_check' | 'evidence_presence' | 'evidence_attribute' | 'document_review';
  cmmc_level: 1 | 2;
  category: string;
  description: string;
  tags: string[];
  effective_from: string | null;
  effective_to: string | null;
  logic: {
    evaluator: string | null;
    signals: RuleSignal[];
    conditions: { check: 'evidence_present' | 'evidence_current_within_days' | 'attribute_present' | 'approved_by_owner'; value: string }[];
    operator: 'AND' | 'OR';
  };
  applies_to: { requirements: string[]; archetypes: string[] };
  output: { outcomes: ('met' | 'not_met' | 'partial' | 'not_assessed')[]; evidence_strength: ('weak' | 'adequate' | 'strong')[]; message: string };
}

export interface ApiRequirement {
  controlId: string;
  nistRef: string;
  family: { code: string; name: string };
  level: 'L1' | 'L2';
  practice: string;
  nistText: string | null;
  requirementType: 'Basic' | 'Derived' | null;
  sprs: { weight: number; poamAllowed: boolean; poamProhibited: boolean; unscored: boolean; partialCredit: { weight: number; condition: string } | null };
  objectiveCount: number;
  metadata: RequirementMeta | null;
}

export interface Summary {
  requirements: number;
  families: number;
  referenceVersion: string;
  items: Record<Kind, { published: number; draft: number; retired: number }>;
  recentChanges: ChangeRow[];
}

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; message: string; issues?: { path: string; message: string }[] };

async function call<T>(method: string, path: string, body?: unknown): Promise<Result<T>> {
  const token = getMusterToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${getApiBase()}/v1/ces-shared${path}`, {
      method,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 204) return { ok: true, data: undefined as T };
    const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string; details?: { issues?: { path: string; message: string }[] } } } | null;
    if (!res.ok) {
      const message =
        res.status === 401 ? 'Your session has ended. Sign in again.' : res.status === 403 && !json?.error?.message ? 'Your role cannot do this.' : json?.error?.message ?? `muster-api returned ${res.status}.`;
      return { ok: false, status: res.status, message, issues: json?.error?.details?.issues };
    }
    return { ok: true, data: (json && 'data' in json ? json.data : json) as T };
  } catch {
    return { ok: false, status: 0, message: 'muster-api is not reachable. Start it and try again.' };
  } finally {
    clearTimeout(timer);
  }
}

const enc = encodeURIComponent;

export const sharedApi = {
  requirements: () => call<ApiRequirement[]>('GET', '/requirements?pageSize=200'),
  summary: () => call<Summary>('GET', '/summary'),
  list: <D>(kind: Kind) => call<ItemView<D>[]>('GET', `/items/${kind}`),
  get: <D>(kind: Kind, key: string) => call<ItemDetail<D>>('GET', `/items/${kind}/${enc(key)}`),
  create: <D>(kind: Kind, data: D) => call<ItemRow<D>>('POST', `/items/${kind}`, data),
  saveDraft: <D>(kind: Kind, key: string, data: D) => call<ItemRow<D>>('PUT', `/items/${kind}/${enc(key)}`, data),
  discardDraft: (kind: Kind, key: string) => call<void>('DELETE', `/items/${kind}/${enc(key)}/draft`),
  publish: (kind: Kind, key: string) => call<ItemRow>('POST', `/items/${kind}/${enc(key)}/publish`),
  retire: (kind: Kind, key: string) => call<ItemRow>('POST', `/items/${kind}/${enc(key)}/retire`),
  changes: (limit = 50) => call<ChangeRow[]>('GET', `/changes?limit=${limit}`),
  exportRelease: () => call<Record<string, unknown>>('GET', '/export'),
};
