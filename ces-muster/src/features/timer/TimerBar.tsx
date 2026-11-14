// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

import { useState, useEffect } from 'react';
import { useTimingContext } from './timingCore';
import type { TimingSegmentName } from '@/shared/types/engagement';

const SEGMENTS: TimingSegmentName[] = ['setup', 'interview', 'verification', 'review'];
const BUDGET_MS = 2 * 60 * 60 * 1000; // 2 hours in ms
// QA 2026-11-13: say what each phase is for. The interview phase starts on its
// own when the interview begins and stops at Finish & Score; the others are
// started by hand when that work starts.
const HELP: Record<TimingSegmentName, string> = {
  setup: 'Getting the party, documents and services ready before the questions. Start it when that work starts.',
  interview: 'Answering the questions. Starts by itself at Begin Interview and stops at Finish & Score.',
  verification: 'Checking answers against evidence or the tenant. Start it when verifying.',
  review: 'Reviewing the result with the party. Start it when the review starts.',
};

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function TimerBar() {
  const { segments, startSegment, stopSegment } = useTimingContext();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const totalElapsedMs = segments.reduce((acc, s) => {
    if (s.duration_ms !== undefined) return acc + s.duration_ms;
    if (!s.stopped_at) return acc + (now - new Date(s.started_at).getTime());
    return acc;
  }, 0);

  const budgetPct = Math.min(100, Math.round((totalElapsedMs / BUDGET_MS) * 100));

  // QA 2026-11-13: a phase that was stopped and started again has several
  // entries — sum them all, so the phase clocks add up to the total.
  const getSegmentElapsed = (name: TimingSegmentName): number =>
    segments
      .filter((s) => s.segment === name)
      .reduce((acc, seg) => {
        if (seg.duration_ms !== undefined) return acc + seg.duration_ms;
        if (!seg.stopped_at) return acc + (now - new Date(seg.started_at).getTime());
        return acc;
      }, 0);


  const isRunning = (name: TimingSegmentName): boolean =>
    segments.some((s) => s.segment === name && !s.stopped_at);
  const runningCount = SEGMENTS.filter(isRunning).length;

  return (
    <div
      className="panel"
      style={{
        padding: '1rem',
        marginBottom: '1rem',
      }}
    >
      <p style={{ margin: '0 0 0.5rem', fontSize: 12, color: 'var(--co-text-muted)' }}>
        Session time by phase — the phases run independently, more than one may run at once, and the total is their sum against the 2-hour target.
      </p>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        {SEGMENTS.map((name) => {
          const running = isRunning(name);
          const elapsed = getSegmentElapsed(name);
          return (
            <div
              key={name}
              title={HELP[name]}
              data-testid={`timer-${name}`}
              style={{
                border: '1px solid var(--co-border-strong)',
                borderRadius: 'var(--co-radius)',
                padding: '0.4rem 0.75rem',
                background: running ? 'var(--co-primary-subtle)' : 'var(--co-surface)',
                minWidth: 120,
              }}
            >
              <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize', color: 'var(--co-text-muted)' }}>
                {name}
                {running && <span style={{ marginLeft: 6, fontWeight: 400 }}>· running</span>}
              </div>
              <div style={{ fontFamily: 'var(--co-font-mono)', fontSize: '1.1rem' }}>{formatMs(elapsed)}</div>
              <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.3rem' }}>
                <button
                  type="button"
                  onClick={() => startSegment(name)}
                  disabled={running}
                  title={running ? `${name} is already running` : HELP[name]}
                  aria-label={`Start ${name} timer`}
                  style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem', cursor: running ? 'not-allowed' : 'pointer' }}
                >
                  Start
                </button>
                <button
                  type="button"
                  onClick={() => stopSegment(name)}
                  disabled={!running}
                  title={!running ? `${name} is not running` : `Stop the ${name} timer`}
                  aria-label={`Stop ${name} timer`}
                  style={{ fontSize: '0.75rem', padding: '0.15rem 0.4rem', cursor: !running ? 'not-allowed' : 'pointer' }}
                >
                  Stop
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ flex: 1, height: 6, background: 'var(--co-bg-elevated)' }}>
          <div
            style={{
              width: `${budgetPct}%`,
              height: '100%',
              background:
                budgetPct >= 90
                  ? 'var(--co-violation)'
                  : budgetPct >= 70
                    ? 'var(--co-risk)'
                    : 'var(--co-compliant)',
              transition: 'width 0.5s',
            }}
          />
        </div>
        <span style={{ fontSize: '0.8rem', color: 'var(--co-text-muted)', whiteSpace: 'nowrap' }} data-testid="timer-total">
          Total {formatMs(totalElapsedMs)} / 2:00:00{runningCount > 1 ? ` · ${runningCount} phases running` : ''}
        </span>
      </div>

      <p style={{ margin: '0.4rem 0 0', fontSize: 12, color: 'var(--co-text-muted)' }}>
        Target: no more than 2 hours of BHD time per subcontractor (working assumption, to be confirmed with BHD during the pilot).
      </p>
    </div>
  );
}
