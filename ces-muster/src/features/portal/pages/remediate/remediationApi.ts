// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// remediationApi.ts — Sprint 5 slice "Remediate": typed client for
// /api/engagements/:id/remediation (registry indexes, runs, gates, approval).

import { api } from '@/shared/api/musterApi';

export type RemediationModule = 'stamper' | 'adminops';
export type RunMode = 'simulate' | 'live';
export const RUN_STATUSES = ['requested', 'approved', 'rejected', 'blocked', 'queued', 'running', 'succeeded', 'failed', 'verified', 'cancelled'] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export const RUN_STATUS_LABEL: Record<RunStatus, string> = { requested: 'Awaiting approval', approved: 'Approved', rejected: 'Rejected', blocked: 'Blocked by gate', queued: 'Queued for runner', running: 'Running', succeeded: 'Finished — verify', failed: 'Failed', verified: 'Verified', cancelled: 'Cancelled' };
export const RUN_STATUS_TONE: Record<RunStatus, 'good' | 'warn' | 'bad' | 'info' | undefined> = { requested: 'warn', approved: 'info', rejected: 'bad', blocked: 'bad', queued: 'info', running: 'info', succeeded: 'warn', failed: 'bad', verified: 'good', cancelled: undefined };

export interface Gate { id: string; label: string; ok: boolean; note?: string; blocking: boolean }
export interface StamperEntry { entry_id: string; control_ids: string[]; label: string; engine: string | null; registry: string; has_set: boolean; has_get: boolean; manual_only: boolean; idempotency: string | null; variables_required: string[]; azure_tier: string | null; module: string | null }
export interface AdminOpParam { name: string; label: string; type: string; required: boolean; placeholder?: string | null }
export interface AdminOp { id: string; title: string; domain: string; domain_name: string; trigger: string | null; priority: string | null; sod_tier: string | null; cmmc_practices: string[]; idempotency_class: string | null; overview: string | null; parameters: AdminOpParam[] }

export interface RemediationRun {
  id: string;
  module: RemediationModule;
  mode: RunMode;
  action_id: string | null;
  requirement_id: string | null;
  entry_ids: string[];
  op_id: string | null;
  parameters: Record<string, string> | null;
  justification: string;
  status: RunStatus;
  gates: Gate[];
  cost_estimate: number;
  requires_approval: boolean;
  requested_by: string;
  requested_at: string;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  started_at: string | null;
  finished_at: string | null;
  result: { simulated?: boolean; queued?: boolean; note?: string; tenant_touched?: boolean; claimed_by?: string; claimed_at?: string; runner?: string; summary?: string; evidence_ids?: string[]; held?: number; steps?: { step: number; label?: string; kind?: string; entry_id?: string; op_id?: string; outcome: string; detail?: string; duration_ms?: number }[] } | null;
  verified_by: string | null;
  verified_at: string | null;
  verification_notes: string | null;
  entries?: StamperEntry[];
  op?: AdminOp | null;
}

export interface RemediationSummary {
  actions: { open: number; in_progress: number; blocked: number; done: number };
  runs: { total: number; by_status: Record<RunStatus, number>; pending_approval: number; pending_verification: number; by_module: { stamper: number; adminops: number } };
  registry: { stamper_entries: number; stamper_set_entries: number; adminops_operations: number };
}

export type RunRequest =
  | { module: 'stamper'; mode: RunMode; entry_ids: string[]; action_id?: string | null; requirement_id?: string | null; justification: string }
  | { module: 'adminops'; mode: RunMode; op_id: string; parameters: Record<string, string>; action_id?: string | null; requirement_id?: string | null; justification: string };

const base = (eid: string) => `/engagements/${eid}/remediation`;
export const remediationApi = {
  summary: (eid: string) => api.get<RemediationSummary>(`${base(eid)}/summary`),
  stamperRegistry: (eid: string, q?: { control?: string; q?: string }) => api.get<StamperEntry[]>(`${base(eid)}/registry/stamper${q?.control || q?.q ? `?${new URLSearchParams({ ...(q.control ? { control: q.control } : {}), ...(q.q ? { q: q.q } : {}) })}` : ''}`),
  adminOps: (eid: string, domain?: string) => api.get<AdminOp[]>(`${base(eid)}/registry/adminops${domain ? `?domain=${domain}` : ''}`),
  runs: (eid: string, module?: RemediationModule) => api.get<RemediationRun[]>(`${base(eid)}/runs${module ? `?module=${module}` : ''}`),
  run: (eid: string, id: string) => api.get<RemediationRun>(`${base(eid)}/runs/${id}`),
  request: (eid: string, body: RunRequest) => api.post<RemediationRun>(`${base(eid)}/runs`, body),
  approve: (eid: string, id: string) => api.post<RemediationRun>(`${base(eid)}/runs/${id}/approve`),
  reject: (eid: string, id: string, reason: string) => api.post<RemediationRun>(`${base(eid)}/runs/${id}/reject`, { reason }),
  execute: (eid: string, id: string) => api.post<RemediationRun>(`${base(eid)}/runs/${id}/execute`),
  verify: (eid: string, id: string, verified: boolean, notes: string) => api.post<{ run: RemediationRun }>(`${base(eid)}/runs/${id}/verify`, { verified, notes }),
  cancel: (eid: string, id: string) => api.post<RemediationRun>(`${base(eid)}/runs/${id}/cancel`),
};
