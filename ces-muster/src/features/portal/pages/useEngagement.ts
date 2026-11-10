// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// useEngagement.ts — the engagement the lifecycle pages (Onboard › Scope,
// Assess › Readiness / Gap Analysis, …) are looking at. Remembered per browser
// (a per-viewer convenience, never state the server needs).

import { useEffect, useState } from 'react';
import { api } from '@/shared/api/musterApi';

export interface EngagementRow { id: string; name?: string | null; reference_id?: string | null; engagement_kind: string; status?: string }

const KEY = 'ces.current.engagement';

export const engagementLabel = (e: EngagementRow) => e.name || e.reference_id || `${e.engagement_kind} · ${e.id.slice(0, 8)}`;

export function useEngagement() {
  const [rows, setRows] = useState<EngagementRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [id, setIdState] = useState<string>(() => { try { return localStorage.getItem(KEY) ?? ''; } catch { return ''; } });
  useEffect(() => {
    let live = true;
    api.get<EngagementRow[]>('/api/engagements').then((r) => {
      if (!live) return;
      if (r.ok) setRows(r.data);
      else { setRows([]); setError(r.status === 403 ? 'Your role cannot list engagements.' : r.degraded ? 'muster-api is not reachable.' : r.error ?? `Request failed (${r.status}).`); }
    });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (rows?.length && (!id || !rows.some((e) => e.id === id))) setIdState(rows[0].id);
  }, [rows, id]);
  const setId = (next: string) => {
    setIdState(next);
    try { localStorage.setItem(KEY, next); } catch { /* per-viewer convenience only */ }
  };
  return { rows, error, id, setId, current: rows?.find((e) => e.id === id) ?? null };
}
