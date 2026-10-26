// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// localEngagements.ts — UI-02: engagements, organisations and interviews held
// in this browser's Muster database (IndexedDB). Read-only; no network.
import { db } from '@/shared/db/schema';

export interface LocalEngagementRow {
  id: string;
  kind: string;
  created_at: string;
  organizations: string[];
  inProgress: number;
  complete: number;
}

export async function loadLocalEngagements(): Promise<LocalEngagementRow[]> {
  const [engagements, parties, sessions] = await Promise.all([
    db.engagements.toArray(),
    db.assessed_parties.toArray(),
    db.interview_sessions.toArray(),
  ]);
  return engagements
    .map((e) => {
      const ps = parties.filter((p) => p.engagement_id === e.id);
      const ids = new Set(ps.map((p) => p.id));
      const ss = sessions.filter((s) => ids.has(s.party_id));
      return {
        id: e.id,
        kind: e.engagement_kind,
        created_at: e.created_at,
        organizations: ps.map((p) => p.name),
        inProgress: ss.filter((s) => s.status === 'in_progress').length,
        complete: ss.filter((s) => s.status === 'complete').length,
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

