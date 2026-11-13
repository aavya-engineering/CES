// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// AssessPages.tsx — Sprint 3/4 slice "Assess" (workbook groups Readiness
// Assessment and Gap Analysis). Real data from muster-api assessment runs:
// one SPRS (computeSprs), the projected score always labelled as a projection,
// the engine's status kept beside any human override. Aavya portal theme.

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import type { Viewer } from '../../nav';
import { actionsFor } from '../../lifecycle/rbac';
import { Drawer, Toast } from '../../governed';
import { Empty, PageHeader, Stat } from '../../ui';
import { TableSearch } from '../../tableSearch';
import { REQUIREMENTS } from '../../referenceData';
import { engagementLabel, useEngagement } from '../useEngagement';
import { assessApi, STATUS_LABEL, STATUS_TONE, type AssessmentResult, type AssessmentRun, type EngineJob, type GapAnalysis, type RequirementStatus } from './assessApi';
import { failureText } from '../onboard/onboardApi';
import { csvSafe } from '../../requirementCsvData';

const PRACTICE = new Map(REQUIREMENTS.map((r) => [r.control_id, r.practice]));
const FAMILY_NAME = new Map(REQUIREMENTS.map((r) => [r.family, r.family_name]));
const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const canWrite = (viewer: Viewer, group: string) => viewer.kind === 'signed-in' && actionsFor(viewer.role, 'assess', group).includes('edit');
const runLabel = (r: AssessmentRun) => `${r.label ?? (r.source === 'delivery_artifact' ? 'Delivered record' : r.source === 'engine_run' ? 'Engine run' : r.source === 'manual' ? 'Manual' : 'Readiness record')} · ${fmt(r.created_at)} · SPRS ${r.sprs_now}`;

/** Runs of the selected engagement, newest first, with the newest selected by default. */
function useRuns(eid: string) {
  const [runs, setRuns] = useState<AssessmentRun[] | null>(null);
  const [runId, setRunId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!eid) { setRuns([]); return; }
    let live = true;
    setRuns(null);
    assessApi.runs(eid).then((r) => {
      if (!live) return;
      if (r.ok) { setRuns(r.data); setRunId((cur) => (r.data.some((x) => x.id === cur) ? cur : r.data[0]?.id ?? '')); }
      else { setRuns([]); setError(failureText(r)); }
    });
    return () => { live = false; };
  }, [eid, tick]);
  return { runs, runId, setRunId, error, reload: () => setTick((t) => t + 1) };
}

function Selectors({ eng, runs, runId, setRunId }: { eng: ReturnType<typeof useEngagement>; runs: AssessmentRun[] | null; runId: string; setRunId: (id: string) => void }) {
  return (
    <div className="toolbar">
      <label>
        Engagement{' '}
        <select className="select" value={eng.id} onChange={(e) => eng.setId(e.target.value)} data-testid="assess-engagement">
          {!eng.rows?.length && <option value="">— no engagement —</option>}
          {(eng.rows ?? []).map((e) => <option key={e.id} value={e.id}>{engagementLabel(e)}</option>)}
        </select>
      </label>
      <label>
        Run{' '}
        <select className="select" value={runId} onChange={(e) => setRunId(e.target.value)} data-testid="assess-run" disabled={!runs?.length}>
          {!runs?.length && <option value="">— no assessment run yet —</option>}
          {(runs ?? []).map((r) => <option key={r.id} value={r.id}>{runLabel(r)}</option>)}
        </select>
      </label>
    </div>
  );
}

