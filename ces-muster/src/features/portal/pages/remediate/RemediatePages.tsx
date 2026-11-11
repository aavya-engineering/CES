// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// RemediatePages.tsx — Sprint 5 slice "Remediate" (workbook groups Remediation
// Overview, Configuration Management – Stamper, Administrative Operations –
// AdminOps, Remediation Tracking). Real data from muster-api: run requests with
// the engine's gates shown on the row, DP-2 two-person approval, simulated
// execution (tenant never touched), human task verification. Stamper screens
// are BHD-only; AdminOps is the customer's CIS administrator's console with
// the senior approver's queue. Aavya portal theme.

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { RouteId, Viewer } from '../../nav';
import { actionsFor } from '../../lifecycle/rbac';
import { ConfirmDialog, Drawer, Toast } from '../../governed';
import { Empty, PageHeader, Stat } from '../../ui';
import { REQUIREMENTS } from '../../referenceData';
import { engagementLabel, useEngagement } from '../useEngagement';
import { failureText } from '../onboard/onboardApi';
import { planApi, type PlanAction } from '../plan/planApi';
import { remediationApi, RUN_STATUS_LABEL, RUN_STATUS_TONE, type AdminOp, type Gate, type RemediationRun, type RemediationSummary, type RunMode, type StamperEntry } from './remediationApi';

const PRACTICE = new Map(REQUIREMENTS.map((r) => [r.control_id, r.practice]));
const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const isSignedIn = (v: Viewer): v is { kind: 'signed-in'; role: string } => v.kind === 'signed-in';
const role = (v: Viewer) => (isSignedIn(v) ? v.role : '');
const isBhd = (v: Viewer) => role(v) === 'bhd_operator';
const canExecute = (v: Viewer, group: string) => isSignedIn(v) && actionsFor(v.role, 'remediate', group).includes('execute');
const canApprove = (v: Viewer, group: string) => isSignedIn(v) && actionsFor(v.role, 'remediate', group).includes('approve');

