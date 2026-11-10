// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// MonitorPages.tsx — Sprint 6 slice "Monitor" (workbook groups Monitoring
// Overview, Continuous Control Monitoring, Evidence Monitoring, Change
// Monitoring, Alerts & Notifications, Compliance Trends, Audit & Activity).
// Real data from muster-api: findings derived from the programme's own
// records, trend snapshots, the audit trail. Tenant signal drift stays with
// the Stamper / EvidenceOps runs (ces-eo). Aavya portal theme.

import { useEffect, useMemo, useState } from 'react';
import type { RouteId, Viewer } from '../../nav';
import { actionsFor } from '../../lifecycle/rbac';
import { Drawer, Toast } from '../../governed';
import { Empty, PageHeader, Stat } from '../../ui';
import { REQUIREMENTS } from '../../referenceData';
import { api } from '@/shared/api/musterApi';
import { engagementLabel, useEngagement } from '../useEngagement';
import { failureText } from '../onboard/onboardApi';

const PRACTICE = new Map(REQUIREMENTS.map((r) => [r.control_id, r.practice]));
const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const isSignedIn = (v: Viewer): v is { kind: 'signed-in'; role: string } => v.kind === 'signed-in';
const canAct = (v: Viewer) => isSignedIn(v) && actionsFor(v.role, 'monitor').some((a) => a === 'edit' || a === 'execute' || a === 'approve');

export const CATEGORIES = ['score', 'control', 'remediation', 'plan', 'evidence', 'scope', 'tenant'] as const;
export type Category = (typeof CATEGORIES)[number];
export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type Severity = (typeof SEVERITIES)[number];
export type FindingStatus = 'open' | 'acknowledged' | 'escalated' | 'resolved';
const SEV_TONE: Record<Severity, 'bad' | 'warn' | 'info' | undefined> = { critical: 'bad', high: 'bad', medium: 'warn', low: 'info', info: undefined };
const CAT_LABEL: Record<Category, string> = { score: 'Score', control: 'Control drift', remediation: 'Remediation', plan: 'Plan / POA&M', evidence: 'Evidence', scope: 'Scope', tenant: 'Tenant' };
const STATUS_TONE: Record<FindingStatus, 'good' | 'warn' | 'bad' | 'info' | undefined> = { open: 'bad', acknowledged: 'info', escalated: 'warn', resolved: 'good' };

export interface Finding { id: string; key: string; category: Category; severity: Severity; title: string; detail: Record<string, unknown> | null; requirement_id: string | null; target_type: string | null; target_id: string | null; status: FindingStatus; first_seen_at: string; last_seen_at: string; seen_count: number; acknowledged_by: string | null; acknowledged_at: string | null; resolved_by: string | null; resolved_at: string | null; resolution: string | null; escalated_to: string | null; notes: string | null }
export interface Snapshot { id: string; taken_at: string; sprs_now: number | null; met_count: number | null; not_met_count: number | null; partial_count: number | null; unknown_count: number | null; open_actions: number; overdue_actions: number; open_poam: number; evidence_validated: number; evidence_pending: number; coverage_covered: number; coverage_missing: number; findings_open: number; findings_critical: number; by_family: Record<string, { met: number; total: number }> | null }
export interface MonitorSummary { last_evaluated_at: string | null; snapshots: number; open: number; by_severity: Record<Severity, number>; by_category: Record<Category, number>; by_status: Record<FindingStatus, number>; latest: Snapshot | null; previous: Snapshot | null }
export interface Activity { id: string; at: string; actor_user_id: string | null; actor_role: string | null; action: string; target_type: string | null; target_id: string | null; detail: Record<string, unknown> | null }

