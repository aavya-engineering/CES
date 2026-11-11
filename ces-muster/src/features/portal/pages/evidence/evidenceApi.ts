// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// evidenceApi.ts — Sprint 6 slice "Collect Evidence": typed client for /api/engagements/:id/evidence.

import { api, getApiBase } from '@/shared/api/musterApi';

export const EVIDENCE_KINDS = ['document', 'screenshot', 'export', 'config_capture', 'attestation', 'log', 'other'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];
export const EVIDENCE_SOURCES = ['upload', 'stamper', 'adminops', 'discovery', 'manual'] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];
export const EVIDENCE_STATUSES = ['draft', 'submitted', 'validated', 'rejected', 'expired', 'archived'] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];
export const STATUS_LABEL: Record<EvidenceStatus, string> = { draft: 'Draft', submitted: 'Awaiting review', validated: 'Validated', rejected: 'Rejected', expired: 'Expired', archived: 'Archived' };
export const STATUS_TONE: Record<EvidenceStatus, 'good' | 'warn' | 'bad' | 'info' | undefined> = { draft: undefined, submitted: 'warn', validated: 'good', rejected: 'bad', expired: 'bad', archived: undefined };
export const KIND_LABEL: Record<EvidenceKind, string> = { document: 'Document', screenshot: 'Screenshot', export: 'Export (CSV/JSON)', config_capture: 'Configuration capture', attestation: 'Attestation', log: 'Log', other: 'Other' };

export interface Check { id: string; label: string; ok: boolean; blocking: boolean; note?: string }
export interface RuleResult { code: string; name: string; outcome: 'met' | 'not_met' | 'partial' | 'runtime' | 'not_applicable'; message: string; conditions: { check: string; value: string; ok: boolean | null }[] }
export interface ValidationReport { checked_at: string; passed: boolean; strength: 'weak' | 'adequate' | 'strong'; checks: Check[]; rules: RuleResult[]; mapping: { type: 'required' | 'recommended' | 'none'; expected_strength: string | null } }

export interface EvidenceItem {
  id: string; title: string; description: string | null; requirement_ids: string[]; objective_ids: string[]; archetype_code: string | null; form: string | null;
  kind: EvidenceKind; source: EvidenceSource; file_name: string | null; content_type: string | null; size_bytes: number; sha256: string | null; metadata: Record<string, unknown> | null;
  collected_at: string; period_start: string | null; period_end: string | null; owner: string | null; classification: 'cui' | 'non_cui' | 'internal';
  status: EvidenceStatus; validation: ValidationReport | null; reviewed_by: string | null; reviewed_at: string | null; review_notes: string | null;
  run_id: string | null; version: number; supersedes_id: string | null; retention_until: string | null; created_by: string | null; created_at: string; updated_at: string;
  related_versions?: EvidenceItem[];
}
export type EvidenceInput = Partial<Pick<EvidenceItem, 'title' | 'description' | 'requirement_ids' | 'objective_ids' | 'archetype_code' | 'form' | 'kind' | 'source' | 'file_name' | 'content_type' | 'metadata' | 'collected_at' | 'period_start' | 'period_end' | 'owner' | 'classification' | 'run_id' | 'retention_until'>> & { content_base64?: string | null; definition_id?: string | null };

export interface EvidenceRequest { id: string; requirement_id: string; archetype_code: string | null; title: string; instructions: string | null; assignee: string | null; due_date: string | null; status: 'open' | 'submitted' | 'fulfilled' | 'cancelled'; evidence_item_id: string | null; created_at: string }
export interface Coverage { requirement_id: string; required: number; covered: number; pending: number; missing: string[]; recommended: number; items: number; state: 'covered' | 'partial' | 'missing' | 'none_required' }
export interface Archetype { code: string; name: string; domain: string; description?: string; acceptable_forms: string[]; assessor_methods: string[]; collection_notes?: string }
export interface Mapping { control_id: string; archetype_code: string; mapping_type: 'required' | 'recommended'; expected_strength: string | null }
export interface Catalogue { archetypes: Archetype[]; mappings: Mapping[]; rules: { code: string; name: string; applies_to: { requirements: string[]; archetypes: string[] } }[] }
export interface EvidenceSummary {
  items: { total: number; by_status: Record<EvidenceStatus, number>; by_source: Record<EvidenceSource, number>; pending_review: number; expiring_30d: number; cui: number };
  coverage: { requirements: number; covered: number; partial: number; missing: number; none_required: number };
  requests: { total: number; open: number; overdue: number };
  catalogue: { archetypes: number; mappings: number; rules: number };
}