function EngagementSelect({ eng }: { eng: ReturnType<typeof useEngagement> }) {
  return (
    <label>Engagement{' '}
      <select className="select" value={eng.id} onChange={(e) => eng.setId(e.target.value)} data-testid="remediate-engagement">
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
    load().then((r) => { if (!live) return; if (r.ok) { setData(r.data); setError(null); } else setError(failureText(r)); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);
  return { data, error, reload: () => setTick((t) => t + 1) };
}

function GateList({ gates }: { gates: Gate[] }) {
  return (
    <ul className="checklist" data-testid="run-gates">
      {gates.map((g) => <li key={g.id}><span className="pill" data-tone={g.ok ? 'good' : g.blocking ? 'bad' : 'warn'}>{g.ok ? 'OK' : g.blocking ? 'BLOCKED' : 'Note'}</span> <span>{g.label}{g.note && <div className="hint">{g.note}</div>}</span></li>)}
    </ul>
  );
}

// ====================================================================== run detail (shared)
function RunDrawer({ eid, run, viewer, onChanged, onClose }: { eid: string; run: RemediationRun; viewer: Viewer; onChanged: (m: string) => void; onClose: () => void }) {
  const [detail, setDetail] = useState<RemediationRun>(run);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { remediationApi.run(eid, run.id).then((r) => r.ok && setDetail(r.data)); }, [eid, run.id]);
  const group = detail.module === 'stamper' ? 'configuration-management-stamper' : 'administrative-operations-adminops';
  const me = isSignedIn(viewer) ? viewer.role : '';
  const act = async (what: string, fn: () => Promise<{ ok: true; data: unknown } | { ok: false; status: number; degraded: boolean; error?: string }>, msg: string) => {
    setBusy(what);
    setError(null);
    const r = await fn();
    setBusy(null);
    if (r.ok) onChanged(msg); else setError(failureText(r));
  };
  const approver = canApprove(viewer, group) || isBhd(viewer);
  const executor = canExecute(viewer, group);
  return (
    <Drawer title={`${detail.module === 'stamper' ? 'Stamper' : 'AdminOps'} run — ${RUN_STATUS_LABEL[detail.status]}`} subtitle={`${detail.mode === 'live' ? 'LIVE' : 'Simulate'} · requested by ${detail.requested_by} on ${fmt(detail.requested_at)}`} onClose={onClose} testId="run-drawer" wide
      footer={<button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>}>
      {error && <p className="note" data-tone="bad" role="alert">{error}</p>}
      <div className="stats">
        <Stat icon="sprs" value={detail.cost_estimate} label="DP-1 cost (units)" />
        <Stat icon="roles" value={detail.requires_approval ? 'Two-person' : 'Not needed'} label="DP-2 approval" tone={detail.requires_approval ? 'warn' : 'good'} sub={detail.approved_by ? `by ${detail.approved_by} · ${fmt(detail.approved_at)}` : undefined} />
        <Stat icon="stamper" value={detail.module === 'stamper' ? detail.entry_ids.length : detail.op_id ?? '—'} label={detail.module === 'stamper' ? 'Registry entries' : 'Operation'} />
      </div>
      <p><strong>Justification.</strong> {detail.justification}</p>
      {detail.requirement_id && <p className="hint">{detail.requirement_id} — {PRACTICE.get(detail.requirement_id)}</p>}
      <h3 className="card-title">Gates</h3>
      <GateList gates={detail.gates} />
      {detail.module === 'stamper' && detail.entries && (
        <>
          <h3 className="card-title">Entries</h3>
          <table className="tbl"><tbody>{detail.entries.map((e) => <tr key={e.entry_id}><td><strong>{e.label}</strong><div className="hint">{e.entry_id}</div></td><td><span className="pill" data-tone={e.has_set ? 'warn' : 'good'}>{e.has_set ? 'set' : 'get'}</span></td><td className="hint">{e.engine}</td></tr>)}</tbody></table>
        </>
      )}
      {detail.module === 'adminops' && detail.op && (
        <>
          <h3 className="card-title">{detail.op.id} · {detail.op.title}</h3>
          <p className="hint">{detail.op.overview} · {detail.op.priority} · {detail.op.sod_tier} · practices {detail.op.cmmc_practices.join(', ')}</p>
          <table className="tbl"><tbody>{Object.entries(detail.parameters ?? {}).map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody></table>
        </>
      )}
      {detail.rejection_reason && <p className="note" data-tone="bad">Rejected: {detail.rejection_reason}</p>}
      {detail.result && (
        <>
          <h3 className="card-title">Result</h3>
          {detail.result.queued && detail.result.note && <p className="note" data-tone="warn">{detail.result.note}</p>}
          {detail.status === 'running' && <p className="note" data-tone="info">Running on tenant runner <strong>{detail.result.claimed_by}</strong> since {fmt(detail.result.claimed_at)}. Results arrive from the runner; refresh to see them.</p>}
          {detail.result.simulated && <p className="hint">Simulated — the tenant was not touched. {detail.result.steps?.length} step(s) would run:</p>}
          {detail.result.tenant_touched && <p className="note" data-tone={detail.status === 'failed' ? 'bad' : 'good'}>Executed on the tenant by runner <strong>{detail.result.runner}</strong>: {detail.result.summary}{detail.result.held ? ` · ${detail.result.held} step(s) HELD` : ''}{detail.result.evidence_ids?.length ? ` · ${detail.result.evidence_ids.length} capture${detail.result.evidence_ids.length === 1 ? '' : 's'} added to Collect Evidence as drafts (source ${detail.module})` : ''}</p>}
          {detail.result.steps && detail.result.steps.length > 0 && <ol>{detail.result.steps.map((s) => <li key={s.step}>{s.label ?? s.entry_id ?? s.op_id} <span className="hint">({s.kind ?? s.op_id ?? 'step'} · {s.outcome}{s.duration_ms != null ? ` · ${(s.duration_ms / 1000).toFixed(1)}s` : ''}){s.detail ? ` — ${s.detail}` : ''}</span></li>)}</ol>}
        </>
      )}
      {detail.verified_by && <p className="note" data-tone={detail.status === 'verified' ? 'good' : 'bad'}>{detail.status === 'verified' ? 'Verified' : 'Marked failed'} by {detail.verified_by} on {fmt(detail.verified_at)}: {detail.verification_notes}</p>}

      <h3 className="card-title">Actions</h3>
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        {detail.status === 'requested' && approver && detail.requested_by !== me && <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => act('approve', () => remediationApi.approve(eid, detail.id), 'Run approved.')} data-testid="run-approve">Approve (second person)</button>}
        {detail.status === 'requested' && approver && detail.requested_by === me && <span className="hint">You requested this run — a different person must approve it (DP-2).</span>}
        {detail.status === 'approved' && executor && <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => act('execute', () => remediationApi.execute(eid, detail.id), detail.mode === 'live' ? 'Queued for the tenant runner.' : 'Simulated run recorded.')} data-testid="run-execute">{detail.mode === 'live' ? 'Queue live run' : 'Run simulation'}</button>}
        {(detail.status === 'requested' || detail.status === 'approved' || detail.status === 'blocked') && approver && (
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); act('reject', () => remediationApi.reject(eid, detail.id, reason), 'Run rejected.'); }} style={{ display: 'flex', gap: 6 }}>
            <input className="input" placeholder="Reason to reject" value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} required /><button type="submit" className="btn btn-secondary" disabled={!!busy}>Reject</button>
          </form>
        )}
        {(detail.status === 'succeeded' || detail.status === 'failed') && executor && detail.status !== 'failed' && (
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); act('verify', () => remediationApi.verify(eid, detail.id, true, notes), 'Run verified; linked action closed.'); }} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input className="input" placeholder="What you checked in the tenant" value={notes} onChange={(e) => setNotes(e.target.value)} minLength={5} required style={{ minWidth: 280 }} data-testid="run-verify-notes" />
            <button type="submit" className="btn btn-primary" disabled={!!busy} data-testid="run-verify">Verified</button>
            <button type="button" className="btn btn-secondary" disabled={!!busy || notes.length < 5} onClick={() => act('fail', () => remediationApi.verify(eid, detail.id, false, notes), 'Run marked failed.')}>Not as expected</button>
          </form>
        )}
        {!['succeeded', 'verified', 'rejected', 'cancelled', 'running'].includes(detail.status) && (detail.requested_by === me || isBhd(viewer)) && <button type="button" className="btn btn-secondary" disabled={!!busy} onClick={() => act('cancel', () => remediationApi.cancel(eid, detail.id), 'Run cancelled.')}>Cancel</button>}
      </div>
    </Drawer>
  );
}

