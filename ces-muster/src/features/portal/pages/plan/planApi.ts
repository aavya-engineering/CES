// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// planApi.ts — Sprint 4 slice "Plan": typed client for /api/engagements/:id/plan.

import { api } from '@/shared/api/musterApi';

export const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const ACTION_STATUSES = ['open', 'in_progress', 'blocked', 'done', 'wont_fix'] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];
export const POAM_STATUSES = ['open', 'ongoing', 'completed', 'risk_accepted'] as const;
export type PoamStatus = (typeof POAM_STATUSES)[number];

export const PRIORITY_TONE: Record<Priority, 'bad' | 'warn' | 'info' | undefined> = { critical: 'bad', high: 'warn', medium: 'info', low: undefined };
export const ACTION_STATUS_LABEL: Record<ActionStatus, string> = { open: 'Open', in_progress: 'In progress', blocked: 'Blocked', done: 'Done', wont_fix: "Won't fix" };
export const ACTION_STATUS_TONE: Record<ActionStatus, 'good' | 'warn' | 'bad' | 'info' | undefined> = { open: undefined, in_progress: 'info', blocked: 'bad', done: 'good', wont_fix: 'warn' };
export const POAM_STATUS_LABEL: Record<PoamStatus, string> = { open: 'Open', ongoing: 'Ongoing', completed: 'Completed', risk_accepted: 'Risk accepted' };

export interface PlanAction {
  id: string;
  run_id: string | null;
  requirement_id: string | null;
  family: string | null;
  weight: number;
  title: string;
  description: string | null;
  source: 'gap' | 'manual';
  fix_kind: 'registry' | 'manual';
  fix_entry_ids: string[];
  priority: Priority;
  status: ActionStatus;
  owner: string | null;
  due_date: string | null;
  effort_hours: number | null;
  depends_on: string[];
  sequence: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}
export type PlanActionInput = Partial<Pick<PlanAction, 'title' | 'description' | 'requirement_id' | 'priority' | 'status' | 'owner' | 'due_date' | 'effort_hours' | 'depends_on' | 'sequence' | 'fix_kind' | 'fix_entry_ids' | 'notes'>> & { title?: string };

export interface Milestone { title: string; due_date?: string | null; done: boolean }
export interface PoamItem {
  id: string;
  action_id: string | null;
  requirement_id: string;
  weight: number;
  poam_allowed: boolean;
  weakness: string;
  mitigation: string | null;
  milestones: Milestone[] | null;
  scheduled_completion: string | null;
  responsible: string | null;
  resources: string | null;
  status: PoamStatus;
  created_at: string;
  completed_at: string | null;
}
export type PoamInput = Partial<Pick<PoamItem, 'requirement_id' | 'action_id' | 'weakness' | 'mitigation' | 'milestones' | 'scheduled_completion' | 'responsible' | 'resources' | 'status'>>;

export interface PlanSummary {
  latest_run: { id: string; sprs_now: number; created_at: string } | null;
  actions: { total: number; by_status: Record<ActionStatus, number>; by_priority: Record<Priority, number>; overdue: number; weight_open: number };
  poam: { total: number; by_status: Record<PoamStatus, number>; prohibited: number };
  sprs_if_all_actions_done: number | null;
  next_due: { id: string; title: string; due_date: string; owner: string | null }[];
}

const base = (eid: string) => `/api/engagements/${eid}/plan`;
export const planApi = {
  summary: (eid: string) => api.get<PlanSummary>(`${base(eid)}/summary`),
  actions: (eid: string) => api.get<PlanAction[]>(`${base(eid)}/actions`),
  createAction: (eid: string, body: PlanActionInput) => api.post<PlanAction>(`${base(eid)}/actions`, body),
  generate: (eid: string, run_id: string, statuses?: string[]) => api.post<{ created: number; skipped: number; actions: PlanAction[] }>(`${base(eid)}/actions/generate`, { run_id, ...(statuses ? { statuses } : {}) }),
  updateAction: (eid: string, id: string, body: PlanActionInput) => api.patch<PlanAction>(`${base(eid)}/actions/${id}`, body),
  deleteAction: (eid: string, id: string) => api.delete<void>(`${base(eid)}/actions/${id}`),
  poam: (eid: string) => api.get<PoamItem[]>(`${base(eid)}/poam`),
  createPoam: (eid: string, body: PoamInput) => api.post<PoamItem>(`${base(eid)}/poam`, body),
  poamFromActions: (eid: string) => api.post<{ created: number; items: PoamItem[] }>(`${base(eid)}/poam/from-actions`),
  updatePoam: (eid: string, id: string, body: PoamInput) => api.patch<PoamItem>(`${base(eid)}/poam/${id}`, body),
};

/** YYYY-MM-DD from an ISO date / date-time, for <input type="date">. */
export const ymd = (v: string | null | undefined) => (v ? v.slice(0, 10) : '');
