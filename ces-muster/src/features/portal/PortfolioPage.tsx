// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// PortfolioPage.tsx — S1.8: Home / Portfolio as in the wireframe, from
// GET /api/portfolio (muster-api). BHD operator and prime: the engagements of
// their tenant. Platform administrator: counts only, no names or readiness
// (doc 28 D-1). Health and readiness rules are in muster-api
// src/services/portfolioService.ts; numbers with no agreed formula show "TBD".
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { api } from '@/shared/api/musterApi';
import type { MusterView, RouteId } from './nav';
import { Bars, Donut, Meter } from './charts';
import { RowActions } from './governed';

type Health = 'on_track' | 'at_risk' | 'overdue' | 'closed';
interface Totals {
  organisations: number;
  organisations_new: number;
  engagements: number;
  engagements_new: number;
  open: number;
  on_track: number;
  at_risk: number;
  overdue: number;
  closed: number;
}
interface Level {
  level_1: number;
  level_2: number;
  not_set: number;
}
export interface PortfolioData {
  generated_at: string;
  range_days: number;
  restricted?: true;
  totals: Totals;
  by_level: Level;
  readiness?: { muster: { complete: number; total: number; pct: number | null }; stamper: null; adminops: null; evidenceops: null };
  engagements?: {
    id: string;
    name: string;
    reference_id: string | null;
    organisation: string | null;
    cmmc_level: number | null;
    status: string;
    health: Health;
    target_date: string | null;
    progress: { complete: number; total: number; pct: number | null };
  }[];
  milestones?: { id: string; engagement: string; name: string; due_date: string; state: 'overdue' | 'due_soon' | 'upcoming' }[];
  activity?: { at: string; user: string | null; activity: string; details: string }[];
}

const HEALTH: Record<Health, { label: string; tone: string; color: string }> = {
  on_track: { label: 'On Track', tone: 'good', color: 'var(--chart-good)' },
  at_risk: { label: 'At Risk', tone: 'warn', color: 'var(--chart-warn)' },
  overdue: { label: 'Overdue', tone: 'bad', color: 'var(--chart-bad)' },
  closed: { label: 'Closed', tone: '', color: 'var(--chart-neutral)' },
};
const MILESTONE: Record<string, { label: string; tone: string }> = {
  overdue: { label: 'Overdue', tone: 'bad' },
  due_soon: { label: 'Due soon', tone: 'warn' },
  upcoming: { label: 'Upcoming', tone: 'info' },
};
const RANGES = [7, 30, 90, 365];
const fmtDate = (iso: string) => new Date(`${iso.length === 10 ? `${iso}T00:00:00` : iso}`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const fmtTime = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const pctOf = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 100));

const svg = (d: string) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const ICON = {
  building: svg('M4 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 7h3M8 11h3M8 15h3'),
  folder: svg('M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'),
  shield: svg('M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6zM9 12l2 2 4-4'),
  clock: svg('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2'),
  alert: svg('M12 4l9 16H3zM12 10v4M12 17.5v.5'),
};

function Kpi({ icon, tone, value, label, sub, bar, testId }: { icon: ReactNode; tone: string; value: number; label: string; sub: ReactNode; bar?: { pct: number; color: string }; testId: string }) {
  return (
    <div className="stat kpi" data-testid={testId}>
      <div className="stat-icon kpi-icon" data-tone={tone} aria-hidden="true">
        {icon}
      </div>
      <div className="kpi-body">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        <div className="stat-sub">{sub}</div>
        {bar && <Meter pct={bar.pct} color={bar.color} label={label} />}
      </div>
    </div>
  );
}

