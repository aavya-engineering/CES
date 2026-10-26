// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// portfolioService.ts — S1.8 (doc 28): the Home / Portfolio dashboard, built
// from rows the caller may already read (engagements, parties, milestones and
// engagement audit events of the caller's tenant). Pure: no database access,
// so the rules below are unit-tested directly.
//
// Rules (doc 28 D-6 / D-7 — defaults until BHD confirms):
//   health  closed      → status is 'closed'
//           overdue     → target date is before today
//           at_risk     → an open milestone is overdue, or the engagement is on hold
//           on_track    → otherwise
//   milestone state: overdue (due before today) · due_soon (within 7 days) · upcoming
//   Muster readiness = organisations whose interview is complete / all organisations.
//   Stamper, AdminOps and EvidenceOps readiness: no agreed formula → null ("TBD").

export type Health = 'on_track' | 'at_risk' | 'overdue' | 'closed';
export type MilestoneState = 'overdue' | 'due_soon' | 'upcoming';

export interface EngagementRow {
  id: string;
  engagement_kind: string;
  name: string | null;
  reference_id: string | null;
  cmmc_level: number | null;
  status: string;
  start_date: Date | null;
  target_date: Date | null;
  created_at: Date;
}
export interface PartyRow {
  id: string;
  engagement_id: string;
  name: string;
  lifecycle: string;
  created_at: Date;
  last_activity_at: Date | null;
}
export interface MilestoneRow {
  id: string;
  engagement_id: string;
  name: string;
  due_date: Date;
  completed_at: Date | null;
}
export interface AuditRow {
  at: Date;
  actor_user_id: string | null;
  action: string;
  target_id: string | null;
  detail: Record<string, unknown> | null;
}

export const DONE_LIFECYCLES = new Set(['complete', 'ready', 'validate']);
const DAY = 86_400_000;

/** Calendar day (UTC) as a number, so a date-only column compares cleanly. */
const dayOf = (d: Date) => Math.floor(d.getTime() / DAY);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export function milestoneState(m: MilestoneRow, today: Date): MilestoneState {
  const left = dayOf(m.due_date) - dayOf(today);
  if (left < 0) return 'overdue';
  if (left <= 7) return 'due_soon';
  return 'upcoming';
}

export function healthOf(e: EngagementRow, milestones: MilestoneRow[], today: Date): Health {
  if (e.status === 'closed') return 'closed';
  if (e.target_date && dayOf(e.target_date) < dayOf(today)) return 'overdue';
  if (e.status === 'on_hold') return 'at_risk';
  if (milestones.some((m) => !m.completed_at && milestoneState(m, today) === 'overdue')) return 'at_risk';
  return 'on_track';
}

const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 100));

export interface PortfolioInput {
  engagements: EngagementRow[];
  parties: PartyRow[];
  milestones: MilestoneRow[];
  audit: AuditRow[];
  actorNames: Map<string, string>;
}

export function engagementLabel(e: Pick<EngagementRow, 'name' | 'reference_id' | 'id'>): string {
  return e.name ?? e.reference_id ?? `Engagement ${e.id.slice(0, 8)}`;
}

