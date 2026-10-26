// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// paging.ts — UI-02: client-side paging and the SPRS weight colour (hooks and
// helpers kept out of ui.tsx, which exports components only).
import { useEffect, useMemo, useState } from 'react';

/** Client-side paging. Resets to page 1 when the row set changes. */
export function usePaged<T>(rows: readonly T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  useEffect(() => setPage(1), [rows]);
  const slice = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [rows, page, pageSize]);
  return { page: Math.min(page, pages), pages, setPage, slice, total: rows.length, pageSize };
}

/** S1.4: client-side sort. `get` returns the value compared for a column. */
export function useSort<T, K extends string>(rows: readonly T[], get: (row: T, col: K) => string | number, initial: K | null = null) {
  const [sort, setSort] = useState<{ col: K | null; dir: 'asc' | 'desc' }>({ col: initial, dir: 'asc' });
  const onSort = (col: K) => setSort((s) => (s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' }));
  const sorted = useMemo(() => {
    if (!sort.col) return rows;
    const col = sort.col;
    const out = [...rows].sort((a, b) => {
      const x = get(a, col);
      const y = get(b, col);
      return typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
    });
    return sort.dir === 'asc' ? out : out.reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);
  return { sort, onSort, sorted };
}

/** S1.4: multi-select by key, with select-all over the current (filtered) rows. */
export function useSelection(keys: readonly string[]) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const all = keys.length > 0 && keys.every((k) => sel.has(k));
  const some = keys.some((k) => sel.has(k));
  return {
    sel,
    all,
    some,
    toggle: (k: string, on: boolean) =>
      setSel((prev) => {
        const next = new Set(prev);
        if (on) next.add(k);
        else next.delete(k);
        return next;
      }),
    toggleAll: (on: boolean) => setSel(on ? new Set(keys) : new Set()),
    clear: () => setSel(new Set()),
  };
}

export function weightTone(weight: number): 'bad' | 'warn' | 'info' | undefined {
  if (weight === 5) return 'bad';
  if (weight === 3) return 'warn';
  if (weight === 1) return 'info';
  return undefined;
}