function Card({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card dash-card ${className ?? ''}`} aria-label={title}>
      <div className="dash-card-head">
        <h2 className="card-title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function PortfolioPage({ go, openMuster }: { go: (r: RouteId) => void; openMuster: (v: MusterView) => void }) {
  const [days, setDays] = useState(30);
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; data: PortfolioData }>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    const r = await api.get<PortfolioData>(`/portfolio?days=${days}`);
    if (r.ok) setState({ kind: 'ready', data: r.data });
    else setState({ kind: 'error', message: r.status === 0 ? 'muster-api is not reachable. Start it and refresh.' : r.error ?? `muster-api returned ${r.status}` });
  }, [days]);
  useEffect(() => {
    void load();
  }, [load]);

  const data = state.kind === 'ready' ? state.data : null;
  const t = data?.totals;
  const restricted = !!data?.restricted;
  const vs = `vs last ${days} days`;

  return (
    <div className="pg" data-testid="page-portfolio">
      <header className="pg-head dash-head">
        <div>
          <h1 className="pg-title">Home / Portfolio</h1>
          <p className="pg-lede">Overview of tenants, engagements and compliance status across CES.</p>
        </div>
        <div className="dash-head-tools">
          <div className="pg-meta">
            Last updated
            <strong>{data ? fmtTime(data.generated_at) : '…'}</strong>
          </div>
          <button type="button" className="portal-icon-btn" aria-label="Refresh" title="Refresh" onClick={() => void load()} data-testid="portfolio-refresh">
            ↻
          </button>
          <label className="sr-only" htmlFor="portfolio-range">
            Time range
          </label>
          <select id="portfolio-range" className="select" value={days} onChange={(e) => setDays(Number(e.target.value))} data-testid="portfolio-range">
            {RANGES.map((d) => (
              <option key={d} value={d}>
                Last {d} days
              </option>
            ))}
          </select>
        </div>
      </header>

      {state.kind === 'error' && (
        <p className="note" data-tone="warn" role="alert">
          {state.message}
        </p>
      )}

      <div className="stats stats-5" aria-busy={state.kind === 'loading'}>
        <Kpi testId="kpi-tenants" icon={ICON.building} tone="info" value={t?.organisations ?? 0} label="Total Tenants" sub={<><span className="delta">↑{t?.organisations_new ?? 0}</span> {vs}</>} />
        <Kpi testId="kpi-engagements" icon={ICON.folder} tone="info" value={t?.engagements ?? 0} label="Total Engagements" sub={<><span className="delta">↑{t?.engagements_new ?? 0}</span> {vs}</>} />
        <Kpi testId="kpi-on-track" icon={ICON.shield} tone="good" value={t?.on_track ?? 0} label="On Track" sub={`${pctOf(t?.on_track ?? 0, t?.engagements ?? 0)}% of total`} bar={{ pct: pctOf(t?.on_track ?? 0, t?.engagements ?? 0), color: HEALTH.on_track.color }} />
        <Kpi testId="kpi-at-risk" icon={ICON.clock} tone="warn" value={t?.at_risk ?? 0} label="At Risk" sub={`${pctOf(t?.at_risk ?? 0, t?.engagements ?? 0)}% of total`} bar={{ pct: pctOf(t?.at_risk ?? 0, t?.engagements ?? 0), color: HEALTH.at_risk.color }} />
        <Kpi testId="kpi-overdue" icon={ICON.alert} tone="bad" value={t?.overdue ?? 0} label="Overdue" sub={`${pctOf(t?.overdue ?? 0, t?.engagements ?? 0)}% of total`} bar={{ pct: pctOf(t?.overdue ?? 0, t?.engagements ?? 0), color: HEALTH.overdue.color }} />
      </div>

      {data && data.totals.engagements === 0 && !restricted && (
        <div className="note" data-tone="info" data-testid="portfolio-empty">
          No engagements yet.{' '}
          <button type="button" className="row-btn" onClick={() => openMuster('assessment')}>
            Create an engagement
          </button>{' '}
          to fill this dashboard.
        </div>
      )}

      <div className="dash-row dash-row-3">
        <Card title="Engagement Compliance Status">
          <Donut
            testId="chart-status"
            center={t?.engagements ?? 0}
            centerLabel="Engagements"
            segments={(['on_track', 'at_risk', 'overdue', ...((t?.closed ?? 0) > 0 ? (['closed'] as const) : [])] as Health[]).map((h) => ({ label: HEALTH[h].label, value: t?.[h] ?? 0, color: HEALTH[h].color }))}
          />
        </Card>
        <Card title="CMMC Level Distribution">
          <Bars
            testId="chart-levels"
            label="Engagements by CMMC level"
            bars={[
              { label: 'Level 1', value: data?.by_level.level_1 ?? 0, color: 'var(--chart-seq-light)' },
              { label: 'Level 2', value: data?.by_level.level_2 ?? 0, color: 'var(--chart-seq)' },
              ...((data?.by_level.not_set ?? 0) > 0 ? [{ label: 'Not set', value: data!.by_level.not_set, color: 'var(--chart-neutral)' }] : []),
            ]}
          />
        </Card>
        <Card title="Readiness Overview">
          {restricted ? (
            <p className="pg-meta">Readiness is customer data and is not shown to platform administrators.</p>
          ) : (
            <ul className="readiness-list" data-testid="readiness">
              {[
                { label: 'Overall Readiness', pct: null as number | null, color: 'var(--chart-good)', note: 'Needs a formula across modules (TBD)' },
                { label: 'Muster (Assess & Plan)', pct: data?.readiness?.muster.pct ?? null, color: 'var(--mod-muster)', note: data?.readiness ? `${data.readiness.muster.complete} of ${data.readiness.muster.total} interviews complete` : '' },
                { label: 'Stamper (Configure & Verify)', pct: null, color: 'var(--mod-stamper)', note: 'Not connected yet (TBD)' },
                { label: 'AdminOps (Govern Changes)', pct: null, color: 'var(--mod-adminops)', note: 'Not connected yet (TBD)' },
                { label: 'EvidenceOps (Prove & Maintain)', pct: null, color: 'var(--mod-evidenceops)', note: 'Not connected yet (TBD)' },
              ].map((r) => (
                <li key={r.label} title={r.note}>
                  <span className="readiness-label">{r.label}</span>
                  <Meter pct={r.pct} color={r.color} label={r.label} />
                  <strong className="readiness-pct">{r.pct == null ? 'TBD' : `${r.pct}%`}</strong>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {restricted ? (
        <p className="note" data-tone="info" data-testid="portfolio-restricted">
          You are signed in as a platform administrator: CES shows portfolio counts only. Engagement names, organisations, milestones and readiness are customer data (BHD role review).
        </p>
      ) : (
        <>
          <div className="dash-row dash-row-2">
            <Card
              title="Engagements by Status"
              action={
                <button type="button" className="row-btn" onClick={() => go('engagements/all')}>
                  View All
                </button>
              }
            >
              <div className="table-wrap">
                <table className="tbl tbl-compact" data-testid="portfolio-engagements">
                  <thead>
                    <tr>
                      <th scope="col">Engagement Name</th>
                      <th scope="col">Tenant</th>
                      <th scope="col">CMMC Level</th>
                      <th scope="col">Status</th>
                      <th scope="col">Readiness</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.engagements ?? []).slice(0, 5).map((e) => (
                      <tr key={e.id}>
                        <td>{e.name}</td>
                        <td>{e.organisation ?? '—'}</td>
                        <td>{e.cmmc_level ? `Level ${e.cmmc_level}` : '—'}</td>
                        <td>
                          <span className="pill" data-tone={HEALTH[e.health].tone || undefined}>
                            {HEALTH[e.health].label}
                          </span>
                        </td>
                        <td>
                          <span className="readiness-cell" title={`${e.progress.complete} of ${e.progress.total} interviews complete`}>
                            <strong>{e.progress.pct == null ? '—' : `${e.progress.pct}%`}</strong>
                            <Meter pct={e.progress.pct} color={HEALTH[e.health].color} label={`${e.name} readiness`} />
                          </span>
                        </td>
                        <td>
                          <RowActions
                            label={e.name}
                            testId={`portfolio-actions-${e.id}`}
                            actions={[
                              { label: 'View in All Engagements', onSelect: () => go('engagements/all') },
                              { label: 'Open in Muster', onSelect: () => openMuster('readiness') },
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data && (data.engagements ?? []).length === 0 && <p className="pg-meta dash-empty">No engagements.</p>}
            </Card>
            <Card
              title="Upcoming Milestones"
              action={
                <button type="button" className="row-btn" onClick={() => go('engagements/all')}>
                  View All
                </button>
              }
            >
              <div className="table-wrap">
                <table className="tbl tbl-compact" data-testid="portfolio-milestones">
                  <thead>
                    <tr>
                      <th scope="col">Milestone</th>
                      <th scope="col">Engagement</th>
                      <th scope="col">Due Date</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.milestones ?? []).slice(0, 5).map((m) => (
                      <tr key={m.id}>
                        <td>{m.name}</td>
                        <td>{m.engagement}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(m.due_date)}</td>
                        <td>
                          <span className="pill" data-tone={MILESTONE[m.state].tone}>
                            {MILESTONE[m.state].label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data && (data.milestones ?? []).length === 0 && <p className="pg-meta dash-empty">No open milestones.</p>}
            </Card>
          </div>

          <div className="dash-row dash-row-2">
            <Card title="Recent Activity">
              <div className="table-wrap">
                <table className="tbl tbl-compact" data-testid="portfolio-activity">
                  <thead>
                    <tr>
                      <th scope="col">Time</th>
                      <th scope="col">User</th>
                      <th scope="col">Activity</th>
                      <th scope="col">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.activity ?? []).slice(0, 5).map((a, i) => (
                      <tr key={`${a.at}-${i}`}>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtTime(a.at)}</td>
                        <td>{a.user ?? '—'}</td>
                        <td>{a.activity}</td>
                        <td>{a.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data && (data.activity ?? []).length === 0 && <p className="pg-meta dash-empty">No activity yet.</p>}
            </Card>
            <QuickLinks go={go} openMuster={openMuster} />
          </div>
        </>
      )}
      {restricted && (
        <div className="dash-row dash-row-2">
          <QuickLinks go={go} openMuster={openMuster} admin />
        </div>
      )}
    </div>
  );
}

function QuickLinks({ go, openMuster, admin }: { go: (r: RouteId) => void; openMuster: (v: MusterView) => void; admin?: boolean }) {
  const links = admin
    ? [
        { mod: undefined, t: 'CES-Shared Overview', s: 'Reference data and rules', on: () => go('shared/overview') },
        { mod: undefined, t: 'Users', s: 'Accounts and roles', on: () => go('platform/users') },
      ]
    : [
        { mod: 'muster', t: 'Muster', s: 'Assess & Plan', on: () => openMuster('assessment') },
        { mod: 'stamper', t: 'Stamper', s: 'Configure & Verify', on: () => go('module/stamper') },
        { mod: 'adminops', t: 'AdminOps', s: 'Govern Changes', on: () => go('module/adminops') },
        { mod: 'evidenceops', t: 'EvidenceOps', s: 'Prove & Maintain', on: () => go('module/evidenceops') },
      ];
  return (
    <Card title="Quick Links">
      <div className="quick-links">
        {links.map((m) => (
          <button key={m.t} type="button" className="quick-link" data-mod={m.mod} onClick={m.on} data-testid={`quick-${m.t.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
            <span className="portal-icon" data-mod={m.mod} aria-hidden="true">
              {m.t[0]}
            </span>
            <span>
              <strong>{m.t}</strong>
              <small>{m.s}</small>
            </span>
            <span aria-hidden="true">→</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
