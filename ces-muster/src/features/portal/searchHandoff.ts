// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// searchHandoff.ts — S1.4: the top-bar search hands its query to the page it
// opens. One pending query per route; the page takes it once on mount.
import type { RouteId } from './nav';
import { REQUIREMENTS } from './referenceData';

// A query is honoured for a few seconds after it is set, and is not removed
// on read: React may render a page twice in development (StrictMode).
const pending = new Map<RouteId, { q: string; at: number }>();
const FRESH_MS = 1000;

export function setPendingSearch(route: RouteId, q: string): void {
  pending.set(route, { q, at: Date.now() });
}

/** The query the top-bar search left for this route, or '' when none is fresh. */
export function takePendingSearch(route: RouteId): string {
  const p = pending.get(route);
  return p && Date.now() - p.at < FRESH_MS ? p.q : '';
}

export interface Hit {
  id: string;
  route: RouteId;
  q: string;
  primary: string;
  secondary: string;
}

const SCOPES: { route: RouteId; label: string }[] = [
  { route: 'shared/evidence', label: 'Standard Evidence Catalog' },
  { route: 'shared/mapping', label: 'Requirement-to-Evidence Mapping' },
  { route: 'shared/rules', label: 'Evaluation Rules' },
];

export function searchHits(q: string, allowed: ReadonlySet<RouteId>): Hit[] {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  const hits: Hit[] = [];
  if (allowed.has('shared/requirements')) {
    for (const r of REQUIREMENTS) {
      if (hits.length >= 6) break;
      if (`${r.control_id} ${r.nist_ref} ${r.practice}`.toLowerCase().includes(needle)) {
        hits.push({ id: `req-${r.control_id}`, route: 'shared/requirements', q: r.control_id, primary: r.control_id, secondary: r.practice });
      }
    }
  }
  for (const s of SCOPES) {
    if (allowed.has(s.route)) hits.push({ id: `in-${s.route}`, route: s.route, q: q.trim(), primary: `Search “${q.trim()}”`, secondary: `in ${s.label}` });
  }
  return hits;
}