const base = (eid: string) => `/engagements/${eid}/evidence`;
/** BHD evidence catalog (per NIST SP 800-171A examine object / assessment objective). */
export interface CatalogDefinition { definition_id: string; requirement_id: string; nist_ref: string; examine_index: number; examine_text: string; form_id: string; form_title: string; emx_ids: string[]; objective_ids: string[]; tier: 'must_have' | 'nice_to_have'; production: 'signal' | 'capture' | 'rendered' | 'attested'; collection_guidance?: string; status: string }
export type CatalogState = 'covered' | 'pending' | 'missing' | 'undefined';
export interface CatalogRequirementRow { requirement_id: string; nist_ref: string; examine_total: number; examine_defined: number; examine_covered: number; objectives_total: number; objectives_covered: number }
export interface CatalogOverview { releases: { release: number; date: string; catalog_version: string; definitions: number }[]; definitions: number; requirements: CatalogRequirementRow[] }
export interface CatalogRequirement { requirement_id: string; nist_ref: string; requirement_text: string | null; examine: { examine_index: number; examine_text: string; definition: CatalogDefinition | null; items: { id: string; status: string; title?: string }[]; state: CatalogState }[]; objectives: { objective_id: string; statement: string; bucket: string; definitions: string[]; items: { id: string; status: string }[]; state: Exclude<CatalogState, 'undefined'> }[]; summary: Omit<CatalogRequirementRow, 'requirement_id' | 'nist_ref'> }
export interface CatalogFinding { row: number; definition_id: string | null; severity: 'fix' | 'tidy'; code: string; message: string; suggested_fix?: string }

export const evidenceApi = {
  nistCatalog: (eid: string) => api.get<CatalogOverview>(`${base(eid)}/nist-catalog`),
  nistRequirement: (eid: string, requirementId: string) => api.get<CatalogRequirement>(`${base(eid)}/nist-catalog/${requirementId}`),
  nistValidate: (eid: string, rows: unknown[]) => api.post<{ findings: CatalogFinding[]; ok: number; total: number }>(`${base(eid)}/nist-catalog/validate`, { rows }),
  summary: (eid: string) => api.get<EvidenceSummary>(`${base(eid)}/summary`),
  catalog: (eid: string) => api.get<Catalogue>(`${base(eid)}/catalog`),
  coverage: (eid: string) => api.get<Coverage[]>(`${base(eid)}/coverage`),
  items: (eid: string, q?: { requirement?: string; status?: string; source?: string; archetype?: string; q?: string }) => { const p = new URLSearchParams(Object.fromEntries(Object.entries(q ?? {}).filter(([, v]) => v) as [string, string][])); return api.get<EvidenceItem[]>(`${base(eid)}/items${p.toString() ? `?${p}` : ''}`); },
  item: (eid: string, id: string) => api.get<EvidenceItem>(`${base(eid)}/items/${id}`),
  create: (eid: string, body: EvidenceInput) => api.post<EvidenceItem>(`${base(eid)}/items`, body, 120_000),
  update: (eid: string, id: string, body: EvidenceInput) => api.patch<EvidenceItem>(`${base(eid)}/items/${id}`, body),
  validate: (eid: string, id: string) => api.post<{ item: EvidenceItem; validation: ValidationReport }>(`${base(eid)}/items/${id}/validate`),
  submit: (eid: string, id: string) => api.post<EvidenceItem>(`${base(eid)}/items/${id}/submit`),
  review: (eid: string, id: string, decision: 'approve' | 'reject', notes: string) => api.post<EvidenceItem>(`${base(eid)}/items/${id}/review`, { decision, notes }),
  newVersion: (eid: string, id: string, body: EvidenceInput) => api.post<EvidenceItem>(`${base(eid)}/items/${id}/new-version`, body, 120_000),
  archive: (eid: string, id: string) => api.post<EvidenceItem>(`${base(eid)}/items/${id}/archive`),
  contentUrl: (eid: string, id: string) => `${getApiBase()}${base(eid)}/items/${id}/content`,
  requests: (eid: string) => api.get<EvidenceRequest[]>(`${base(eid)}/requests`),
  createRequest: (eid: string, body: Partial<EvidenceRequest>) => api.post<EvidenceRequest>(`${base(eid)}/requests`, body),
  generateRequests: (eid: string, body: { requirement_ids?: string[]; only_gaps_of_run?: string; assignee?: string | null; due_date?: string | null }) => api.post<{ created: number; requests: EvidenceRequest[] }>(`${base(eid)}/requests/generate`, body),
  updateRequest: (eid: string, id: string, body: Partial<EvidenceRequest>) => api.patch<EvidenceRequest>(`${base(eid)}/requests/${id}`, body),
};

export const toBase64 = (file: File) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1] ?? ''); r.onerror = () => reject(r.error); r.readAsDataURL(file); });