export function buildPortfolio(input: PortfolioInput, opts: { today: Date; days: number }) {
  const { today, days } = opts;
  const since = today.getTime() - days * DAY;
  const partiesOf = new Map<string, PartyRow[]>();
  for (const p of input.parties) partiesOf.set(p.engagement_id, [...(partiesOf.get(p.engagement_id) ?? []), p]);
  const milestonesOf = new Map<string, MilestoneRow[]>();
  for (const m of input.milestones) milestonesOf.set(m.engagement_id, [...(milestonesOf.get(m.engagement_id) ?? []), m]);
  const byId = new Map(input.engagements.map((e) => [e.id, e]));

  const rows = input.engagements.map((e) => {
    const parties = [...(partiesOf.get(e.id) ?? [])].sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
    const done = parties.filter((p) => DONE_LIFECYCLES.has(p.lifecycle)).length;
    return {
      id: e.id,
      name: engagementLabel(e),
      reference_id: e.reference_id,
      organisation: parties[0]?.name ?? null,
      kind: e.engagement_kind,
      cmmc_level: e.cmmc_level,
      status: e.status,
      health: healthOf(e, milestonesOf.get(e.id) ?? [], today),
      start_date: iso(e.start_date),
      target_date: iso(e.target_date),
      progress: { complete: done, total: parties.length, pct: pct(done, parties.length) },
      created_at: e.created_at.toISOString(),
    };
  });

  // An organisation is a party name; the same customer in two engagements counts once.
  const firstSeen = new Map<string, number>();
  for (const p of input.parties) {
    const k = p.name.trim().toLowerCase();
    firstSeen.set(k, Math.min(firstSeen.get(k) ?? Infinity, p.created_at.getTime()));
  }
  const count = (h: Health) => rows.filter((r) => r.health === h).length;
  const open = rows.filter((r) => r.health !== 'closed').length;
  const totals = {
    organisations: firstSeen.size,
    organisations_new: [...firstSeen.values()].filter((t) => t >= since).length,
    engagements: rows.length,
    engagements_new: input.engagements.filter((e) => e.created_at.getTime() >= since).length,
    open,
    on_track: count('on_track'),
    at_risk: count('at_risk'),
    overdue: count('overdue'),
    closed: count('closed'),
  };
  const by_level = {
    level_1: rows.filter((r) => r.cmmc_level === 1).length,
    level_2: rows.filter((r) => r.cmmc_level === 2).length,
    not_set: rows.filter((r) => r.cmmc_level == null).length,
  };

  const allParties = input.parties.length;
  const doneParties = input.parties.filter((p) => DONE_LIFECYCLES.has(p.lifecycle)).length;
  const readiness = {
    muster: { complete: doneParties, total: allParties, pct: pct(doneParties, allParties) },
    stamper: null,
    adminops: null,
    evidenceops: null,
  };

  const milestones = input.milestones
    .filter((m) => !m.completed_at && byId.has(m.engagement_id) && byId.get(m.engagement_id)!.status !== 'closed')
    .sort((a, b) => a.due_date.getTime() - b.due_date.getTime())
    .slice(0, 10)
    .map((m) => ({
      id: m.id,
      engagement_id: m.engagement_id,
      engagement: engagementLabel(byId.get(m.engagement_id)!),
      name: m.name,
      due_date: iso(m.due_date),
      state: milestoneState(m, today),
    }));

  // Activity: audited engagement / milestone changes, plus what the rows show
  // on their own (an engagement without an audited creation, organisations
  // added, interviews completed, milestones completed).
  const audited = new Set(input.audit.filter((a) => a.action === 'engagement.created').map((a) => a.target_id));
  const ACTION_TEXT: Record<string, string> = {
    'engagement.created': 'Created engagement',
    'engagement.updated': 'Updated engagement',
    'milestone.created': 'Added milestone',
    'milestone.updated': 'Updated milestone',
    'milestone.completed': 'Completed milestone',
    'milestone.deleted': 'Deleted milestone',
  };
  const activity: { at: string; user: string | null; activity: string; details: string }[] = [];
  for (const a of input.audit) {
    const engagementId = (a.detail?.engagement_id as string | undefined) ?? a.target_id ?? '';
    const e = byId.get(engagementId);
    const what = (a.detail?.name as string | undefined) ?? (e ? engagementLabel(e) : '');
    activity.push({
      at: a.at.toISOString(),
      user: a.actor_user_id ? input.actorNames.get(a.actor_user_id) ?? 'A user' : null,
      activity: ACTION_TEXT[a.action] ?? a.action,
      details: e && what !== engagementLabel(e) ? `${engagementLabel(e)} – ${what}` : what,
    });
  }
  for (const e of input.engagements) {
    if (!audited.has(e.id)) activity.push({ at: e.created_at.toISOString(), user: null, activity: 'Created engagement', details: engagementLabel(e) });
  }
  for (const p of input.parties) {
    const e = byId.get(p.engagement_id);
    if (!e) continue;
    activity.push({ at: p.created_at.toISOString(), user: null, activity: 'Added organisation', details: `${engagementLabel(e)} – ${p.name}` });
    if (DONE_LIFECYCLES.has(p.lifecycle) && p.last_activity_at) {
      activity.push({ at: p.last_activity_at.toISOString(), user: null, activity: 'Completed interview', details: `${engagementLabel(e)} – ${p.name}` });
    }
  }
  activity.sort((a, b) => b.at.localeCompare(a.at));

  return {
    generated_at: today.toISOString(),
    range_days: days,
    totals,
    by_level,
    readiness,
    engagements: rows.sort((a, b) => b.created_at.localeCompare(a.created_at)),
    milestones,
    activity: activity.slice(0, 10),
  };
}

export type Portfolio = ReturnType<typeof buildPortfolio>;

/** Platform administrator view (doc 28 D-1): counts only — no names, no readiness. */
export function countsOnly(p: Portfolio) {
  return { generated_at: p.generated_at, range_days: p.range_days, restricted: true as const, totals: p.totals, by_level: p.by_level };
}
