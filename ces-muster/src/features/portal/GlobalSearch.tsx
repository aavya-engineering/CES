// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// GlobalSearch.tsx — S1.4: top-bar search (wireframe "Search across CES").
// Searches the 110 requirements locally and offers "search in" shortcuts for
// the catalog, mappings and rules; the chosen page opens with the query
// filled in (searchHandoff.ts). No network call of its own.
import { useId, useMemo, useRef, useState } from 'react';
import { searchHits, setPendingSearch, type Hit } from './searchHandoff';
import type { RouteId } from './nav';

export default function GlobalSearch({ go, allowed }: { go: (r: RouteId) => void; allowed: ReadonlySet<RouteId> }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => searchHits(q, allowed), [q, allowed]);

  const choose = (h: Hit) => {
    setPendingSearch(h.route, h.q);
    setOpen(false);
    setQ('');
    input.current?.blur();
    go(h.route);
  };

  return (
    <div className="portal-search" role="search">
      <svg className="portal-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        ref={input}
        className="portal-search-input"
        type="search"
        placeholder="Search across CES (e.g., requirements, evidence, rules…)"
        aria-label="Search across CES"
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls={listId}
        aria-activedescendant={open && hits[active] ? `${listId}-${active}` : undefined}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, hits.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && hits[active]) {
            e.preventDefault();
            choose(hits[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        data-testid="global-search"
      />
      {open && hits.length > 0 && (
        <ul id={listId} className="portal-search-list" role="listbox" data-testid="global-search-results">
          {hits.map((h, i) => (
            <li
              key={h.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(h);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <strong>{h.primary}</strong>
              <span>{h.secondary}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
