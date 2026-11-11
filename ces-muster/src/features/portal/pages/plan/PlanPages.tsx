// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// PlanPages.tsx — Sprint 4 slice "Plan" (workbook groups Planning Overview,
// Remediation Planning, Action Management, Prioritization, POA&M Planning,
// Plan Artifacts). Real data from muster-api: actions generated from a run's
// gaps (priority = SPRS weight), owners / due dates / sequence, and the POA&M
// register with the CMMC rule (only 1-point, non-prohibited requirements may
// sit on a POA&M) made visible rather than hidden. Aavya portal theme.

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { RouteId, Viewer } from '../../nav';
import { actionsFor } from '../../lifecycle/rbac';
import { ConfirmDialog, Drawer, RowActions, Toast } from '../../governed';
import { Empty, PageHeader, Stat } from '../../ui';
import { REQUIREMENTS } from '../../referenceData';
import { engagementLabel, useEngagement } from '../useEngagement';
import { failureText } from '../onboard/onboardApi';
import { assessApi, type AssessmentRun } from '../assess/assessApi';
import {
  ACTION_STATUS_LABEL, ACTION_STATUS_TONE, ACTION_STATUSES, planApi, POAM_STATUS_LABEL, POAM_STATUSES, PRIORITIES, PRIORITY_TONE, ymd,
  type ActionStatus, type Milestone, type PlanAction, type PlanActionInput, type PlanSummary, type PoamItem, type PoamInput, type PoamStatus, type Priority,
} from './planApi';

const PRACTICE = new Map(REQUIREMENTS.map((r) => [r.control_id, r.practice]));
const REQ_IDS = REQUIREMENTS.map((r) => r.control_id);
const fmtDate = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—');
const canWrite = (viewer: Viewer, group: string) => viewer.kind === 'signed-in' && actionsFor(viewer.role, 'plan', group).includes('edit');
const isOverdue = (a: { due_date: string | null; status: string }) => !!a.due_date && a.status !== 'done' && a.status !== 'wont_fix' && new Date(a.due_date) < new Date();