const base = (eid: string) => `/api/engagements/${eid}/monitor`;
export const monitorApi = {
  evaluate: (eid: string) => api.post<{ created: number; updated: number; cleared: number; expired_evidence: number; open: number }>(`${base(eid)}/evaluate`),
  summary: (eid: string) => api.get<MonitorSummary>(`${base(eid)}/summary`),
  findings: (eid: string, q?: { status?: string; category?: string; severity?: string }) => { const p = new URLSearchParams(Object.fromEntries(Object.entries(q ?? {}).filter(([, v]) => v) as [string, string][])); return api.get<Finding[]>(`${base(eid)}/findings${p.toString() ? `?${p}` : ''}`); },
  ack: (eid: string, id: string, notes: string) => api.post<Finding>(`${base(eid)}/findings/${id}/ack`, { notes }),
  resolve: (eid: string, id: string, resolution: string) => api.post<Finding>(`${base(eid)}/findings/${id}/resolve`, { resolution }),
  escalate: (eid: string, id: string, to: string, notes?: string) => api.post<Finding>(`${base(eid)}/findings/${id}/escalate`, { to, notes }),
  snapshots: (eid: string) => api.get<Snapshot[]>(`${base(eid)}/snapshots`),
  activity: (eid: string, q?: string) => api.get<Activity[]>(`${base(eid)}/activity${q ? `?q=${encodeURIComponent(q)}` : ''}`),
};

function EngagementSelect({ eng }: { eng: ReturnType<typeof useEngagement> }) {
  return (
    <label>Engagement{' '}
      <select className="select" value={eng.id} onChange={(e) => eng.setId(e.target.value)} data-testid="monitor-engagement">
        {!eng.rows?.length && <option value="">— no engagement —</option>}
        {(eng.rows ?? []).map((e) => <option key={e.id} value={e.id}>{engagementLabel(e)}</option>)}
      </select>
    </label>
  );
}

function useLoader<T>(load: (() => Promise<{ ok: true; data: T } | { ok: false; status: number; degraded: boolean; error?: string }>) | null, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!load) { setData(null); return; }
    let live = true;
    load().then((r) => { if (!live) return; if (r.ok) setData(r.data); else setError(failureText(r)); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);
  return { data, error, reload: () => setTick((t) => t + 1) };
}

