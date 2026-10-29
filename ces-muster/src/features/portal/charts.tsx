// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// charts.tsx — S1.8: the small charts the wireframes use (donut, vertical bars,
// progress bar). Plain SVG/CSS; every chart has a text legend or label with
// the value, so colour is never the only carrier, and each mark has a native
// hover tooltip (<title>). Colours come from portalTheme.css tokens.
import type { ReactNode } from 'react';

export interface Segment {
  label: string;
  value: number;
  /** CSS colour, normally a var(--chart-…) token. */
  color: string;
}

/** Ring chart with the total in the middle and a legend (label, count, %). */
export function Donut({ segments, center, centerLabel, testId }: { segments: Segment[]; center: ReactNode; centerLabel: string; testId?: string }) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  const GAP = total > 0 && segments.filter((s) => s.value > 0).length > 1 ? 2 : 0;
  let offset = 0;
  return (
    <div className="donut" data-testid={testId}>
      <svg viewBox="0 0 140 140" role="img" aria-label={`${centerLabel}: ${segments.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--chart-track)" strokeWidth="18" />
        {total > 0 &&
          segments.map((s) => {
            if (s.value === 0) return null;
            const len = (s.value / total) * C;
            const dash = `${Math.max(len - GAP, 0.5)} ${C}`;
            const el = (
              <circle key={s.label} cx="70" cy="70" r={R} fill="none" stroke={s.color} strokeWidth="18" strokeDasharray={dash} strokeDashoffset={-offset} transform="rotate(-90 70 70)">
                <title>{`${s.label}: ${s.value} (${Math.round((s.value / total) * 100)}%)`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
      </svg>
      <div className="donut-center" aria-hidden="true">
        <strong>{center}</strong>
        <span>{centerLabel}</span>
      </div>
      <ul className="chart-legend">
        {segments.map((s) => (
          <li key={s.label}>
            <span className="legend-dot" style={{ background: s.color }} aria-hidden="true" />
            <span className="legend-label">{s.label}</span>
            <strong>{s.value}</strong>
            <span className="legend-pct">{total > 0 ? `(${Math.round((s.value / total) * 100)}%)` : ''}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Vertical bars on one axis, value printed above each bar. */
export function Bars({ bars, label, testId }: { bars: { label: string; value: number; color?: string }[]; label: string; testId?: string }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const empty = bars.every((b) => b.value === 0);
  return (
    <div className={`vbars${empty ? ' vbars-empty' : ''}`} role="img" aria-label={`${label}: ${bars.map((b) => `${b.label} ${b.value}`).join(', ')}`} data-testid={testId}>
      {empty && <span className="vbars-note">No engagements yet</span>}
      {bars.map((b) => (
        <div key={b.label} className="vbar" title={`${b.label}: ${b.value}`}>
          <span className="vbar-value">{b.value}</span>
          <span className="vbar-track">
            <span className="vbar-fill" style={{ height: `${(b.value / max) * 100}%`, background: b.color ?? 'var(--chart-seq)', opacity: b.value === 0 ? 0 : 1 }} />
          </span>
          <span className="vbar-label">{b.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Horizontal progress bar; `pct` null renders an empty track (no value). */
export function Meter({ pct, color, label }: { pct: number | null; color?: string; label: string }) {
  return (
    <span className="meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined} title={pct == null ? `${label}: not measured` : `${label}: ${pct}%`}>
      <span className="meter-fill" style={{ width: `${pct ?? 0}%`, background: color ?? 'var(--chart-seq)' }} />
    </span>
  );
}