/** ENGINE: start a discovery run and poll the job until the run lands. Simulator first; live only when the engagement's Live gate allows it. */
function RunEngineButton({ eid, onDone }: { eid: string; onDone: (runId: string, job: EngineJob) => void }) {
  const [mode, setMode] = useState<'sim' | 'live'>('sim');
  const [slug, setSlug] = useState('muster-partial');
  const [job, setJob] = useState<EngineJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!job || (job.status !== 'running' && job.status !== 'queued')) return;
    const t = setInterval(async () => {
      const r = await assessApi.job(eid, job.id);
      if (r.ok) { setJob(r.data); if (r.data.status === 'done' && r.data.run_id) onDone(r.data.run_id, r.data); if (r.data.status === 'failed') setError(r.data.error ?? 'Engine run failed.'); }
    }, job.status === 'queued' ? 5000 : 1500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status]);
  const start = async () => {
    setBusy(true); setError(null);
    const r = await assessApi.startRun(eid, { mode, tenant_slug: slug });
    setBusy(false);
    if (r.ok) setJob({ id: r.data.job_id, engagement_id: eid, mode, status: r.data.status, started_at: new Date().toISOString() });
    else setError(r.status === 403 ? 'Live run refused: enable live access on the engagement and grant consent first (simulator needs neither).' : r.status === 409 ? 'This server cannot run the discovery engine (the registry commands are PowerShell; they run on the Windows runner). Import a readiness result here, or run the engine on the runner.' : failureText(r));
  };
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'nowrap' }} data-testid="engine-run">
      <select className="select" value={mode} onChange={(e) => setMode(e.target.value as 'sim' | 'live')} aria-label="Run mode" style={{ width: 150 }}><option value="sim">Simulator</option><option value="live">Live tenant</option></select>
      <input className="input" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} aria-label="Tenant slug" style={{ width: 130 }} title="Simulated customer (s1-mach / s2-eng / s3-def / muster-partial) or the live tenant slug" />
      <button type="button" className="btn btn-secondary" disabled={busy || job?.status === 'running' || job?.status === 'queued'} onClick={start} data-testid="engine-run-start">{job?.status === 'running' ? 'Engine running…' : job?.status === 'queued' ? 'Queued…' : 'Run assessment'}</button>
      {job?.status === 'running' && <span className="hint">walking the command registry{mode === 'live' ? ' against the tenant (read-only)' : ' against the simulator'}{job.claimed_by && job.claimed_by !== 'api' ? ` on runner ${job.claimed_by}` : ''}…</span>}
      {job?.status === 'queued' && <span className="hint">waiting for the Windows runner to pick it up (registry commands are PowerShell) · <button type="button" className="btn-link" onClick={async () => { const r = await assessApi.cancelJob(eid, job.id); if (r.ok) setJob(r.data); }}>cancel</button></span>}
      {job?.status === 'done' && <span className="pill" data-tone="good">run landed</span>}
      {error && <span className="note engine-error" data-tone="bad" role="alert">{error}</span>}
    </span>
  );
}

