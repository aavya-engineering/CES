// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// assessApi.ts — Sprint 3/4 slice "Assess": typed client for
// /api/engagements/:id/assessments (runs, results, gaps, overrides).

import { api } from '@/shared/api/musterApi';
import type { ReadinessResult } from '@/shared/types/readinessResult';

export type RequirementStatus = 'met' | 'partial' | 'not_met' | 'unknown';
export const STATUS_LABEL: Record<RequirementStatus, string> = { met: 'Met', partial: 'Partial', not_met: 'Not met', unknown: 'Unknown' };
export const STATUS_TONE: Record<RequirementStatus, 'good' | 'warn' | 'bad' | undefined> = { met: 'good', partial: 'warn', not_met: 'bad', unknown: undefined };

export interface FamilySummary { family: string; name: string; total: number; met: number; partial: number; not_met: number; unknown: number; deduction: number }

export interface AssessmentRun {
  id: string;
  engagement_id: string;
  source: 'readiness_result' | 'delivery_artifact' | 'manual' | 'engine_run';
  schema_version: string | null;
  label: string | null;
  sprs_now: number;
  sprs_after: number | null;
  met_count: number;
  partial_count: number;
  not_met_count: number;
  unknown_count: number;
  engine: { name: string; version: string } | null;
  generated_at: string | null;
  delivery_artifact_id: string | null;
  created_by: string | null;
  created_at: string;
  by_family?: FamilySummary[];
}

export interface AssessmentResult {
  id: string;
  run_id: string;
  requirement_id: string;
  family: string;
  weight: number;
  status: RequirementStatus;
  engine_status: RequirementStatus;
  confidence: string | null;
  objective_ids: string[];
  ran_entry_ids: string[];
  fixable: 'registry' | 'manual' | null;
  fix_entry_ids: string[];
  override_by: string | null;
  override_at: string | null;
  override_reason: string | null;
  notes: string | null;
}

export interface GapAnalysis {
  run_id: string;
  sprs_now: number;
  sprs_after: number | null;
  gap_count: number;
  deduction_total: number;
  registry_fixable: number;
  registry_fixable_weight: number;
  gaps: AssessmentResult[];
}

const base = (eid: string) => `/api/engagements/${eid}/assessments`;

export interface EngineJob { id: string; engagement_id: string; mode: 'sim' | 'live'; status: 'running' | 'done' | 'failed'; started_at: string; finished_at?: string; run_id?: string; error?: string; stats?: unknown; evidence?: { created: number; missing_files: number } }

export const assessApi = {
  /** ENGINE: walk the command registry against the simulator (or live, behind the gate) and persist the outcome as a run. */
  startRun: (eid: string, body: { mode: 'sim' | 'live'; tenant_slug?: string; consent_ids?: string[]; label?: string }) => api.post<{ job_id: string; status: string; mode: string }>(`${base(eid)}/run`, body),
  job: (eid: string, jobId: string) => api.get<EngineJob>(`${base(eid)}/jobs/${jobId}`),
  runs: (eid: string) => api.get<AssessmentRun[]>(base(eid)),
  run: (eid: string, runId: string) => api.get<AssessmentRun>(`${base(eid)}/${runId}`),
  results: (eid: string, runId: string) => api.get<AssessmentResult[]>(`${base(eid)}/${runId}/results`),
  gaps: (eid: string, runId: string) => api.get<GapAnalysis>(`${base(eid)}/${runId}/gaps`),
  ingest: (eid: string, record: ReadinessResult & { label?: string }) => api.post<AssessmentRun>(base(eid), record, 60_000),
  fromArtifact: (eid: string, artifactId: string) => api.post<AssessmentRun>(`${base(eid)}/from-artifact/${artifactId}`),
  override: (eid: string, runId: string, requirementId: string, body: { status: RequirementStatus; reason: string; notes?: string | null }) =>
    api.patch<{ result: AssessmentResult; run: AssessmentRun }>(`${base(eid)}/${runId}/results/${requirementId}`, body),
};
