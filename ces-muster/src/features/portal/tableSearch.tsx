// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// tableSearch.tsx — QA 2026-11-13: "a search bar on every page". A filter box
// that narrows the rows of the table it points at (by the row's text), so
// every list page gets the same search without each table re-implementing
// filtering. Pages that already filter server-side keep their own box.
import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';

export function TableSearch({ target, placeholder = 'Search this table…', testId }: { /** CSS selector of the table (e.g. [data-testid="tenant-table"]). */ target: string; placeholder?: string; testId?: string }) {
  const [q, setQ] = useState('');
  const [count, setCount] = useState<{ shown: number; total: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scope = root.current?.closest('.pg') ?? document;
    const apply = () => {
      const table = scope.querySelector<HTMLTableElement>(target);
      if (!table) { setCount(null); return; }
      const rows = [...table.querySelectorAll<HTMLTableRowElement>('tbody > tr')];
      const needle = q.trim().toLowerCase();
      let shown = 0;
      for (const r of rows) {
        const hit = !needle || (r.textContent ?? '').toLowerCase().includes(needle);
        r.hidden = !hit;
        if (hit) shown++;
      }
      setCount({ shown, total: rows.length });
    };
    apply();
    const table = scope.querySelector(target);
    const mo = table ? new MutationObserver(apply) : null;
    if (table && mo) mo.observe(table, { childList: true, subtree: true, characterData: true });
    return () => mo?.disconnect();
  }, [q, target]);
  return (
    <div className="toolbar table-search" ref={root}>
      <label className="grow search-input">
        <span className="sr-only">Search this table</span>
        <Search size={16} aria-hidden="true" />
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} maxLength={200} data-testid={testId ?? 'table-search'} />
      </label>
      {count && q && <span className="hint">{count.shown} of {count.total} rows</span>}
      {q && <button type="button" className="btn btn-link" onClick={() => setQ('')}>Clear</button>}
    </div>
  );
}