function EngagementSelect({ eng }: { eng: ReturnType<typeof useEngagement> }) {
  return (
    <label>
      Engagement{' '}
      <select className="select" value={eng.id} onChange={(e) => eng.setId(e.target.value)} data-testid="plan-engagement">
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

// ====================================================================== overview
export function PlanOverviewPage({ viewer, go }: { viewer: Viewer; go: (r: RouteId) => void }) {
  const eng = useEngagement();
  const s = useLoader<PlanSummary>(eng.id ? () => planApi.summary(eng.id) : null, [eng.id]);
  const d = s.data;
  const open = d ? d.actions.total - d.actions.by_status.done - d.actions.by_status.wont_fix : 0;
  return (
    <div className="pg" data-testid="page-plan-overview">
      <PageHeader icon="plan" title="Planning overview" lede="Where the remediation stands: open actions by priority, what is overdue, the POA&M register, and where SPRS lands if every open action closes (a projection)." actions={<EngagementSelect eng={eng} />} />
      {(eng.error || s.error) && <p className="note" data-tone="bad" role="alert">{eng.error ?? s.error}</p>}
      {d && (
        <>
          <div className="stats">
            <Stat icon="plan" value={open} label="Open actions" tone={open ? 'warn' : 'good'} sub={`${d.actions.weight_open} SPRS points in play`} testId="plan-open" />
            <Stat icon="situation" value={d.actions.by_priority.critical} label="Critical" tone="bad" sub={`${d.actions.by_priority.high} high · ${d.actions.by_priority.medium} medium`} />
            <Stat icon="bell" value={d.actions.overdue} label="Overdue" tone={d.actions.overdue ? 'bad' : 'good'} />
            <Stat icon="contracts" value={d.poam.total} label="POA&M items" sub={d.poam.prohibited ? `${d.poam.prohibited} cannot stay on a POA&M` : 'all POA&M-eligible'} tone={d.poam.prohibited ? 'warn' : undefined} />
            <Stat icon="sprs" value={d.latest_run?.sprs_now ?? '—'} label="SPRS now" sub={d.latest_run ? fmtDate(d.latest_run.created_at) : 'no assessment run'} />
            <Stat icon="readiness" value={d.sprs_if_all_actions_done ?? '—'} label="If all actions close" tone="muster" sub="PROJECTION — not a score" />
          </div>
          <div className="form-grid-2">
            <section className="card card-pad">
              <h2 className="card-title">Next due</h2>
              {d.next_due.length === 0 && <Empty>No action has a due date yet.</Empty>}
              {d.next_due.length > 0 && (
                <table className="tbl"><tbody>
                  {d.next_due.map((a) => <tr key={a.id}><td>{a.title}</td><td>{a.owner ?? '—'}</td><td className="num" style={{ color: new Date(a.due_date) < new Date() ? 'var(--co-violation)' : undefined }}>{fmtDate(a.due_date)}</td></tr>)}
                </tbody></table>
              )}
            </section>
            <section className="card card-pad">
              <h2 className="card-title">By status</h2>
              <table className="tbl"><tbody>
                {ACTION_STATUSES.map((st) => <tr key={st}><td><span className="pill" data-tone={ACTION_STATUS_TONE[st]}>{ACTION_STATUS_LABEL[st]}</span></td><td className="num">{d.actions.by_status[st]}</td></tr>)}
              </tbody></table>
              <p className="hint" style={{ marginTop: 10 }}>
                <button type="button" className="row-btn" onClick={() => go('plan/actions')}>Open action items</button> · <button type="button" className="row-btn" onClick={() => go('plan/poam')}>Open POA&M</button>
                {d.actions.total === 0 && canWrite(viewer, 'remediation-planning') && <> · generate actions from the latest assessment run under Action items</>}
              </p>
            </section>
          </div>
        </>
      )}
      {!eng.id && eng.rows && <Empty>Create an engagement first (Onboard › Engagement Management).</Empty>}
    </div>
  );
}

// ====================================================================== actions
function ActionForm({ eid, initial, all, onSaved, onClose }: { eid: string; initial: PlanAction | null; all: PlanAction[]; onSaved: (m: string) => void; onClose: () => void }) {
  const [f, setF] = useState<PlanActionInput>(initial ? { title: initial.title, description: initial.description, requirement_id: initial.requirement_id, priority: initial.priority, status: initial.status, owner: initial.owner, due_date: ymd(initial.due_date), effort_hours: initial.effort_hours, depends_on: initial.depends_on, sequence: initial.sequence, fix_kind: initial.fix_kind, notes: initial.notes } : { title: '', status: 'open', fix_kind: 'manual', depends_on: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof PlanActionInput>(k: K, v: PlanActionInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const body: PlanActionInput = { ...f, requirement_id: f.requirement_id || null, owner: f.owner || null, due_date: f.due_date || null, description: f.description || null, notes: f.notes || null, effort_hours: f.effort_hours ?? null, sequence: f.sequence ?? null };
    const r = initial ? await planApi.updateAction(eid, initial.id, body) : await planApi.createAction(eid, body);
    setBusy(false);
    if (r.ok) onSaved(initial ? 'Action updated.' : 'Action added.'); else setError(failureText(r));
  };
  return (
    <Drawer title={initial ? 'Edit action' : 'Add action'} subtitle={initial?.requirement_id ? PRACTICE.get(initial.requirement_id) : 'A manual remediation item (policy, process, configuration).'} onClose={onClose} testId="action-drawer" wide
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="submit" form="action-form" className="btn btn-primary" disabled={busy} data-testid="action-submit">{busy ? 'Saving…' : initial ? 'Save' : 'Add action'}</button></>}>
      <form id="action-form" onSubmit={submit}>
        {error && <p className="note" data-tone="bad" role="alert">{error}</p>}
        <label className="form-row">Title *<input className="input" value={f.title ?? ''} onChange={(e) => set('title', e.target.value)} required minLength={3} data-testid="action-title" /></label>
        <div className="form-grid-2">
          <label className="form-row">Requirement
            <input className="input" list="req-ids" value={f.requirement_id ?? ''} onChange={(e) => set('requirement_id', e.target.value.toUpperCase())} placeholder="AC.L2-3.1.5" />
            <datalist id="req-ids">{REQ_IDS.map((id) => <option key={id} value={id} />)}</datalist>
            <span className="hint">Sets weight and default priority.</span>
          </label>
          <label className="form-row">Priority
            <select className="select" value={f.priority ?? ''} onChange={(e) => set('priority', (e.target.value || undefined) as Priority | undefined)}>
              <option value="">— from weight —</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>
        <div className="form-grid-2">
          <label className="form-row">Status
            <select className="select" value={f.status ?? 'open'} onChange={(e) => set('status', e.target.value as ActionStatus)} data-testid="action-status">{ACTION_STATUSES.map((s) => <option key={s} value={s}>{ACTION_STATUS_LABEL[s]}</option>)}</select>
          </label>
          <label className="form-row">Owner<input className="input" value={f.owner ?? ''} onChange={(e) => set('owner', e.target.value)} placeholder="Name or role" /></label>
        </div>
        <div className="form-grid-2">
          <label className="form-row">Due date<input className="input" type="date" value={f.due_date ?? ''} onChange={(e) => set('due_date', e.target.value)} /></label>
          <label className="form-row">Effort (hours)<input className="input" type="number" min={0} value={f.effort_hours ?? ''} onChange={(e) => set('effort_hours', e.target.value === '' ? null : Number(e.target.value))} /></label>
        </div>
        <div className="form-grid-2">
          <label className="form-row">Sequence<input className="input" type="number" min={0} value={f.sequence ?? ''} onChange={(e) => set('sequence', e.target.value === '' ? null : Number(e.target.value))} /><span className="hint">Implementation order; empty = by priority.</span></label>
          <label className="form-row">Depends on
            <select className="select" multiple value={f.depends_on ?? []} onChange={(e) => set('depends_on', [...e.target.selectedOptions].map((o) => o.value))} style={{ minHeight: 80 }}>
              {all.filter((a) => a.id !== initial?.id).map((a) => <option key={a.id} value={a.id}>{a.requirement_id ? `${a.requirement_id} · ` : ''}{a.title.slice(0, 60)}</option>)}
            </select>
          </label>
        </div>
        <label className="form-row">Description<textarea className="input" rows={3} value={f.description ?? ''} onChange={(e) => set('description', e.target.value)} /></label>
        <label className="form-row">Notes<textarea className="input" rows={2} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></label>
      </form>
    </Drawer>
  );
}

export function PlanActionsPage({ viewer }: { viewer: Viewer }) {
  const eng = useEngagement();
  const actions = useLoader<PlanAction[]>(eng.id ? () => planApi.actions(eng.id) : null, [eng.id]);
  const runs = useLoader<AssessmentRun[]>(eng.id ? () => assessApi.runs(eng.id) : null, [eng.id]);
  const [editing, setEditing] = useState<PlanAction | null | 'new'>(null);
  const [deleting, setDeleting] = useState<PlanAction | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [status, setStatus] = useState<ActionStatus | 'all' | 'open_all'>('open_all');
  const [priority, setPriority] = useState<Priority | 'all'>('all');
  const [q, setQ] = useState('');
  const writable = canWrite(viewer, 'action-management');
  const rows = actions.data ?? [];
  const shown = useMemo(() => rows.filter((a) =>
    (status === 'all' || (status === 'open_all' ? a.status !== 'done' && a.status !== 'wont_fix' : a.status === status)) && (priority === 'all' || a.priority === priority) &&
    (!q || `${a.title} ${a.requirement_id ?? ''} ${a.owner ?? ''}`.toLowerCase().includes(q.toLowerCase())),
  ), [rows, status, priority, q]);
  const latestRun = runs.data?.[0] ?? null;
  const generate = async () => {
    if (!latestRun) return;
    const r = await planApi.generate(eng.id, latestRun.id);
    if (r.ok) { setToast(`${r.data.created} action(s) generated, ${r.data.skipped} already covered.`); actions.reload(); } else setErr(failureText(r));
  };
  const quick = async (a: PlanAction, next: ActionStatus) => {
    const r = await planApi.updateAction(eng.id, a.id, { status: next });
    if (r.ok) { setToast(`${a.requirement_id ?? a.title}: ${ACTION_STATUS_LABEL[next]}.`); actions.reload(); } else setErr(failureText(r));
  };
  const doDelete = async () => {
    if (!deleting) return;
    const r = await planApi.deleteAction(eng.id, deleting.id);
    if (r.ok) { setToast('Action deleted.'); setDeleting(null); actions.reload(); } else setErr(failureText(r));
  };
  const byId = new Map(rows.map((a) => [a.id, a]));
  return (
    <div className="pg" data-testid="page-plan-actions">
      <PageHeader icon="plan" title="Action items" lede="One action per gap, prioritised by SPRS weight (5 → critical, 3 → high, 1 → medium); the SSP is always critical. Registry-fixable actions carry the set-commands Stamper / AdminOps will run; the rest are manual."
        actions={writable && eng.id ? <><button type="button" className="btn btn-secondary" onClick={generate} disabled={!latestRun} title={latestRun ? `From run of ${fmtDate(latestRun.created_at)} (SPRS ${latestRun.sprs_now})` : 'Import an assessment run first'} data-testid="actions-generate">Generate from latest run</button> <button type="button" className="btn btn-primary" onClick={() => setEditing('new')} data-testid="action-add">Add action</button></> : undefined} />
      <div className="toolbar">
        <EngagementSelect eng={eng} />
        <label className="grow"><span className="sr-only">Search</span><input className="input" placeholder="Search title, requirement, owner" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label>Status <select className="select" value={status} onChange={(e) => setStatus(e.target.value as ActionStatus | 'all' | 'open_all')}><option value="open_all">Open (all)</option><option value="all">All</option>{ACTION_STATUSES.map((s) => <option key={s} value={s}>{ACTION_STATUS_LABEL[s]}</option>)}</select></label>
        <label>Priority <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as Priority | 'all')}><option value="all">All</option>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
      </div>
      {(eng.error || actions.error || err) && <p className="note" data-tone="bad" role="alert">{eng.error ?? actions.error ?? err}</p>}
      {actions.data && rows.length === 0 && <Empty>No action yet.{writable ? (latestRun ? ' Generate them from the latest assessment run, or add one by hand.' : ' Import an assessment run first (Assess › Readiness Assessment).') : ''}</Empty>}
      {rows.length > 0 && shown.length === 0 && <Empty>Nothing matches the filters.</Empty>}
      {shown.length > 0 && (
        <div className="table-wrap">
          <table className="tbl" data-testid="action-table">
            <thead><tr><th scope="col">#</th><th scope="col">Action</th><th scope="col">Priority</th><th scope="col" className="num">Weight</th><th scope="col">Fix</th><th scope="col">Owner</th><th scope="col">Due</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {shown.map((a, i) => (
                <tr key={a.id} data-overdue={isOverdue(a) ? '' : undefined}>
                  <td className="num">{a.sequence ?? i + 1}</td>
                  <td><strong>{a.title}</strong>{a.requirement_id && <div className="hint">{a.requirement_id}{a.depends_on.length ? ` · after ${a.depends_on.map((d) => byId.get(d)?.requirement_id ?? '…').join(', ')}` : ''}</div>}</td>
                  <td><span className="pill" data-tone={PRIORITY_TONE[a.priority]}>{a.priority}</span></td>
                  <td className="num">{a.weight}</td>
                  <td>{a.fix_kind === 'registry' ? <span className="pill" data-tone="info" title={a.fix_entry_ids.join('\n')}>registry · {a.fix_entry_ids.length}</span> : <span className="pill">manual</span>}</td>
                  <td>{a.owner ?? '—'}</td>
                  <td style={{ color: isOverdue(a) ? 'var(--co-violation)' : undefined }}>{fmtDate(a.due_date)}</td>
                  <td><span className="pill" data-tone={ACTION_STATUS_TONE[a.status]}>{ACTION_STATUS_LABEL[a.status]}</span></td>
                  <td>{writable && <RowActions label={`Actions for ${a.title}`} actions={[
                    { label: 'Edit', onSelect: () => setEditing(a) },
                    ...(a.status === 'open' ? [{ label: 'Start', onSelect: () => quick(a, 'in_progress') }] : []),
                    ...(a.status !== 'done' ? [{ label: 'Mark done', onSelect: () => quick(a, 'done') }] : [{ label: 'Reopen', onSelect: () => quick(a, 'open') }]),
                    { label: 'Delete', tone: 'danger' as const, onSelect: () => { setErr(null); setDeleting(a); } },
                  ]} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && eng.id && <ActionForm eid={eng.id} initial={editing === 'new' ? null : editing} all={rows} onSaved={(m) => { setEditing(null); setToast(m); actions.reload(); }} onClose={() => setEditing(null)} />}
      {deleting && <ConfirmDialog title="Delete action" confirmLabel="Delete" error={err} onConfirm={doDelete} onCancel={() => setDeleting(null)}><p><strong>{deleting.title}</strong> will be removed. POA&M items keep their text but lose the link.</p></ConfirmDialog>}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

// ====================================================================== POA&M
function PoamForm({ eid, initial, onSaved, onClose }: { eid: string; initial: PoamItem | null; onSaved: (m: string) => void; onClose: () => void }) {
  const [f, setF] = useState<PoamInput>(initial ? { requirement_id: initial.requirement_id, weakness: initial.weakness, mitigation: initial.mitigation, milestones: initial.milestones ?? [], scheduled_completion: ymd(initial.scheduled_completion), responsible: initial.responsible, resources: initial.resources, status: initial.status } : { requirement_id: '', weakness: '', milestones: [], status: 'open' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof PoamInput>(k: K, v: PoamInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const ms = f.milestones ?? [];
  const setMs = (i: number, patch: Partial<Milestone>) => set('milestones', ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const body: PoamInput = { ...f, mitigation: f.mitigation || null, scheduled_completion: f.scheduled_completion || null, responsible: f.responsible || null, resources: f.resources || null, milestones: ms.filter((m) => m.title.trim()).map((m) => ({ ...m, due_date: m.due_date || null })) };
    const r = initial ? await planApi.updatePoam(eid, initial.id, body) : await planApi.createPoam(eid, body);
    setBusy(false);
    if (r.ok) onSaved(initial ? 'POA&M item updated.' : 'POA&M item added.'); else setError(failureText(r));
  };
  return (
    <Drawer title={initial ? `POA&M — ${initial.requirement_id}` : 'Add POA&M item'} subtitle={initial ? PRACTICE.get(initial.requirement_id) : 'NIST SP 800-171 DoD Assessment Methodology format.'} onClose={onClose} testId="poam-drawer" wide
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="submit" form="poam-form" className="btn btn-primary" disabled={busy} data-testid="poam-submit">{busy ? 'Saving…' : initial ? 'Save' : 'Add item'}</button></>}>
      <form id="poam-form" onSubmit={submit}>
        {error && <p className="note" data-tone="bad" role="alert">{error}</p>}
        {initial && !initial.poam_allowed && <p className="note" data-tone="warn">This requirement may not remain on a POA&M (32 CFR 170.21: only 1-point requirements, and never the prohibited ones). It stays listed so the assessor sees it; closing it needs the implemented mitigation.</p>}
        <div className="form-grid-2">
          <label className="form-row">Requirement *<input className="input" list="req-ids-poam" value={f.requirement_id ?? ''} onChange={(e) => set('requirement_id', e.target.value.toUpperCase())} required disabled={!!initial} /><datalist id="req-ids-poam">{REQ_IDS.map((id) => <option key={id} value={id} />)}</datalist></label>
          <label className="form-row">Status<select className="select" value={f.status ?? 'open'} onChange={(e) => set('status', e.target.value as PoamStatus)} data-testid="poam-status">{POAM_STATUSES.map((s) => <option key={s} value={s}>{POAM_STATUS_LABEL[s]}</option>)}</select></label>
        </div>
        <label className="form-row">Weakness *<textarea className="input" rows={2} value={f.weakness ?? ''} onChange={(e) => set('weakness', e.target.value)} required minLength={3} /></label>
        <label className="form-row">Mitigation / remediation<textarea className="input" rows={3} value={f.mitigation ?? ''} onChange={(e) => set('mitigation', e.target.value)} /></label>
        <div className="form-grid-2">
          <label className="form-row">Scheduled completion<input className="input" type="date" value={f.scheduled_completion ?? ''} onChange={(e) => set('scheduled_completion', e.target.value)} /></label>
          <label className="form-row">Responsible<input className="input" value={f.responsible ?? ''} onChange={(e) => set('responsible', e.target.value)} /></label>
        </div>
        <label className="form-row">Resources / cost<input className="input" value={f.resources ?? ''} onChange={(e) => set('resources', e.target.value)} placeholder="People, licences, budget" /></label>
        <fieldset className="form-row" style={{ border: 0, padding: 0 }}>
          <legend style={{ marginBottom: 6 }}>Milestones</legend>
          {ms.map((m, i) => (
            <div key={i} className="form-grid-2" style={{ alignItems: 'center' }}>
              <label style={{ fontWeight: 400 }}><input type="checkbox" checked={m.done} onChange={(e) => setMs(i, { done: e.target.checked })} /> <input className="input" value={m.title} onChange={(e) => setMs(i, { title: e.target.value })} placeholder="Milestone" style={{ width: 'calc(100% - 28px)' }} /></label>
              <span><input className="input" type="date" value={m.due_date ?? ''} onChange={(e) => setMs(i, { due_date: e.target.value })} /> <button type="button" className="row-btn" onClick={() => set('milestones', ms.filter((_, j) => j !== i))} aria-label="Remove milestone">×</button></span>
            </div>
          ))}
          <button type="button" className="btn btn-secondary" onClick={() => set('milestones', [...ms, { title: '', due_date: '', done: false }])}>Add milestone</button>
        </fieldset>
      </form>
    </Drawer>
  );
}

export function PoamPage({ viewer }: { viewer: Viewer }) {
  const eng = useEngagement();
  const items = useLoader<PoamItem[]>(eng.id ? () => planApi.poam(eng.id) : null, [eng.id]);
  const [editing, setEditing] = useState<PoamItem | null | 'new'>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [status, setStatus] = useState<PoamStatus | 'all'>('all');
  const writable = canWrite(viewer, 'poa-m-planning');
  const rows = (items.data ?? []).filter((p) => status === 'all' || p.status === status);
  const fromActions = async () => {
    const r = await planApi.poamFromActions(eng.id);
    if (r.ok) { setToast(`${r.data.created} POA&M item(s) created from open actions.`); items.reload(); } else setErr(failureText(r));
  };
  const exportCsv = () => {
    const head = ['requirement_id', 'weight', 'poam_eligible', 'weakness', 'mitigation', 'milestones', 'scheduled_completion', 'responsible', 'resources', 'status'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [head.join(','), ...rows.map((p) => [p.requirement_id, p.weight, p.poam_allowed ? 'yes' : 'NO', p.weakness, p.mitigation, (p.milestones ?? []).map((m) => `${m.done ? '[x]' : '[ ]'} ${m.title}${m.due_date ? ` (${m.due_date})` : ''}`).join('; '), ymd(p.scheduled_completion), p.responsible, p.resources, p.status].map(esc).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `poam-${eng.id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const prohibited = (items.data ?? []).filter((p) => !p.poam_allowed).length;
  return (
    <div className="pg" data-testid="page-plan-poam">
      <PageHeader icon="contracts" title="POA&M" lede="Plan of Action & Milestones in the DoD Assessment Methodology layout. The CMMC rule is applied, not hidden: 5- and 3-point requirements and the prohibited list cannot stay on a POA&M at certification — they are flagged here so nobody is surprised at assessment."
        actions={eng.id ? <>{rows.length > 0 && <button type="button" className="btn btn-secondary" onClick={exportCsv} data-testid="poam-export">Export CSV</button>} {writable && <><button type="button" className="btn btn-secondary" onClick={fromActions} data-testid="poam-from-actions">From open actions</button> <button type="button" className="btn btn-primary" onClick={() => setEditing('new')} data-testid="poam-add">Add item</button></>}</> : undefined} />
      <div className="toolbar">
        <EngagementSelect eng={eng} />
        <label>Status <select className="select" value={status} onChange={(e) => setStatus(e.target.value as PoamStatus | 'all')}><option value="all">All</option>{POAM_STATUSES.map((s) => <option key={s} value={s}>{POAM_STATUS_LABEL[s]}</option>)}</select></label>
      </div>
      {(eng.error || items.error || err) && <p className="note" data-tone="bad" role="alert">{eng.error ?? items.error ?? err}</p>}
      {items.data && (
        <div className="stats">
          <Stat icon="contracts" value={items.data.length} label="Items" />
          <Stat icon="situation" value={prohibited} label="Not POA&M-eligible" tone={prohibited ? 'warn' : 'good'} sub="must be implemented before certification" />
          <Stat icon="readiness" value={items.data.filter((p) => p.status === 'completed').length} label="Completed" tone="good" />
        </div>
      )}
      {items.data && items.data.length === 0 && <Empty>No POA&M item yet.{writable ? ' Create them from open actions, or add one by hand.' : ''}</Empty>}
      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="tbl" data-testid="poam-table">
            <thead><tr><th scope="col">Requirement</th><th scope="col" className="num">Weight</th><th scope="col">Eligible</th><th scope="col">Weakness</th><th scope="col">Milestones</th><th scope="col">Completion</th><th scope="col">Responsible</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.requirement_id}</strong><div className="hint" style={{ maxWidth: 320 }}>{PRACTICE.get(p.requirement_id)}</div></td>
                  <td className="num">{p.weight}</td>
                  <td><span className="pill" data-tone={p.poam_allowed ? 'good' : 'bad'}>{p.poam_allowed ? 'yes' : 'no'}</span></td>
                  <td style={{ maxWidth: 360 }}>{p.weakness}</td>
                  <td>{(p.milestones ?? []).length ? `${(p.milestones ?? []).filter((m) => m.done).length}/${(p.milestones ?? []).length}` : '—'}</td>
                  <td>{fmtDate(p.scheduled_completion)}</td>
                  <td>{p.responsible ?? '—'}</td>
                  <td><span className="pill" data-tone={p.status === 'completed' ? 'good' : p.status === 'risk_accepted' ? 'warn' : p.status === 'ongoing' ? 'info' : undefined}>{POAM_STATUS_LABEL[p.status]}</span></td>
                  <td><button type="button" className="row-btn" onClick={() => setEditing(p)} data-testid={`poam-open-${p.requirement_id}`}>{writable ? 'Edit' : 'View'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && eng.id && (writable
        ? <PoamForm eid={eng.id} initial={editing === 'new' ? null : editing} onSaved={(m) => { setEditing(null); setToast(m); items.reload(); }} onClose={() => setEditing(null)} />
        : editing !== 'new' && <Drawer title={`POA&M — ${editing.requirement_id}`} subtitle={PRACTICE.get(editing.requirement_id)} onClose={() => setEditing(null)} footer={<button type="button" className="btn btn-primary" onClick={() => setEditing(null)}>Close</button>}>
            <p><strong>Weakness.</strong> {editing.weakness}</p>
            <p><strong>Mitigation.</strong> {editing.mitigation ?? '—'}</p>
            <ul>{(editing.milestones ?? []).map((m, i) => <li key={i}>{m.done ? '☑' : '☐'} {m.title}{m.due_date ? ` — ${m.due_date}` : ''}</li>)}</ul>
          </Drawer>)}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
