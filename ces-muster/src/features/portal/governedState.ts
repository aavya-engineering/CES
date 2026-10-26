// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// governedState.ts — S1.2: who is looking (signed in? may edit?) and the
// loading of governed CES-Shared items from muster-api. Hooks only; the
// components are in governed.tsx.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { sharedApi, type ItemView, type Kind, type Result } from '@/shared/api/sharedApi';

export interface SharedViewer {
  /** Signed in: pages read governed content from muster-api. Offline: read-only files. */
  signedIn: boolean;
  /** platform_admin: may draft, publish (not own drafts) and retire. */
  canEdit: boolean;
  userId: string | null;
}

export const SharedViewerContext = createContext<SharedViewer>({ signedIn: false, canEdit: false, userId: null });
export const useSharedViewer = () => useContext(SharedViewerContext);

export type Loaded<T> = { state: 'idle' } | { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: T };

/** Loads one kind of governed item; reload() after every change. */
export function useGovernedList<D>(kind: Kind, enabled = true) {
  const [s, setS] = useState<Loaded<ItemView<D>[]>>({ state: enabled ? 'loading' : 'idle' });
  const reload = useCallback(async () => {
    if (!enabled) return;
    const r = await sharedApi.list<D>(kind);
    setS(r.ok ? { state: 'ready', data: r.data } : { state: 'error', message: r.message });
  }, [kind, enabled]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { s, reload };
}

/** Status a reader or editor should see for an item. */
export function statusOf(v: ItemView<unknown>): { label: string; tone: 'good' | 'warn' | 'info' | undefined; key: string } {
  if (v.published && v.draft) return { label: 'Published · draft pending', tone: 'info', key: 'pending' };
  if (v.published) return { label: 'Published', tone: 'good', key: 'published' };
  if (v.draft && !v.retired) return { label: 'Draft', tone: 'warn', key: 'draft' };
  return { label: 'Retired', tone: undefined, key: 'retired' };
}

/** What the page shows for an item: the draft to its editor, else the published data. */
export function shownData<D>(v: ItemView<D>, canEdit: boolean): D | null {
  return (canEdit && v.draft ? v.draft.data : v.current) ?? v.retired?.data ?? null;
}

export function describeFailure(r: Extract<Result<unknown>, { ok: false }>): string {
  if (r.issues?.length) return `${r.message}: ${r.issues.map((i) => (i.path ? `${i.path} — ${i.message}` : i.message)).join('; ')}`;
  return r.message;
}

/** One item's versions and change history (reload with the key). */
export function useItemDetail<D>(kind: Kind, key: string | null, bump: number) {
  const [s, setS] = useState<Loaded<import('@/shared/api/sharedApi').ItemDetail<D>>>({ state: 'idle' });
  useEffect(() => {
    if (!key) return setS({ state: 'idle' });
    let live = true;
    setS({ state: 'loading' });
    void sharedApi.get<D>(kind, key).then((r) => live && setS(r.ok ? { state: 'ready', data: r.data } : { state: 'error', message: r.message }));
    return () => {
      live = false;
    };
  }, [kind, key, bump]);
  return s;
}

/** Simple client-side filter + text search over governed items. */
export function matchesText(needle: string, ...fields: (string | null | undefined)[]): boolean {
  const n = needle.trim().toLowerCase();
  return !n || fields.some((f) => (f ?? '').toLowerCase().includes(n));
}

/** Who did it, in words: the change log stores user IDs, not names. */
export function actorLabel(id: string | null | undefined, selfId: string | null): string {
  if (!id) return '—';
  if (id === 'seed') return 'System import';
  if (selfId && id === selfId) return 'you';
  return 'another administrator';
}