function ImportButton({ eid, onDone }: { eid: string; onDone: (run: AssessmentRun) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const parsed = JSON.parse(await file.text());
      const r = await assessApi.ingest(eid, { ...parsed, label: parsed.label ?? file.name.replace(/\.json$/i, '') });
      if (r.ok) onDone(r.data); else setError(failureText(r));
    } catch {
      setError('Not a JSON file.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <span>
      <label className="btn btn-primary" style={{ cursor: busy ? 'progress' : 'pointer' }}>
        {busy ? 'Importing…' : 'Import readiness result'}
        <input type="file" accept="application/json,.json" onChange={onFile} style={{ display: 'none' }} data-testid="assess-import" disabled={busy} />
      </label>
      {error && <span className="note" data-tone="bad" role="alert" style={{ marginLeft: 8 }}>{error}</span>}
    </span>
  );
}

// ====================================================================== readiness
export function ReadinessOverviewPage({ viewer }: { viewer: Viewer }) {
  const eng = useEngagement();
  const { runs, runId, setRunId, error, reload } = useRuns(eng.id);
  const [run, setRun] = useState<AssessmentRun | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const writable = canWrite(viewer, 'readiness-assessment');
  useEffect(() => {
    if (!eng.id || !runId) { setRun(null); return; }
    let live = true;
    assessApi.run(eng.id, runId).then((r) => live && r.ok && setRun(r.data));
    return () => { live = false; };
  }, [eng.id, runId]);
  const fam = run?.by_family ?? [];
  const maxDeduction = Math.max(1, ...fam.map((f) => f.deduction));
  return (
    <div className="pg" data-testid="page-assess-readiness">
      <PageHeader icon="readiness" title="Readiness assessment" lede="The engagement's SPRS position from the latest assessed record — one calculator, conservative (only Met counts), with the registry-fixable projection labelled as such." />
      <Selectors eng={eng} runs={runs} runId={runId} setRunId={setRunId} />
      {writable && eng.id && (
        <div className="toolbar toolbar-actions" data-testid="assess-actions">
          <RunEngineButton eid={eng.id} onDone={(id, job) => { setToast(`Engine run landed — new SPRS below.${job.evidence?.created ? ` ${job.evidence.created} capture${job.evidence.created === 1 ? '' : 's'} added to Collect Evidence as drafts.` : ''}`); reload(); setRunId(id); }} />
          <span className="grow" />
          <ImportButton eid={eng.id} onDone={(r) => { setToast(`Run imported — SPRS ${r.sprs_now}.`); reload(); }} />
        </div>
      )}
      {(eng.error || error) && <p className="note" data-tone="bad" role="alert">{eng.error ?? error}</p>}
      {runs && runs.length === 0 && eng.id && <Empty>No assessment run for this engagement yet.{writable ? ' Run the engine against the simulator (needs tenant-stacksim on the server), or import a readiness-result JSON (Muster › Readiness export, ces-tester output, or a delivered record).' : ''}</Empty>}
      {run && (
        <>
          <div className="stats stats-6">
            <Stat icon="sprs" value={run.sprs_now} label="SPRS score (now)" tone={run.sprs_now >= 88 ? 'good' : run.sprs_now >= 0 ? 'warn' : 'bad'} sub="of 110 · only Met counts" testId="sprs-now" />
            <Stat icon="plan" value={run.sprs_after ?? '—'} label="Projected after registry fixes" tone="muster" sub="PROJECTION — not a score" testId="sprs-after" />
            <Stat icon="requirements" value={run.met_count} label="Met" tone="good" />
            <Stat icon="requirements" value={run.partial_count} label="Partial" tone="warn" />
            <Stat icon="requirements" value={run.not_met_count} label="Not met" tone="bad" />
            <Stat icon="requirements" value={run.unknown_count} label="Unknown / not assessed" sub="empty read ≠ evidence" />
          </div>
          <section className="card card-pad">
            <h2 className="card-title">By control family</h2>
              <div className="table-wrap">
              <TableSearch target='[data-testid="family-table"]' />
              <table className="tbl" data-testid="family-table">
                <thead><tr><th scope="col">Family</th><th scope="col" className="num">Met</th><th scope="col" className="num">Partial</th><th scope="col" className="num">Not met</th><th scope="col" className="num">Unknown</th><th scope="col" className="num">Deduction</th><th scope="col" style={{ width: '28%' }}>Weight at risk</th></tr></thead>
                <tbody>
                  {fam.map((f) => (
                    <tr key={f.family}>
                      <td><strong>{f.family}</strong> <span className="hint">{f.name}</span></td>
                      <td className="num">{f.met}</td><td className="num">{f.partial}</td><td className="num">{f.not_met}</td><td className="num">{f.unknown}</td>
                      <td className="num">−{f.deduction}</td>
                      <td><div className="bar"><div className="bar-fill" data-tone={f.deduction === 0 ? 'good' : f.not_met ? 'bad' : 'warn'} style={{ width: `${(f.deduction / maxDeduction) * 100}%` }} /></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card card-pad">
            <h2 className="card-title">Provenance</h2>
            <p className="hint">Source {run.source.replace('_', ' ')} · schema {run.schema_version ?? '—'} · engine {run.engine ? `${run.engine.name} ${run.engine.version}` : '—'} · generated {fmt(run.generated_at)} · imported {fmt(run.created_at)}{run.created_by ? ` by ${run.created_by}` : ''}</p>
          </section>
        </>
      )}
      {runs && runs.length > 1 && (
        <section className="card card-pad">
          <h2 className="card-title">Run history</h2>
          <div className="table-wrap">
            <table className="tbl" data-testid="run-history">
              <thead><tr><th scope="col">When</th><th scope="col">Source</th><th scope="col" className="num">SPRS</th><th scope="col" className="num">Projected</th><th scope="col" className="num">Met</th><th scope="col" className="num">Not met</th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} aria-selected={r.id === runId} onClick={() => setRunId(r.id)} style={{ cursor: 'pointer' }}>
                    <td>{fmt(r.created_at)}{r.label && <div className="hint">{r.label}</div>}</td><td>{r.source.replace('_', ' ')}</td>
                    <td className="num">{r.sprs_now}</td><td className="num">{r.sprs_after ?? '—'}</td><td className="num">{r.met_count}</td><td className="num">{r.not_met_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

// ====================================================================== gap analysis
function OverrideDrawer({ eid, runId, row, viewer, onSaved, onClose }: { eid: string; runId: string; row: AssessmentResult; viewer: Viewer; onSaved: (m: string) => void; onClose: () => void }) {
  const [status, setStatus] = useState<RequirementStatus>(row.status);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState(row.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await assessApi.override(eid, runId, row.requirement_id, { status, reason, notes: notes || null });
    setBusy(false);
    if (r.ok) onSaved(`${row.requirement_id} set to ${STATUS_LABEL[status]} — SPRS now ${r.data.run.sprs_now}.`); else setError(failureText(r));
  };
  return (
    <Drawer title={`${row.requirement_id} — ${STATUS_LABEL[row.status]}`} subtitle={PRACTICE.get(row.requirement_id)} onClose={onClose} testId="gap-drawer" wide
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Close</button><button type="submit" form="override-form" className="btn btn-primary" disabled={busy || status === row.status} data-testid="override-submit">{busy ? 'Saving…' : 'Record override'}</button></>}>
      <div className="stats">
        <Stat icon="sprs" value={row.weight} label="SPRS weight" />
        <Stat icon="discovery" value={STATUS_LABEL[row.engine_status]} label="Engine status" tone={STATUS_TONE[row.engine_status]} sub={row.confidence ? `confidence ${row.confidence}` : undefined} />
        <Stat icon="stamper" value={row.fixable === 'registry' ? 'Registry' : row.fixable === 'manual' ? 'Manual' : '—'} label="Fix path" sub={row.fix_entry_ids.length ? `${row.fix_entry_ids.length} set command(s)` : undefined} />
      </div>
      {row.objective_ids.length > 0 && <p className="hint">Objectives observed: {row.objective_ids.join(', ')}</p>}
      {row.ran_entry_ids.length > 0 && <p className="hint">Registry entries run: {row.ran_entry_ids.join(', ')}</p>}
      {row.fix_entry_ids.length > 0 && <p className="hint">Fix entries: {row.fix_entry_ids.join(', ')}</p>}
      {row.override_by && <p className="note" data-tone="warn">Overridden by {row.override_by} on {fmt(row.override_at)}: {row.override_reason}</p>}
      <form id="override-form" onSubmit={submit}>
        {error && <p className="note" data-tone="bad" role="alert">{error}</p>}
        <label className="form-row">
          Status (human determination)
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value as RequirementStatus)} data-testid="override-status">
            {(['met', 'partial', 'not_met', 'unknown'] as const).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
          <span className="hint">The engine's status stays on record. Overrides are visible to the assessor and written to the audit trail as {viewer.kind === 'signed-in' ? viewer.role : 'you'}.</span>
        </label>
        <label className="form-row">
          Reason * <textarea maxLength={2000} className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={10} placeholder="What was verified, where, and when" data-testid="override-reason" />
        </label>
        <label className="form-row">
          Notes <textarea maxLength={2000} className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </form>
    </Drawer>
  );
}

export function GapAnalysisPage({ viewer }: { viewer: Viewer }) {
  const eng = useEngagement();
  const { runs, runId, setRunId, error } = useRuns(eng.id);
  const [data, setData] = useState<GapAnalysis | null>(null);
  const [tick, setTick] = useState(0);
  const [family, setFamily] = useState('all');
  const [status, setStatus] = useState<RequirementStatus | 'all'>('all');
  const [fixable, setFixable] = useState<'all' | 'registry' | 'manual'>('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<AssessmentResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const writable = canWrite(viewer, 'gap-analysis');
  useEffect(() => {
    if (!eng.id || !runId) { setData(null); return; }
    let live = true;
    assessApi.gaps(eng.id, runId).then((r) => live && r.ok && setData(r.data));
    return () => { live = false; };
  }, [eng.id, runId, tick]);
  const shown = useMemo(() => (data?.gaps ?? []).filter((g) =>
    (family === 'all' || g.family === family) && (status === 'all' || g.status === status) && (fixable === 'all' || g.fixable === fixable) &&
    (!q || `${g.requirement_id} ${PRACTICE.get(g.requirement_id) ?? ''}`.toLowerCase().includes(q.toLowerCase())),
  ), [data, family, status, fixable, q]);
  const families = useMemo(() => [...new Set((data?.gaps ?? []).map((g) => g.family))].sort(), [data]);
  const exportCsv = () => {
    const head = ['requirement_id', 'family', 'weight', 'status', 'engine_status', 'confidence', 'fixable', 'fix_entry_ids', 'override_by', 'override_reason', 'practice'];
    const esc = (v: unknown) => `"${csvSafe(String(v ?? '')).replace(/"/g, '""')}"`; // csvSafe: no formula injection
    const csv = [head.join(','), ...shown.map((g) => [g.requirement_id, g.family, g.weight, g.status, g.engine_status, g.confidence, g.fixable, g.fix_entry_ids.join(' '), g.override_by, g.override_reason, PRACTICE.get(g.requirement_id)].map(esc).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `gap-analysis-${runId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="pg" data-testid="page-assess-gaps">
      <PageHeader icon="discovery" title="Gap analysis" lede="Every requirement the assessed record did not find Met, heaviest first — with the engine's determination, the fix path (registry set-command or manual), and the human override trail." actions={data && shown.length > 0 ? <button type="button" className="btn btn-secondary" onClick={exportCsv} data-testid="gaps-export">Export CSV</button> : undefined} />
      <Selectors eng={eng} runs={runs} runId={runId} setRunId={setRunId} />
      {(eng.error || error) && <p className="note" data-tone="bad" role="alert">{eng.error ?? error}</p>}
      {runs && runs.length === 0 && eng.id && <Empty>No assessment run yet — import one under Assess › Readiness Assessment.</Empty>}
      {data && (
        <>
          <div className="stats">
            <Stat icon="discovery" value={data.gap_count} label="Gaps" tone={data.gap_count ? 'bad' : 'good'} sub={`−${data.deduction_total} SPRS points at risk`} testId="gap-count" />
            <Stat icon="stamper" value={data.registry_fixable} label="Registry-fixable" tone="muster" sub={`+${data.registry_fixable_weight} if applied (projection)`} />
            <Stat icon="sprs" value={data.sprs_now} label="SPRS now" />
            <Stat icon="plan" value={data.sprs_after ?? '—'} label="Projected" sub="PROJECTION — not a score" />
          </div>
          <div className="toolbar">
            <label className="grow"><span className="sr-only">Search</span><input className="input" placeholder="Search requirement or practice" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            <label>Family <select className="select" value={family} onChange={(e) => setFamily(e.target.value)}><option value="all">All</option>{families.map((f) => <option key={f} value={f}>{f} · {FAMILY_NAME.get(f) ?? f}</option>)}</select></label>
            <label>Status <select className="select" value={status} onChange={(e) => setStatus(e.target.value as RequirementStatus | 'all')}><option value="all">All</option><option value="not_met">Not met</option><option value="partial">Partial</option><option value="unknown">Unknown</option></select></label>
            <label>Fix <select className="select" value={fixable} onChange={(e) => setFixable(e.target.value as 'all' | 'registry' | 'manual')}><option value="all">All</option><option value="registry">Registry</option><option value="manual">Manual</option></select></label>
          </div>
          {shown.length === 0 && <Empty>{data.gap_count === 0 ? 'No gap — every requirement is Met.' : 'Nothing matches the filters.'}</Empty>}
          {shown.length > 0 && (
            <div className="table-wrap">
              <table className="tbl" data-testid="gap-table">
                <thead><tr><th scope="col">Requirement</th><th scope="col">Family</th><th scope="col" className="num">Weight</th><th scope="col">Status</th><th scope="col">Engine</th><th scope="col">Fix</th><th scope="col">Override</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
                <tbody>
                  {shown.map((g) => (
                    <tr key={g.id}>
                      <td><strong>{g.requirement_id}</strong><div className="hint" style={{ maxWidth: 420 }}>{PRACTICE.get(g.requirement_id)}</div></td>
                      <td>{g.family}</td>
                      <td className="num">{g.weight}</td>
                      <td><span className="pill" data-tone={STATUS_TONE[g.status]}>{STATUS_LABEL[g.status]}</span></td>
                      <td>{g.engine_status !== g.status ? <span className="pill" data-tone={STATUS_TONE[g.engine_status]}>{STATUS_LABEL[g.engine_status]}</span> : <span className="hint">same</span>}</td>
                      <td>{g.fixable === 'registry' ? <span className="pill" data-tone="info">registry · {g.fix_entry_ids.length}</span> : <span className="pill">manual</span>}</td>
                      <td>{g.override_by ? <span className="hint">{g.override_by}</span> : '—'}</td>
                      <td><button type="button" className="row-btn" onClick={() => setOpen(g)} data-testid={`gap-open-${g.requirement_id}`}>{writable ? 'Review' : 'View'}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {open && (writable
        ? <OverrideDrawer eid={eng.id} runId={runId} row={open} viewer={viewer} onSaved={(m) => { setOpen(null); setToast(m); setTick((t) => t + 1); }} onClose={() => setOpen(null)} />
        : <Drawer title={`${open.requirement_id} — ${STATUS_LABEL[open.status]}`} subtitle={PRACTICE.get(open.requirement_id)} onClose={() => setOpen(null)} footer={<button type="button" className="btn btn-primary" onClick={() => setOpen(null)}>Close</button>}>
            <p className="hint">Weight {open.weight} · engine {STATUS_LABEL[open.engine_status]} · fix {open.fixable ?? '—'}{open.fix_entry_ids.length ? ` (${open.fix_entry_ids.join(', ')})` : ''}</p>
            {open.override_by && <p className="note" data-tone="warn">Overridden by {open.override_by} on {fmt(open.override_at)}: {open.override_reason}</p>}
          </Drawer>)}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