function RunsTable({ runs, onOpen, testId }: { runs: RemediationRun[]; onOpen: (r: RemediationRun) => void; testId: string }) {
  return (
    <div className="table-wrap">
      <table className="tbl" data-testid={testId}>
        <thead><tr><th scope="col">Requested</th><th scope="col">Module</th><th scope="col">What</th><th scope="col">Mode</th><th scope="col" className="num">Cost</th><th scope="col">Gates</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
        <tbody>
          {runs.map((r) => {
            const blocked = r.gates.filter((g) => g.blocking && !g.ok).length;
            return (
              <tr key={r.id}>
                <td>{fmt(r.requested_at)}<div className="hint">{r.requested_by}</div></td>
                <td>{r.module === 'stamper' ? 'Stamper' : 'AdminOps'}</td>
                <td>{r.module === 'stamper' ? `${r.entry_ids.length} entr${r.entry_ids.length === 1 ? 'y' : 'ies'}` : r.op_id}{r.requirement_id && <div className="hint">{r.requirement_id}</div>}</td>
                <td><span className="pill" data-tone={r.mode === 'live' ? 'bad' : undefined}>{r.mode}</span></td>
                <td className="num">{r.cost_estimate}</td>
                <td>{blocked ? <span className="pill" data-tone="bad">{blocked} blocking</span> : <span className="pill" data-tone="good">pass</span>}</td>
                <td><span className="pill" data-tone={RUN_STATUS_TONE[r.status]}>{RUN_STATUS_LABEL[r.status]}</span></td>
                <td><button type="button" className="row-btn" onClick={() => onOpen(r)} data-testid={`run-open-${r.id}`}>Open</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ====================================================================== overview / tracking
export function RemediationOverviewPage({ viewer, go }: { viewer: Viewer; go: (r: RouteId) => void }) {
  const eng = useEngagement();
  const s = useLoader<RemediationSummary>(eng.id ? () => remediationApi.summary(eng.id) : null, [eng.id]);
  const runs = useLoader<RemediationRun[]>(eng.id ? () => remediationApi.runs(eng.id) : null, [eng.id]);
  const [open, setOpen] = useState<RemediationRun | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'verify' | 'done' | 'failed'>('all');
  const d = s.data;
  const shown = useMemo(() => (runs.data ?? []).filter((r) => filter === 'all' || (filter === 'pending' ? r.status === 'requested' || r.status === 'approved' || r.status === 'queued' : filter === 'verify' ? r.status === 'succeeded' : filter === 'done' ? r.status === 'verified' : r.status === 'failed' || r.status === 'blocked' || r.status === 'rejected')), [runs.data, filter]);
  const changed = (m: string) => { setOpen(null); setToast(m); s.reload(); runs.reload(); };
  return (
    <div className="pg" data-testid="page-remediate-overview">
      <PageHeader icon="stamper" title="Remediation" lede="What is being fixed and how far it is: plan actions in flight, runs awaiting a second person, runs finished and waiting for a human to verify. Stamper (configuration) is BHD's console; AdminOps is the customer's." actions={<EngagementSelect eng={eng} />} />
      {(eng.error || s.error || runs.error) && <p className="note" data-tone="bad" role="alert">{eng.error ?? s.error ?? runs.error}</p>}
      {d && (
        <div className="stats">
          <Stat icon="plan" value={d.actions.open + d.actions.in_progress} label="Actions in flight" sub={`${d.actions.in_progress} in progress · ${d.actions.blocked} blocked`} tone={d.actions.blocked ? 'warn' : undefined} />
          <Stat icon="roles" value={d.runs.pending_approval} label="Awaiting approval" tone={d.runs.pending_approval ? 'warn' : 'good'} sub="DP-2 second person" />
          <Stat icon="readiness" value={d.runs.pending_verification} label="Pending verification" tone={d.runs.pending_verification ? 'warn' : 'good'} sub="finished runs a person must confirm" />
          <Stat icon="golden" value={d.runs.by_status.verified} label="Verified" tone="good" sub={`${d.actions.done} actions done`} />
          <Stat icon="situation" value={d.runs.by_status.failed + d.runs.by_status.blocked} label="Failed / blocked" tone={d.runs.by_status.failed + d.runs.by_status.blocked ? 'bad' : 'good'} />
          <Stat icon="registry" value={`${d.registry.stamper_entries} / ${d.registry.adminops_operations}`} label="Registry entries / AdminOps" sub={`${d.registry.stamper_set_entries} set-commands`} />
        </div>
      )}
      <div className="toolbar">
        <label>Show <select className="select" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}><option value="all">All runs</option><option value="pending">Pending (approval / queued)</option><option value="verify">Pending verification</option><option value="done">Verified</option><option value="failed">Failed / blocked / rejected</option></select></label>
        <span className="grow" />
        {isBhd(viewer) && <button type="button" className="btn btn-secondary" onClick={() => go('remediate/stamper')}>Stamper console</button>}
        {isSignedIn(viewer) && actionsFor(viewer.role, 'remediate', 'administrative-operations-adminops').length > 0 && <button type="button" className="btn btn-secondary" onClick={() => go('remediate/adminops')}>AdminOps console</button>}
      </div>
      {runs.data && shown.length === 0 && <Empty>{runs.data.length === 0 ? 'No run requested yet.' : 'Nothing in this filter.'}</Empty>}
      {shown.length > 0 && <RunsTable runs={shown} onOpen={setOpen} testId="tracking-table" />}
      {open && eng.id && <RunDrawer eid={eng.id} run={open} viewer={viewer} onChanged={changed} onClose={() => setOpen(null)} />}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

// ====================================================================== Stamper (BHD)
export function StamperPage({ viewer }: { viewer: Viewer }) {
  const eng = useEngagement();
  const runs = useLoader<RemediationRun[]>(eng.id ? () => remediationApi.runs(eng.id, 'stamper') : null, [eng.id]);
  const actions = useLoader<PlanAction[]>(eng.id ? () => planApi.actions(eng.id) : null, [eng.id]);
  const [control, setControl] = useState('');
  const [q, setQ] = useState('');
  const registry = useLoader<StamperEntry[]>(eng.id ? () => remediationApi.stamperRegistry(eng.id, { control: control || undefined, q: q || undefined }) : null, [eng.id, control, q]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<RunMode>('simulate');
  const [actionId, setActionId] = useState('');
  const [justification, setJustification] = useState('');
  const [preview, setPreview] = useState<RemediationRun | null>(null);
  const [open, setOpen] = useState<RemediationRun | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const writable = canExecute(viewer, 'configuration-management-stamper');
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const fromAction = (a: PlanAction) => { setActionId(a.id); setPicked(new Set(a.fix_entry_ids)); setControl(a.requirement_id ?? ''); if (!justification) setJustification(`Remediate ${a.requirement_id}: ${a.title}`); };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const a = actions.data?.find((x) => x.id === actionId);
    const r = await remediationApi.request(eng.id, { module: 'stamper', mode, entry_ids: [...picked], action_id: actionId || null, requirement_id: a?.requirement_id ?? control ?? null, justification });
    setBusy(false);
    if (r.ok) { setPreview(r.data); setPicked(new Set()); setJustification(''); runs.reload(); } else setErr(failureText(r));
  };
  const registryActions = (actions.data ?? []).filter((a) => a.fix_kind === 'registry' && a.status !== 'done' && a.status !== 'wont_fix');
  return (
    <div className="pg" data-testid="page-remediate-stamper">
      <PageHeader icon="stamper" title="Stamper — configuration management" lede="BHD-only. Pick registry entries (or start from a registry-fixable plan action), choose simulate or live, justify, and request. Gates are evaluated on request; a set-command needs a second BHD operator (DP-2); live needs the engagement's live-access flag. Simulate never touches the tenant." actions={<EngagementSelect eng={eng} />} />
      {!isBhd(viewer) && <p className="note" data-tone="bad" role="alert">Stamper is operated by Blue Heron Defense. Your role can follow runs under Remediation › Overview.</p>}
      {(eng.error || runs.error || err) && <p className="note" data-tone="bad" role="alert">{eng.error ?? runs.error ?? err}</p>}
      {writable && eng.id && (
        <form className="card card-pad" onSubmit={submit} data-testid="stamper-request">
          <h2 className="card-title">New run request</h2>
          {registryActions.length > 0 && (
            <label className="form-row">Start from a plan action
              <select className="select" value={actionId} onChange={(e) => { const a = registryActions.find((x) => x.id === e.target.value); if (a) fromAction(a); else setActionId(''); }} data-testid="stamper-action">
                <option value="">— none —</option>
                {registryActions.map((a) => <option key={a.id} value={a.id}>{a.requirement_id} · {a.title.slice(0, 70)} ({a.fix_entry_ids.length} entries)</option>)}
              </select>
            </label>
          )}
          <div className="toolbar">
            <label>Control <input className="input" list="stamper-controls" value={control} onChange={(e) => setControl(e.target.value.toUpperCase())} placeholder="AC.L2-3.1.5" style={{ width: 160 }} /><datalist id="stamper-controls">{REQUIREMENTS.map((r) => <option key={r.control_id} value={r.control_id} />)}</datalist></label>
            <label className="grow"><span className="sr-only">Search</span><input className="input" placeholder="Search entry id or label" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            <span className="hint">{picked.size} selected</span>
          </div>
          <div className="table-wrap" style={{ maxHeight: 320, overflow: 'auto' }}>
            <table className="tbl" data-testid="stamper-registry">
              <thead><tr><th scope="col"><span className="sr-only">Pick</span></th><th scope="col">Entry</th><th scope="col">Kind</th><th scope="col">Engine</th><th scope="col">Controls</th></tr></thead>
              <tbody>
                {(registry.data ?? []).slice(0, 200).map((e) => (
                  <tr key={e.entry_id} aria-selected={picked.has(e.entry_id)}>
                    <td><input type="checkbox" checked={picked.has(e.entry_id)} onChange={() => toggle(e.entry_id)} disabled={e.manual_only} aria-label={`Select ${e.entry_id}`} /></td>
                    <td><strong>{e.label}</strong><div className="hint">{e.entry_id}</div></td>
                    <td>{e.manual_only ? <span className="pill" data-tone="bad">HELD · manual</span> : <span className="pill" data-tone={e.has_set ? 'warn' : 'good'}>{e.has_set ? 'set' : 'get'}</span>}</td>
                    <td className="hint">{e.engine}{e.azure_tier ? ` · ${e.azure_tier}` : ''}</td>
                    <td className="hint">{e.control_ids.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-grid-2" style={{ marginTop: 12 }}>
            <label className="form-row">Mode
              <select className="select" value={mode} onChange={(e) => setMode(e.target.value as RunMode)} data-testid="stamper-mode"><option value="simulate">Simulate (no tenant contact)</option><option value="live">Live (needs live access + approval)</option></select>
            </label>
            <label className="form-row">Justification *<input className="input" value={justification} onChange={(e) => setJustification(e.target.value)} required minLength={10} data-testid="stamper-justification" /></label>
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy || picked.size === 0 || justification.length < 10} data-testid="stamper-submit">{busy ? 'Requesting…' : `Request ${mode} run (${picked.size})`}</button>
        </form>
      )}
      {preview && (
        <section className="card card-pad" data-testid="stamper-preview">
          <h2 className="card-title">Request recorded — <span className="pill" data-tone={RUN_STATUS_TONE[preview.status]}>{RUN_STATUS_LABEL[preview.status]}</span> · cost {preview.cost_estimate}</h2>
          <GateList gates={preview.gates} />
          <button type="button" className="row-btn" onClick={() => { setOpen(preview); setPreview(null); }}>Open run</button>
        </section>
      )}
      <section className="card card-pad">
        <h2 className="card-title">Stamper runs</h2>
        {runs.data && runs.data.length === 0 && <Empty>No Stamper run yet.</Empty>}
        {runs.data && runs.data.length > 0 && <RunsTable runs={runs.data} onOpen={setOpen} testId="stamper-runs" />}
      </section>
      {open && eng.id && <RunDrawer eid={eng.id} run={open} viewer={viewer} onChanged={(m) => { setOpen(null); setToast(m); runs.reload(); }} onClose={() => setOpen(null)} />}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

// ====================================================================== AdminOps (customer CIS admin)
const DOMAINS: [string, string][] = [['A', 'Identity & Access'], ['B', 'Devices & Endpoints'], ['C', 'Credentials & Keys'], ['D', 'Data Protection & CUI'], ['E', 'Audit & Logging'], ['F', 'Security Configuration'], ['G', 'Personnel Security'], ['H', 'Incident Response']];

export function AdminOpsPage({ viewer, initialDomain }: { viewer: Viewer; initialDomain?: string }) {
  const eng = useEngagement();
  const [domain, setDomain] = useState(initialDomain ?? 'A');
  const ops = useLoader<AdminOp[]>(eng.id ? () => remediationApi.adminOps(eng.id, domain) : null, [eng.id, domain]);
  const runs = useLoader<RemediationRun[]>(eng.id ? () => remediationApi.runs(eng.id, 'adminops') : null, [eng.id]);
  const [op, setOp] = useState<AdminOp | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<RunMode>('simulate');
  const [justification, setJustification] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<RemediationRun | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmLive, setConfirmLive] = useState(false);
  const executor = canExecute(viewer, 'administrative-operations-adminops');
  const approver = canApprove(viewer, 'administrative-operations-adminops') || isBhd(viewer);
  const queue = (runs.data ?? []).filter((r) => r.status === 'requested');
  const submit = async () => {
    if (!op) return;
    setBusy(true);
    setErr(null);
    const r = await remediationApi.request(eng.id, { module: 'adminops', mode, op_id: op.id, parameters: params, requirement_id: op.cmmc_practices[0] ?? null, justification });
    setBusy(false);
    setConfirmLive(false);
    if (r.ok) { setToast(`${op.id} requested — ${RUN_STATUS_LABEL[r.data.status]}.`); setOp(null); setParams({}); setJustification(''); runs.reload(); } else setErr(failureText(r));
  };
  return (
    <div className="pg" data-testid="page-remediate-adminops">
      <PageHeader icon="adminops" title="AdminOps — administrative operations" lede="The 95 day-to-day operations (onboarding, devices, keys, CUI boundary, logging, posture, personnel, incidents) run by the customer's CIS administrator. Every change needs a second person (senior approver) before it runs; parameters never include secrets." actions={<EngagementSelect eng={eng} />} />
      {(eng.error || ops.error || runs.error || err) && <p className="note" data-tone="bad" role="alert">{eng.error ?? ops.error ?? runs.error ?? err}</p>}
      {approver && queue.length > 0 && (
        <section className="card card-pad" data-testid="adminops-queue">
          <h2 className="card-title">Approval queue · {queue.length}</h2>
          <RunsTable runs={queue} onOpen={setOpen} testId="adminops-queue-table" />
        </section>
      )}
      <div className="toolbar" role="tablist" aria-label="AdminOps domains">
        {DOMAINS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={domain === k} className={`btn ${domain === k ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setDomain(k)} data-testid={`adminops-domain-${k}`}>{k} · {label}</button>)}
      </div>
      {ops.data && (
        <div className="table-wrap">
          <table className="tbl" data-testid="adminops-catalog">
            <thead><tr><th scope="col">Operation</th><th scope="col">Trigger</th><th scope="col">Priority</th><th scope="col">SoD</th><th scope="col">Practices</th><th scope="col"><span className="sr-only">Request</span></th></tr></thead>
            <tbody>
              {ops.data.map((o) => (
                <tr key={o.id}>
                  <td><strong>{o.id} · {o.title}</strong><div className="hint" style={{ maxWidth: 480 }}>{o.overview}</div></td>
                  <td className="hint">{o.trigger}</td>
                  <td><span className="pill" data-tone={o.priority?.startsWith('P1') ? 'bad' : o.priority?.startsWith('P2') ? 'warn' : undefined}>{o.priority}</span></td>
                  <td className="hint">{o.sod_tier}</td>
                  <td className="hint">{o.cmmc_practices.join(', ')}</td>
                  <td>{executor && <button type="button" className="row-btn" onClick={() => { setOp(o); setParams({}); }} data-testid={`adminops-request-${o.id}`}>Request</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <section className="card card-pad">
        <h2 className="card-title">AdminOps runs</h2>
        {runs.data && runs.data.length === 0 && <Empty>No change request yet.</Empty>}
        {runs.data && runs.data.length > 0 && <RunsTable runs={runs.data} onOpen={setOpen} testId="adminops-runs" />}
      </section>
      {op && eng.id && (
        <Drawer title={`${op.id} · ${op.title}`} subtitle={`${op.domain_name} · ${op.priority} · ${op.sod_tier} · ${op.idempotency_class}`} onClose={() => setOp(null)} testId="adminops-drawer"
          footer={<><button type="button" className="btn btn-secondary" onClick={() => setOp(null)}>Cancel</button><button type="submit" form="adminops-form" className="btn btn-primary" disabled={busy || justification.length < 10} data-testid="adminops-submit">{busy ? 'Requesting…' : 'Request change'}</button></>}>
          <p className="hint">{op.overview}</p>
          <form id="adminops-form" onSubmit={(e) => { e.preventDefault(); if (mode === 'live') setConfirmLive(true); else void submit(); }}>
            {op.parameters.filter((p) => p.type !== 'readonly').map((p) => (
              <label key={p.name} className="form-row">{p.label}{p.required ? ' *' : ''}
                <input className="input" value={params[p.name] ?? ''} onChange={(e) => setParams((x) => ({ ...x, [p.name]: e.target.value }))} placeholder={p.placeholder ?? undefined} required={p.required} data-testid={`adminops-param-${p.name}`} />
              </label>
            ))}
            {op.parameters.some((p) => p.type === 'readonly') && <p className="hint">Tenant values ({op.parameters.filter((p) => p.type === 'readonly').map((p) => p.label).join(', ')}) are resolved on the runner from the tenant profile.</p>}
            <label className="form-row">Mode<select className="select" value={mode} onChange={(e) => setMode(e.target.value as RunMode)}><option value="simulate">Simulate</option><option value="live">Live (changes the tenant after approval)</option></select></label>
            <label className="form-row">Justification *<textarea className="input" rows={2} value={justification} onChange={(e) => setJustification(e.target.value)} required minLength={10} data-testid="adminops-justification" /></label>
          </form>
        </Drawer>
      )}
      {confirmLive && <ConfirmDialog title="Request a LIVE change" confirmLabel="Request live change" onConfirm={submit} onCancel={() => setConfirmLive(false)}><p>After a second person approves, this operation will change the customer's tenant. Simulate first unless the change has already been rehearsed.</p></ConfirmDialog>}
      {open && eng.id && <RunDrawer eid={eng.id} run={open} viewer={viewer} onChanged={(m) => { setOpen(null); setToast(m); runs.reload(); }} onClose={() => setOpen(null)} />}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
