// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// ui.tsx — UI-02: small shared building blocks for portal pages (page header,
// stat tile, pager, empty state). Styles in portalTheme.css.
import type { ReactNode } from 'react';
import { GlyphIcon } from './icons';

export function PageHeader({
  icon,
  title,
  lede,
  actions,
}: {
  /** A glyph from icons.tsx (shown as an outline icon) or any element. */
  icon: ReactNode;
  title: string;
  lede?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="pg-head">
      <div className="pg-head-icon" aria-hidden="true">
        {typeof icon === 'string' ? <GlyphIcon glyph={icon} size={32} /> : icon}
      </div>
      <div>
        <h1 className="pg-title">{title}</h1>
        {lede && <p className="pg-lede">{lede}</p>}
      </div>
      {actions && <div className="pg-head-actions">{actions}</div>}
    </header>
  );
}

export function Stat({
  icon,
  value,
  label,
  sub,
  tone,
  testId,
}: {
  icon: ReactNode;
  value: ReactNode;
  label: string;
  sub?: ReactNode;
  tone?: 'good' | 'warn' | 'bad' | 'muster';
  testId?: string;
}) {
  return (
    <div className="stat" data-testid={testId}>
      <div className="stat-icon" data-tone={tone} aria-hidden="true">
        {typeof icon === 'string' ? <GlyphIcon glyph={icon} size={24} /> : icon}
      </div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    </div>
  );
}

export function Pager({
  page,
  pages,
  total,
  pageSize,
  setPage,
  noun,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  setPage: (p: number) => void;
  noun: string;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === pages || Math.abs(n - page) <= 1
  );
  return (
    <nav className="pager" aria-label={`${noun} pages`}>
      <span data-testid="pager-summary">
        Showing {from} to {to} of {total} {noun}
      </span>
      <span className="pager-btns">
        <button type="button" onClick={() => setPage(1)} disabled={page <= 1} aria-label="First page">
          «
        </button>
        <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
          ‹
        </button>
        {nums.map((n, i) => (
          <span key={n} style={{ display: 'contents' }}>
            {i > 0 && nums[i - 1] !== n - 1 && <span aria-hidden="true">…</span>}
            <button type="button" onClick={() => setPage(n)} aria-current={n === page ? 'page' : undefined}>
              {n}
            </button>
          </span>
        ))}
        <button type="button" onClick={() => setPage(page + 1)} disabled={page >= pages} aria-label="Next page">
          ›
        </button>
        <button type="button" onClick={() => setPage(pages)} disabled={page >= pages} aria-label="Last page">
          »
        </button>
      </span>
    </nav>
  );
}

/** S1.4: "Rows per page" select, as in every wireframe table. */
export function RowsPerPage({ value, onChange, options = [10, 25, 50, 100] }: { value: number; onChange: (n: number) => void; options?: number[] }) {
  return (
    <label className="rows-per-page">
      Rows per page{' '}
      <select className="select" value={value} onChange={(e) => onChange(Number(e.target.value))} data-testid="rows-per-page">
        {options.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}

/** S1.4: a sortable column header (click toggles ascending / descending). */
export function SortTh<K extends string>({
  label,
  col,
  sort,
  onSort,
  className,
}: {
  label: string;
  col: K;
  sort: { col: K | null; dir: 'asc' | 'desc' };
  onSort: (col: K) => void;
  className?: string;
}) {
  const on = sort.col === col;
  return (
    <th scope="col" className={className} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="th-sort" onClick={() => onSort(col)} data-testid={`sort-${col}`}>
        {label}
        <span aria-hidden="true" className="th-sort-ind">{on ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  );
}

/** S1.4: header / row checkbox for multi-select. */
export function SelectBox({ checked, indeterminate, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <input
      type="checkbox"
      className="row-check"
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = !!indeterminate && !checked;
      }}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={label}
    />
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