/** Inline SVG trend line (no chart library): one series over snapshots. */
export function Trend({ points, label, color, min, max, testId }: { points: { x: string; y: number | null }[]; label: string; color: string; min?: number; max?: number; testId?: string }) {
  const vals = points.map((p) => p.y).filter((v): v is number => v !== null);
  if (vals.length < 2) return <p className="hint">{label}: {vals.length === 1 ? vals[0] : '—'} (need two or more evaluations for a trend)</p>;
  const lo = min ?? Math.min(...vals), hi = max ?? Math.max(...vals), span = hi - lo || 1;
  const W = 480, H = 120, pad = 8;
  const pts = points.map((p, i) => (p.y === null ? null : [pad + (i / (points.length - 1)) * (W - 2 * pad), H - pad - ((p.y - lo) / span) * (H - 2 * pad)] as [number, number])).filter((p): p is [number, number] => !!p);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  return (
    <figure className="trend" data-testid={testId}>
      <figcaption className="hint">{label}: {vals[0]} → <strong>{vals[vals.length - 1]}</strong> over {points.length} evaluations</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} trend`} style={{ width: '100%', height: 120 }}>
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="currentColor" opacity="0.15" />
        <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
        {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={color} />)}
      </svg>
    </figure>
  );
}

// ====================================================================== finding drawer
function FindingDrawer({ eid, f, viewer, onChanged, onClose }: { eid: string; f: Finding; viewer: Viewer; onChanged: (m: string) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const act = async (what: string, fn: () => Promise<{ ok: true; data: unknown } | { ok: false; status: number; degraded: boolean; error?: string }>, msg: string) => { setBusy(what); setError(null); const r = await fn(); setBusy(null); if (r.ok) onChanged(msg); else setError(failureText(r)); };
  const writable = canAct(viewer);
  return (
    <Drawer title={f.title} subtitle={`${CAT_LABEL[f.category]} · ${f.severity} · seen ${f.seen_count}× · first ${fmt(f.first_seen_at)} · last ${fmt(f.last_seen_at)}`} onClose={onClose} testId="finding-drawer" wide footer={<button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>}>
      {error && <p className="note" data-tone="bad" role="alert">{error}</p>}
      <p><span className="pill" data-tone={SEV_TONE[f.severity]}>{f.severity}</span> <span className="pill" data-tone={STATUS_TONE[f.status]}>{f.status}</span> <span className="hint">key {f.key}</span></p>
      {f.requirement_id && <p className="hint"><strong>{f.requirement_id}</strong> — {PRACTICE.get(f.requirement_id)}</p>}
      {f.detail && Object.keys(f.detail).length > 0 && <table className="tbl"><tbody>{Object.entries(f.detail).map(([k, v]) => <tr key={k}><td>{k}</td><td>{Array.isArray(v) ? v.join(', ') : typeof v === 'object' && v ? JSON.stringify(v) : String(v ?? '—')}</td></tr>)}</tbody></table>}
      {f.acknowledged_by && <p className="note" data-tone="info">Acknowledged by {f.acknowledged_by} on {fmt(f.acknowledged_at)}{f.notes ? `: ${f.notes}` : ''}</p>}
      {f.escalated_to && <p className="note" data-tone="warn">Escalated to {f.escalated_to}</p>}
      {f.resolved_by && <p className="note" data-tone="good">Resolved by {f.resolved_by} on {fmt(f.resolved_at)}: {f.resolution}</p>}
      {writable && f.status !== 'resolved' && (
        <>
          <h3 className="card-title">Act</h3>
          <label className="form-row">Notes / resolution<textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="What was done or decided" data-testid="finding-notes" /></label>
          <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
            {f.status === 'open' && <button type="button" className="btn btn-secondary" disabled={!!busy || text.length < 3} onClick={() => act('ack', () => monitorApi.ack(eid, f.id, text), 'Acknowledged.')} data-testid="finding-ack">Acknowledge</button>}
            <button type="button" className="btn btn-primary" disabled={!!busy || text.length < 3} onClick={() => act('resolve', () => monitorApi.resolve(eid, f.id, text), 'Resolved.')} data-testid="finding-resolve">Resolve</button>
            <span style={{ display: 'flex', gap: 6 }}><input className="input" placeholder="Escalate to (name / role)" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 200 }} /><button type="button" className="btn btn-secondary" disabled={!!busy || to.length < 2} onClick={() => act('esc', () => monitorApi.escalate(eid, f.id, to, text || undefined), `Escalated to ${to}.`)}>Escalate</button></span>
          </div>
        </>
      )}
    </Drawer>
  );
}

function FindingsTable({ rows, onOpen, testId }: { rows: Finding[]; onOpen: (f: Finding) => void; testId: string }) {
  return (
    <div className="table-wrap"><table className="tbl" data-testid={testId}><thead><tr><th scope="col">Severity</th><th scope="col">Finding</th><th scope="col">Category</th><th scope="col">Requirement</th><th scope="col">Seen</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
      <tbody>{rows.map((f) => <tr key={f.id}><td><span className="pill" data-tone={SEV_TONE[f.severity]}>{f.severity}</span></td><td><strong>{f.title}</strong></td><td className="hint">{CAT_LABEL[f.category]}</td><td className="hint">{f.requirement_id ?? '—'}</td><td className="hint">{f.seen_count}× · {fmt(f.last_seen_at)}</td><td><span className="pill" data-tone={STATUS_TONE[f.status]}>{f.status}</span></td><td><button type="button" className="row-btn" onClick={() => onOpen(f)} data-testid={`finding-open-${f.id}`}>Open</button></td></tr>)}</tbody></table></div>
  );
}

// ====================================================================== dashboard
export function MonitorOverviewPage({ viewer, go }: { viewer: Viewer; go: (r: RouteId) => void }) {
  const eng = useEngagement();
  const s = useLoader<MonitorSummary>(eng.id ? () => monitorApi.summary(eng.id) : null, [eng.id]);
  const snaps = useLoader<Snapshot[]>(eng.id ? () => monitorApi.snapshots(eng.id) : null, [eng.id]);
  const top = useLoader<Finding[]>(eng.id ? () => monitorApi.findings(eng.id, { status: 'open' }) : null, [eng.id]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Finding | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const d = s.data;
  const reloadAll = () => { s.reload(); snaps.reload(); top.reload(); };
  const evaluate = async () => {
    setBusy(true); setErr(null);
    const r = await monitorApi.evaluate(eng.id);
    setBusy(false);
    if (r.ok) { setToast(`Evaluated: ${r.data.created} new, ${r.data.updated} still open, ${r.data.cleared} cleared${r.data.expired_evidence ? `, ${r.data.expired_evidence} evidence item(s) expired` : ''}.`); reloadAll(); } else setErr(failureText(r));
  };
  const series = (k: keyof Snapshot) => (snaps.data ?? []).map((x) => ({ x: x.taken_at, y: typeof x[k] === 'number' ? (x[k] as number) : null }));
  const delta = (k: keyof Snapshot) => (d?.latest && d.previous && typeof d.latest[k] === 'number' && typeof d.previous[k] === 'number' ? (d.latest[k] as number) - (d.previous[k] as number) : null);
  const arrow = (n: number | null, goodWhenUp: boolean) => (n === null || n === 0 ? undefined : (n > 0) === goodWhenUp ? 'good' : 'bad');
  return (
    <div className="pg" data-testid="page-monitor-overview">
      <PageHeader icon="readiness" title="Monitoring" lede="Continuous monitoring of the compliance programme: every evaluation re-derives findings from the engagement's records (score regression, control drift between runs, overdue work, evidence freshness, scope changes, tenant prerequisites) and records a trend point. Tenant-side configuration drift comes from Stamper / EvidenceOps runs."
        actions={<>{canAct(viewer) && eng.id && <button type="button" className="btn btn-primary" disabled={busy} onClick={evaluate} data-testid="monitor-evaluate">{busy ? 'Evaluating…' : 'Evaluate now'}</button>} <EngagementSelect eng={eng} /></>} />
      {(eng.error || s.error || err) && <p className="note" data-tone="bad" role="alert">{eng.error ?? s.error ?? err}</p>}
      {d && (
        <>
          <div className="stats">
            <Stat icon="bell" value={d.open} label="Open findings" tone={d.by_severity.critical ? 'bad' : d.open ? 'warn' : 'good'} sub={`${d.by_severity.critical} critical · ${d.by_severity.high} high · ${d.by_severity.medium} medium`} testId="monitor-open" />
            <Stat icon="sprs" value={d.latest?.sprs_now ?? '—'} label="SPRS (latest run)" tone={arrow(delta('sprs_now'), true)} sub={delta('sprs_now') !== null ? `${delta('sprs_now')! >= 0 ? '+' : ''}${delta('sprs_now')} since previous evaluation` : undefined} />
            <Stat icon="plan" value={d.latest?.overdue_actions ?? '—'} label="Overdue actions" tone={d.latest?.overdue_actions ? 'bad' : 'good'} sub={`${d.latest?.open_actions ?? 0} open · ${d.latest?.open_poam ?? 0} POA&M`} />
            <Stat icon="catalog" value={d.latest ? `${d.latest.coverage_covered}` : '—'} label="Requirements with evidence covered" tone={arrow(delta('coverage_covered'), true)} sub={`${d.latest?.coverage_missing ?? 0} missing · ${d.latest?.evidence_pending ?? 0} pending review`} />
            <Stat icon="audit" value={d.snapshots} label="Evaluations" sub={d.last_evaluated_at ? `last ${fmt(d.last_evaluated_at)}` : 'never — run Evaluate'} />
          </div>
          <div className="form-grid-2">
            <section className="card card-pad"><h2 className="card-title">Compliance score trend</h2><Trend points={series('sprs_now')} label="SPRS" color="var(--co-primary)" min={-203} max={110} testId="trend-sprs" /></section>
            <section className="card card-pad"><h2 className="card-title">Evidence coverage trend</h2><Trend points={series('coverage_covered')} label="Requirements covered" color="var(--co-compliant)" testId="trend-coverage" /></section>
            <section className="card card-pad"><h2 className="card-title">Open findings trend</h2><Trend points={series('findings_open')} label="Open findings" color="var(--co-violation)" testId="trend-findings" /></section>
            <section className="card card-pad"><h2 className="card-title">By category (open)</h2><table className="tbl"><tbody>{CATEGORIES.map((c) => <tr key={c}><td>{CAT_LABEL[c]}</td><td className="num">{d.by_category[c]}</td></tr>)}</tbody></table><p className="hint" style={{ marginTop: 8 }}><button type="button" className="row-btn" onClick={() => go('monitor/findings')}>All findings</button> · <button type="button" className="row-btn" onClick={() => go('monitor/activity')}>Activity</button></p></section>
          </div>
          {d.latest?.by_family && Object.keys(d.latest.by_family).length > 0 && (
            <section className="card card-pad"><h2 className="card-title">Control status by family (latest run)</h2>
              <div className="table-wrap"><table className="tbl" data-testid="monitor-family"><thead><tr><th scope="col">Family</th><th scope="col" className="num">Met</th><th scope="col" className="num">Total</th><th scope="col" style={{ width: '40%' }}>Met share</th></tr></thead><tbody>{Object.entries(d.latest.by_family).sort().map(([f, x]) => <tr key={f}><td><strong>{f}</strong></td><td className="num">{x.met}</td><td className="num">{x.total}</td><td><div className="bar"><div className="bar-fill" data-tone={x.met === x.total ? 'good' : x.met ? 'warn' : 'bad'} style={{ width: `${(x.met / x.total) * 100}%` }} /></div></td></tr>)}</tbody></table></div>
            </section>
          )}
        </>
      )}
      {top.data && top.data.length > 0 && <section className="card card-pad"><h2 className="card-title">Most severe open findings</h2><FindingsTable rows={top.data.slice(0, 10)} onOpen={setOpen} testId="monitor-top" /></section>}
      {d && d.open === 0 && d.snapshots > 0 && <Empty>No open finding. The programme is on track as of {fmt(d.last_evaluated_at)}.</Empty>}
      {open && eng.id && <FindingDrawer eid={eng.id} f={open} viewer={viewer} onChanged={(m) => { setOpen(null); setToast(m); reloadAll(); }} onClose={() => setOpen(null)} />}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

// ====================================================================== findings (alerts)
export function MonitorFindingsPage({ viewer }: { viewer: Viewer }) {
  const eng = useEngagement();
  const [status, setStatus] = useState<FindingStatus | 'open_all' | 'all'>('open_all');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [severity, setSeverity] = useState<Severity | 'all'>('all');
  const [q, setQ] = useState('');
  const list = useLoader<Finding[]>(eng.id ? () => monitorApi.findings(eng.id, { status: status === 'all' || status === 'open_all' ? undefined : status, category: category === 'all' ? undefined : category, severity: severity === 'all' ? undefined : severity }) : null, [eng.id, status, category, severity]);
  const [open, setOpen] = useState<Finding | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const rows = useMemo(() => (list.data ?? []).filter((f) => (status !== 'open_all' || f.status !== 'resolved') && (!q || `${f.title} ${f.key} ${f.requirement_id ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [list.data, status, q]);
  return (
    <div className="pg" data-testid="page-monitor-findings">
      <PageHeader icon="bell" title="Alerts & findings" lede="Every open, acknowledged and escalated finding, most severe first. Acknowledge to show it is owned, escalate to name who decides, resolve with what was done — or let the next evaluation clear it when the underlying record is fixed." actions={<EngagementSelect eng={eng} />} />
      <div className="toolbar">
        <label className="grow"><span className="sr-only">Search</span><input className="input" placeholder="Search title, key, requirement" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label>Status <select className="select" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} data-testid="findings-status"><option value="open_all">Open (all)</option><option value="all">All</option><option value="open">Open</option><option value="acknowledged">Acknowledged</option><option value="escalated">Escalated</option><option value="resolved">Resolved</option></select></label>
        <label>Category <select className="select" value={category} onChange={(e) => setCategory(e.target.value as Category | 'all')}><option value="all">All</option>{CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}</select></label>
        <label>Severity <select className="select" value={severity} onChange={(e) => setSeverity(e.target.value as Severity | 'all')}><option value="all">All</option>{SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
      </div>
      {(eng.error || list.error) && <p className="note" data-tone="bad" role="alert">{eng.error ?? list.error}</p>}
      {list.data && rows.length === 0 && <Empty>No finding in this filter.</Empty>}
      {rows.length > 0 && <FindingsTable rows={rows} onOpen={setOpen} testId="findings-table" />}
      {open && eng.id && <FindingDrawer eid={eng.id} f={open} viewer={viewer} onChanged={(m) => { setOpen(null); setToast(m); list.reload(); }} onClose={() => setOpen(null)} />}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

// ====================================================================== activity (audit & compliance event history)
export function MonitorActivityPage() {
  const eng = useEngagement();
  const [q, setQ] = useState('');
  const act = useLoader<Activity[]>(eng.id ? () => monitorApi.activity(eng.id, q || undefined) : null, [eng.id, q]);
  const [open, setOpen] = useState<Activity | null>(null);
  return (
    <div className="pg" data-testid="page-monitor-activity">
      <PageHeader icon="audit" title="Audit & activity" lede="The tenant's compliance event history: who did what, to which record, when — sign-ins, approvals, overrides, evidence reviews, run requests, monitoring actions. Append-only; the assessor can be shown this as the change record." actions={<EngagementSelect eng={eng} />} />
      <div className="toolbar"><label className="grow"><span className="sr-only">Search</span><input className="input" placeholder="Filter by action (e.g. evidence., remediation.run, assessment.override), actor or target type" value={q} onChange={(e) => setQ(e.target.value)} data-testid="activity-q" /></label></div>
      {(eng.error || act.error) && <p className="note" data-tone="bad" role="alert">{eng.error ?? act.error}</p>}
      {act.data && act.data.length === 0 && <Empty>No event matches.</Empty>}
      {act.data && act.data.length > 0 && (
        <div className="table-wrap"><table className="tbl" data-testid="activity-table"><thead><tr><th scope="col">When</th><th scope="col">Actor</th><th scope="col">Action</th><th scope="col">Target</th><th scope="col"><span className="sr-only">Detail</span></th></tr></thead>
          <tbody>{act.data.map((a) => <tr key={a.id}><td>{fmt(a.at)}</td><td>{a.actor_user_id ?? 'system'}<div className="hint">{a.actor_role}</div></td><td><code>{a.action}</code></td><td className="hint">{a.target_type ?? '—'}{a.target_id ? ` · ${a.target_id.slice(0, 8)}…` : ''}</td><td>{a.detail && <button type="button" className="row-btn" onClick={() => setOpen(a)}>Detail</button>}</td></tr>)}</tbody></table></div>
      )}
      {open && <Drawer title={open.action} subtitle={`${fmt(open.at)} · ${open.actor_user_id ?? 'system'} (${open.actor_role ?? '—'})`} onClose={() => setOpen(null)} footer={<button type="button" className="btn btn-primary" onClick={() => setOpen(null)}>Close</button>}><pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(open.detail, null, 2)}</pre></Drawer>}
    </div>
  );
}
