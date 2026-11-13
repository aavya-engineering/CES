// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// PreparePages.tsx — Sprint 6 slice "Prepare for Assessment" (workbook groups
// Assessment Preparation Overview, Assessment Documentation, Evidence
// Packages, Assessment Review, Assessor Workspace, Reports & Exports). Real
// data from muster-api/prepare: the readiness checklist, SSP statements, frozen
// evidence packages with SoD sign-off, the C3PAO's read-only workspace and
// question log, sign-offs and report exports. Aavya portal theme.

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { RouteId, Viewer } from '../../nav';
import { actionsFor } from '../../lifecycle/rbac';
import { ConfirmDialog, Drawer, Toast } from '../../governed';
import { Empty, PageHeader, Stat } from '../../ui';
import { REQUIREMENTS } from '../../referenceData';
import { api, getApiBase } from '@/shared/api/musterApi';
import { getMusterToken } from '@/shared/api/musterToken';
import { engagementLabel, useEngagement } from '../useEngagement';
import { failureText } from '../onboard/onboardApi';

const FAMILY = new Map(REQUIREMENTS.map((r) => [r.family, r.family_name]));
const REQ_IDS = REQUIREMENTS.map((r) => r.control_id);
const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const isSignedIn = (v: Viewer): v is { kind: 'signed-in'; role: string } => v.kind === 'signed-in';
const role = (v: Viewer) => (isSignedIn(v) ? v.role : '');
const canEdit = (v: Viewer, group: string) => isSignedIn(v) && actionsFor(v.role, 'prepare', group).includes('edit');
const canSign = (v: Viewer) => ['senior_approver', 'compliance_manager', 'bhd_operator'].includes(role(v));
const isAssessorSide = (v: Viewer) => ['assessor_read_only', 'evidence_reviewer', 'senior_approver', 'bhd_operator'].includes(role(v));

export const IMPL_STATUSES = ['implemented', 'partially_implemented', 'planned', 'alternative', 'not_applicable'] as const;
export type ImplStatus = (typeof IMPL_STATUSES)[number];
const IMPL_LABEL: Record<ImplStatus, string> = { implemented: 'Implemented', partially_implemented: 'Partially implemented', planned: 'Planned', alternative: 'Alternative implementation', not_applicable: 'Not applicable' };
const IMPL_TONE: Record<ImplStatus, 'good' | 'warn' | 'bad' | 'info' | undefined> = { implemented: 'good', partially_implemented: 'warn', planned: 'bad', alternative: 'info', not_applicable: undefined };

export interface ChecklistItem { id: string; label: string; ok: boolean; count: number | string | null; route: RouteId }
export interface Readiness { items: ChecklistItem[]; ready: boolean; score: number; outstanding: { missing_statements: string[]; open_gaps: { requirement_id: string; status: string; weight: number }[]; ineligible_poam: string[]; overdue_actions: { id: string; title: string; due_date: string }[]; missing_coverage: { requirement_id: string; missing: string[] }[]; pending_review: number; critical_findings: { id: string; title: string; severity: string }[] } }
export interface Statement { id: string; status: ImplStatus; statement: string; responsible_role: string | null; systems: string[]; evidence_item_ids: string[]; source: string; version: number; approved_by: string | null; approved_at: string | null; updated_by: string | null; updated_at: string }
export interface StatementRow { requirement_id: string; family: string; family_name: string; practice: string; cmmc_level: number; run_status: string | null; weight: number | null; validated_evidence: { id: string; title: string; archetype_code: string | null }[]; statement: Statement | null }
export interface Package { id: string; name: string; scope_type: string; scope_values: string[]; item_ids: string[]; item_count?: number; validation: { passed: boolean; missing_required: { requirement_id: string; missing: string[]; pending: number }[]; unvalidated: { id: string; title: string; status: string }[]; expired: number; cui_items: number; drifted_items?: string[]; checked_at?: string } | null; status: 'draft' | 'validated' | 'signed_off' | 'superseded'; version: number; supersedes_id: string | null; run_id: string | null; built_by: string | null; built_at: string; signed_off_by: string | null; signed_off_at: string | null; sign_off_notes: string | null; manifest?: { items: { id: string; title: string; requirement_ids: string[]; archetype_code: string | null; sha256: string | null; status: string; strength: string | null; file_name: string | null; classification: string }[] } }
export interface AssessorOverview { packages: { id: string; name: string; version: number; signed_off_by: string; signed_off_at: string; items: number }[]; sprs: { score: number; assessed_at: string } | null; boundary: { version: number; confirmed_by: string | null; confirmed_at: string | null; narrative: string | null } | null; requirements: { requirement_id: string; family: string; level: number; practice: string; assessed: string | null; weight: number | null; implementation_status: ImplStatus | null; statement: string | null; statement_approved: boolean; evidence: { id: string; title: string; archetype_code: string | null; form: string | null; sha256: string | null; reviewed_by: string | null; collected_at: string; in_signed_package: boolean }[]; poam: { status: string; scheduled_completion: string | null; eligible: boolean } | null }[] }
export interface AssessorRequest { id: string; package_id: string | null; requirement_id: string | null; question: string; requested_by: string; status: 'open' | 'answered' | 'closed'; answer: string | null; answered_by: string | null; answered_at: string | null; evidence_item_ids: string[]; created_at: string }
export interface SignOff { id: string; kind: string; decision: string; notes: string; package_id: string | null; signed_by: string; signed_role: string | null; signed_at: string }

const base = (eid: string) => `/engagements/${eid}/prepare`;
export const prepareApi = {
  readiness: (eid: string) => api.get<Readiness>(`${base(eid)}/readiness`),
  statements: (eid: string) => api.get<StatementRow[]>(`${base(eid)}/ssp/statements`),
  saveStatement: (eid: string, rid: string, body: Partial<Statement>) => api.put<Statement>(`${base(eid)}/ssp/statements/${rid}`, body),
  generateDrafts: (eid: string) => api.post<{ created: number }>(`${base(eid)}/ssp/statements/generate-drafts`),
  approveStatement: (eid: string, rid: string) => api.post<Statement>(`${base(eid)}/ssp/statements/${rid}/approve`),
  packages: (eid: string) => api.get<Package[]>(`${base(eid)}/packages`),
  pkg: (eid: string, id: string) => api.get<Package>(`${base(eid)}/packages/${id}`),
  build: (eid: string, body: { name: string; scope_type: string; scope_values: string[]; include_unvalidated?: boolean; supersedes_id?: string | null }) => api.post<Package>(`${base(eid)}/packages`, body),
  validatePkg: (eid: string, id: string) => api.post<Package>(`${base(eid)}/packages/${id}/validate`),
  signPkg: (eid: string, id: string, notes: string) => api.post<Package>(`${base(eid)}/packages/${id}/sign-off`, { notes }),
  assessor: (eid: string) => api.get<AssessorOverview>(`${base(eid)}/assessor/overview`),
  requests: (eid: string) => api.get<AssessorRequest[]>(`${base(eid)}/assessor/requests`),
  ask: (eid: string, body: { question: string; requirement_id?: string | null }) => api.post<AssessorRequest>(`${base(eid)}/assessor/requests`, body),
  answer: (eid: string, id: string, answer: string) => api.post<AssessorRequest>(`${base(eid)}/assessor/requests/${id}/answer`, { answer, evidence_item_ids: [] }),
  closeRequest: (eid: string, id: string) => api.post<AssessorRequest>(`${base(eid)}/assessor/requests/${id}/close`),
  signOffs: (eid: string) => api.get<SignOff[]>(`${base(eid)}/sign-offs`),
  signOff: (eid: string, body: { kind: string; decision: 'approved' | 'rejected'; notes: string }) => api.post<SignOff>(`${base(eid)}/sign-offs`, body),
  fileUrl: (eid: string, path: string) => `${getApiBase()}${base(eid)}/${path}`,
};

/** Download an authenticated export (md / csv / json) as a file. */
async function downloadExport(url: string, filename: string, setError: (m: string) => void) {
  const jwt = getMusterToken();
  const res = await fetch(url, { headers: jwt ? { Authorization: `Bearer ${jwt}` } : {} });
  if (!res.ok) { setError(`Export failed (${res.status}).`); return; }
  const blob = await res.blob();
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}

function EngagementSelect({ eng }: { eng: ReturnType<typeof useEngagement> }) {
  return (
    <label>Engagement{' '}
      <select className="select" value={eng.id} onChange={(e) => eng.setId(e.target.value)} data-testid="prepare-engagement">
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

// ====================================================================== overview (readiness checklist + review sign-offs)
export function PrepareOverviewPage({ viewer, go }: { viewer: Viewer; go: (r: RouteId) => void }) {
  const eng = useEngagement();
  const rd = useLoader<Readiness>(eng.id ? () => prepareApi.readiness(eng.id) : null, [eng.id]);
  const so = useLoader<SignOff[]>(eng.id ? () => prepareApi.signOffs(eng.id) : null, [eng.id]);
  const [kind, setKind] = useState('internal_review');
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const d = rd.data;
  const sign = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    const r = await prepareApi.signOff(eng.id, { kind, decision, notes });
    if (r.ok) { setToast(`${kind.replace('_', ' ')} ${decision}.`); setNotes(''); so.reload(); rd.reload(); } else setErr(failureText(r));
  };
  return (
    <div className="pg" data-testid="page-prepare-overview">
      <PageHeader icon="contracts" title="Assessment readiness" lede="Fifteen things a C3PAO will look for, computed from the engagement's own records — each one opens the screen that fixes it. The final sign-off is only possible when every item is green." actions={<EngagementSelect eng={eng} />} />
      {(eng.error || rd.error || err) && <p className="note" data-tone="bad" role="alert">{eng.error ?? rd.error ?? err}</p>}
      {d && (
        <>
          <div className="stats">
            <Stat icon="readiness" value={`${d.score}%`} label="Readiness" tone={d.ready ? 'good' : d.score >= 70 ? 'warn' : 'bad'} sub={d.ready ? 'Ready for the assessor' : `${d.items.filter((i) => !i.ok).length} item(s) outstanding`} testId="readiness-score" />
            <Stat icon="requirements" value={d.outstanding.missing_statements.length} label="Statements missing" tone={d.outstanding.missing_statements.length ? 'warn' : 'good'} />
            <Stat icon="situation" value={d.outstanding.open_gaps.length} label="Open gaps" tone={d.outstanding.open_gaps.length ? 'bad' : 'good'} sub={d.outstanding.ineligible_poam.length ? `${d.outstanding.ineligible_poam.length} not POA&M-eligible` : undefined} />
            <Stat icon="catalog" value={d.outstanding.missing_coverage.length} label="Requirements without evidence" tone={d.outstanding.missing_coverage.length ? 'bad' : 'good'} sub={`${d.outstanding.pending_review} awaiting review`} />
            <Stat icon="bell" value={d.outstanding.critical_findings.length} label="Critical / high findings" tone={d.outstanding.critical_findings.length ? 'bad' : 'good'} />
          </div>
          <section className="card card-pad">
            <h2 className="card-title">Readiness checklist</h2>
            <ul className="checklist" data-testid="readiness-checklist">
              {d.items.map((i) => <li key={i.id}><span className="pill" data-tone={i.ok ? 'good' : 'bad'}>{i.ok ? 'OK' : 'TO DO'}</span> <span>{i.label}{i.count !== null && i.count !== undefined ? <span className="hint"> · {String(i.count)}</span> : null} {!i.ok && <button type="button" className="row-btn" onClick={() => go(i.route)}>Open</button>}</span></li>)}
            </ul>
          </section>
        </>
      )}
      <div className="form-grid-2">
        <section className="card card-pad">
          <h2 className="card-title">Sign-offs</h2>
          {so.data && so.data.length === 0 && <Empty>No sign-off recorded yet.</Empty>}
          {so.data && so.data.length > 0 && <table className="tbl" data-testid="signoffs"><tbody>{so.data.map((s) => <tr key={s.id}><td><strong>{s.kind.replace('_', ' ')}</strong><div className="hint">{s.notes}</div></td><td><span className="pill" data-tone={s.decision === 'approved' ? 'good' : 'bad'}>{s.decision}</span></td><td className="hint">{s.signed_by} ({s.signed_role})<br />{fmt(s.signed_at)}</td></tr>)}</tbody></table>}
        </section>
        {canSign(viewer) && eng.id && (
          <form className="card card-pad" onSubmit={sign} data-testid="signoff-form">
            <h2 className="card-title">Record a sign-off</h2>
            <label className="form-row">Review step
              <select className="select" value={kind} onChange={(e) => setKind(e.target.value)}><option value="internal_review">Internal assessment review</option><option value="evidence_completeness">Evidence completeness review</option><option value="gap_closure">Gap closure verification</option><option value="final">Final sign-off (needs all items green)</option></select>
            </label>
            <label className="form-row">Decision<select className="select" value={decision} onChange={(e) => setDecision(e.target.value as 'approved' | 'rejected')}><option value="approved">Approved</option><option value="rejected">Rejected — rework</option></select></label>
            <label className="form-row">Notes *<textarea maxLength={2000} className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} required minLength={5} data-testid="signoff-notes" /></label>
            <button type="submit" className="btn btn-primary" disabled={notes.length < 5} data-testid="signoff-submit">Sign as {role(viewer)}</button>
          </form>
        )}
      </div>
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

// ====================================================================== SSP statements
function StatementDrawer({ eid, row, viewer, onSaved, onClose }: { eid: string; row: StatementRow; viewer: Viewer; onSaved: (m: string) => void; onClose: () => void }) {
  const s = row.statement;
  const [status, setStatus] = useState<ImplStatus>(s?.status ?? (row.run_status === 'met' ? 'implemented' : row.run_status === 'partial' ? 'partially_implemented' : 'planned'));
  const [text, setText] = useState(s?.statement ?? '');
  const [roleName, setRoleName] = useState(s?.responsible_role ?? '');
  const [systems, setSystems] = useState((s?.systems ?? []).join(', '));
  const [evidence, setEvidence] = useState<string[]>(s?.evidence_item_ids ?? row.validated_evidence.map((e) => e.id));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editor = canEdit(viewer, 'assessment-documentation');
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('save');
    const r = await prepareApi.saveStatement(eid, row.requirement_id, { status, statement: text, responsible_role: roleName || null, systems: systems.split(',').map((x) => x.trim()).filter(Boolean), evidence_item_ids: evidence });
    setBusy(null);
    if (r.ok) onSaved(`${row.requirement_id} saved (v${r.data.version}).`); else setError(failureText(r));
  };
  const approve = async () => { setBusy('approve'); const r = await prepareApi.approveStatement(eid, row.requirement_id); setBusy(null); if (r.ok) onSaved(`${row.requirement_id} approved.`); else setError(failureText(r)); };
  const isDraft = text.includes('[DRAFT');
  return (
    <Drawer title={`${row.requirement_id} — ${IMPL_LABEL[status]}`} subtitle={row.practice} onClose={onClose} testId="statement-drawer" wide
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>{editor && <><button type="submit" form="stmt-form" className="btn btn-primary" disabled={!!busy} data-testid="statement-save">{busy === 'save' ? 'Saving…' : 'Save'}</button> {s && !s.approved_by && <button type="button" className="btn btn-secondary" disabled={!!busy || isDraft || !s.statement.trim()} title={isDraft ? 'Remove the [DRAFT] marker first' : undefined} onClick={approve} data-testid="statement-approve">Approve</button>}</>}</>}>
      {error && <p className="note" data-tone="bad" role="alert">{error}</p>}
      <div className="stats">
        <Stat icon="readiness" value={row.run_status ? row.run_status.replace('_', ' ') : '—'} label="Latest run" tone={row.run_status === 'met' ? 'good' : row.run_status === 'partial' ? 'warn' : row.run_status ? 'bad' : undefined} sub={row.weight !== null ? `weight ${row.weight}` : undefined} />
        <Stat icon="catalog" value={row.validated_evidence.length} label="Validated evidence" />
        <Stat icon="roles" value={s?.approved_by ? 'Approved' : s ? `v${s.version} · ${s.source === 'generated_draft' ? 'draft' : 'unapproved'}` : 'None'} label="Statement" tone={s?.approved_by ? 'good' : s ? 'warn' : 'bad'} sub={s?.approved_by ? `${s.approved_by} · ${fmt(s.approved_at)}` : undefined} />
      </div>
      {s?.source === 'generated_draft' && <p className="note" data-tone="warn">Generated from the run and evidence. Describe how, where and by whom this is implemented in your environment, remove the [DRAFT] marker, save, then approve.</p>}
      <form id="stmt-form" onSubmit={save}>
        <div className="form-grid-2">
          <label className="form-row">Implementation status<select className="select" value={status} onChange={(e) => setStatus(e.target.value as ImplStatus)} disabled={!editor} data-testid="statement-status">{IMPL_STATUSES.map((x) => <option key={x} value={x}>{IMPL_LABEL[x]}</option>)}</select></label>
          <label className="form-row">Responsible role<input className="input" maxLength={200} value={roleName} onChange={(e) => setRoleName(e.target.value)} disabled={!editor} placeholder="e.g. CIS administrator" /></label>
        </div>
        <label className="form-row">Implementation statement<textarea maxLength={2000} className="input" rows={8} value={text} onChange={(e) => setText(e.target.value)} disabled={!editor} data-testid="statement-text" /></label>
        <label className="form-row">Systems (comma-separated)<input className="input" value={systems} onChange={(e) => setSystems(e.target.value)} disabled={!editor} placeholder="Entra ID, Intune, Purview" /></label>
        <fieldset className="form-row" style={{ border: 0, padding: 0 }}><legend style={{ marginBottom: 6 }}>Evidence cited</legend>
          {row.validated_evidence.length === 0 && <span className="hint">No validated evidence for this requirement yet.</span>}
          {row.validated_evidence.map((e) => <label key={e.id} style={{ fontWeight: 400, display: 'block' }}><input type="checkbox" checked={evidence.includes(e.id)} disabled={!editor} onChange={(ev) => setEvidence(ev.target.checked ? [...evidence, e.id] : evidence.filter((x) => x !== e.id))} /> {e.title} <span className="hint">{e.archetype_code}</span></label>)}
        </fieldset>
      </form>
    </Drawer>
  );
}

export function SspPage({ viewer }: { viewer: Viewer }) {
  const eng = useEngagement();
  const rows = useLoader<StatementRow[]>(eng.id ? () => prepareApi.statements(eng.id) : null, [eng.id]);
  const [family, setFamily] = useState('all');
  const [filter, setFilter] = useState<'all' | 'missing' | 'draft' | 'unapproved' | 'approved'>('all');
  const [open, setOpen] = useState<StatementRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const editor = canEdit(viewer, 'assessment-documentation');
  const shown = useMemo(() => (rows.data ?? []).filter((r) => (family === 'all' || r.family === family) && (filter === 'all' || (filter === 'missing' ? !r.statement?.statement.trim() : filter === 'draft' ? r.statement?.source === 'generated_draft' : filter === 'unapproved' ? !!r.statement?.statement.trim() && !r.statement.approved_by : !!r.statement?.approved_by))), [rows.data, family, filter]);
  const counts = useMemo(() => { const all = rows.data ?? []; return { total: all.length, written: all.filter((r) => r.statement?.statement.trim()).length, approved: all.filter((r) => r.statement?.approved_by).length, drafts: all.filter((r) => r.statement?.source === 'generated_draft').length }; }, [rows.data]);
  const generate = async () => { const r = await prepareApi.generateDrafts(eng.id); if (r.ok) { setToast(`${r.data.created} draft statement(s) generated — edit and approve each one.`); rows.reload(); } else setErr(failureText(r)); };
  return (
    <div className="pg" data-testid="page-prepare-ssp">
      <PageHeader icon="contracts" title="System Security Plan" lede="One implementation statement per requirement — how, where and by whom it is met, citing validated evidence. Drafts can be generated from the latest run and evidence, but a person writes the environment-specific text and approves it; the SSP exports with the boundary, assets, SPRS position and POA&M."
        actions={<>{editor && eng.id && <button type="button" className="btn btn-secondary" onClick={generate} data-testid="ssp-generate">Generate drafts for missing</button>} {eng.id && <><button type="button" className="btn btn-secondary" onClick={() => downloadExport(prepareApi.fileUrl(eng.id, 'ssp/export?format=md'), 'ssp.md', setErr)} data-testid="ssp-export-md">Export SSP (Markdown)</button> <button type="button" className="btn btn-primary" onClick={() => downloadExport(prepareApi.fileUrl(eng.id, 'ssp/export'), 'ssp.json', setErr)}>Export SSP (JSON)</button></>} <EngagementSelect eng={eng} /></>} />
      {(eng.error || rows.error || err) && <p className="note" data-tone="bad" role="alert">{eng.error ?? rows.error ?? err}</p>}
      {rows.data && (
        <div className="stats">
          <Stat icon="requirements" value={`${counts.written}/${counts.total}`} label="Statements written" tone={counts.written === counts.total ? 'good' : 'warn'} />
          <Stat icon="roles" value={counts.approved} label="Approved" tone={counts.approved === counts.total ? 'good' : undefined} />
          <Stat icon="situation" value={counts.drafts} label="Generated drafts to edit" tone={counts.drafts ? 'warn' : 'good'} />
        </div>
      )}
      <div className="toolbar">
        <label>Family <select className="select" value={family} onChange={(e) => setFamily(e.target.value)}><option value="all">All</option>{[...FAMILY.entries()].map(([f, n]) => <option key={f} value={f}>{f} · {n}</option>)}</select></label>
        <label>Show <select className="select" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}><option value="all">All</option><option value="missing">Missing statement</option><option value="draft">Generated drafts</option><option value="unapproved">Written, not approved</option><option value="approved">Approved</option></select></label>
      </div>
      {rows.data && shown.length === 0 && <Empty>Nothing in this filter.</Empty>}
      {shown.length > 0 && (
        <div className="table-wrap"><table className="tbl" data-testid="ssp-table"><thead><tr><th scope="col">Requirement</th><th scope="col">Run</th><th scope="col">Implementation</th><th scope="col">Statement</th><th scope="col">Evidence</th><th scope="col">Approval</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
          <tbody>{shown.map((r) => <tr key={r.requirement_id}><td><strong>{r.requirement_id}</strong><div className="hint" style={{ maxWidth: 360 }}>{r.practice}</div></td><td>{r.run_status ? <span className="pill" data-tone={r.run_status === 'met' ? 'good' : r.run_status === 'partial' ? 'warn' : 'bad'}>{r.run_status.replace('_', ' ')}</span> : '—'}</td><td>{r.statement ? <span className="pill" data-tone={IMPL_TONE[r.statement.status]}>{IMPL_LABEL[r.statement.status]}</span> : '—'}</td><td className="hint" style={{ maxWidth: 320 }}>{r.statement?.statement ? `${r.statement.statement.slice(0, 120)}${r.statement.statement.length > 120 ? '…' : ''}` : <em>none</em>}</td><td className="num">{r.validated_evidence.length}</td><td>{r.statement?.approved_by ? <span className="pill" data-tone="good">approved</span> : r.statement?.source === 'generated_draft' ? <span className="pill" data-tone="warn">draft</span> : r.statement ? <span className="pill">v{r.statement.version}</span> : '—'}</td><td><button type="button" className="row-btn" onClick={() => setOpen(r)} data-testid={`ssp-open-${r.requirement_id}`}>{editor ? 'Edit' : 'View'}</button></td></tr>)}</tbody></table></div>
      )}
      {open && eng.id && <StatementDrawer eid={eng.id} row={open} viewer={viewer} onSaved={(m) => { setOpen(null); setToast(m); rows.reload(); }} onClose={() => setOpen(null)} />}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

// ====================================================================== evidence packages
export function PackagesPage({ viewer }: { viewer: Viewer }) {
  const eng = useEngagement();
  const list = useLoader<Package[]>(eng.id ? () => prepareApi.packages(eng.id) : null, [eng.id]);
  const [name, setName] = useState('');
  const [scopeType, setScopeType] = useState('all');
  const [scopeValues, setScopeValues] = useState('');
  const [includeUnvalidated, setIncludeUnvalidated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Package | null>(null);
  const [signing, setSigning] = useState<Package | null>(null);
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const editor = canEdit(viewer, 'evidence-packages');
  const me = role(viewer);
  const mySub = viewer.kind === 'signed-in' ? viewer.sub ?? '' : ''; // built_by holds the user id, not the role
  const build = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    const r = await prepareApi.build(eng.id, { name, scope_type: scopeType, scope_values: scopeValues.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean), include_unvalidated: includeUnvalidated });
    setBusy(false);
    if (r.ok) { setToast(`${r.data.name}: ${r.data.item_count} item(s), ${r.data.status === 'validated' ? 'validated' : 'draft — see validation'}.`); setName(''); list.reload(); } else setErr(failureText(r));
  };
  const act = async (p: Package, what: 'validate' | 'rebuild') => {
    setErr(null);
    const r = what === 'validate' ? await prepareApi.validatePkg(eng.id, p.id) : await prepareApi.build(eng.id, { name: p.name, scope_type: p.scope_type, scope_values: p.scope_values, supersedes_id: p.id });
    if (r.ok) { setToast(what === 'validate' ? `Re-validated: ${r.data.status}.` : `Version ${r.data.version} built.`); list.reload(); } else setErr(failureText(r));
  };
  const sign = async () => { if (!signing) return; const r = await prepareApi.signPkg(eng.id, signing.id, notes); if (r.ok) { setToast('Package signed off.'); setSigning(null); setNotes(''); list.reload(); } else setErr(failureText(r)); };
  const openPkg = async (p: Package) => { const r = await prepareApi.pkg(eng.id, p.id); if (r.ok) setOpen(r.data); else setToast(`Could not open the package: ${failureText(r)}`); };
  return (
    <div className="pg" data-testid="page-prepare-packages">
      <PageHeader icon="golden" title="Evidence packages" lede="A package freezes the validated evidence for a scope — titles, requirements, archetypes and SHA-256 hashes — and checks it against the required mappings. A second person signs it off; re-validation catches any item that changed afterwards." actions={<EngagementSelect eng={eng} />} />
      {(eng.error || list.error || err) && <p className="note" data-tone="bad" role="alert">{eng.error ?? list.error ?? err}</p>}
      {editor && eng.id && (
        <form className="card card-pad" onSubmit={build} data-testid="package-build">
          <h2 className="card-title">Build a package</h2>
          <div className="form-grid-2">
            <label className="form-row">Name *<input className="input" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} required minLength={3} placeholder="Assessment package — Q4 2026" data-testid="package-name" /></label>
            <label className="form-row">Scope<select className="select" value={scopeType} onChange={(e) => setScopeType(e.target.value)} data-testid="package-scope"><option value="all">All requirements</option><option value="requirement">Requirements…</option><option value="family">Control families…</option><option value="objective">Assessment objectives…</option></select></label>
          </div>
          {scopeType !== 'all' && <label className="form-row">{scopeType === 'requirement' ? 'Requirement ids' : scopeType === 'family' ? 'Family codes' : 'Objective ids'} (comma-separated)<input className="input" value={scopeValues} onChange={(e) => setScopeValues(e.target.value)} placeholder={scopeType === 'requirement' ? 'AC.L1-3.1.1, AC.L1-3.1.2' : scopeType === 'family' ? 'AC, IA, SC' : 'AC.L1-3.1.1[a]'} list={scopeType === 'requirement' ? 'pkg-req' : undefined} /><datalist id="pkg-req">{REQ_IDS.map((id) => <option key={id} value={id} />)}</datalist></label>}
          <label style={{ fontWeight: 400 }}><input type="checkbox" checked={includeUnvalidated} onChange={(e) => setIncludeUnvalidated(e.target.checked)} /> include unvalidated items (package will stay draft)</label>
          <div><button type="submit" className="btn btn-primary" disabled={busy || name.length < 3} data-testid="package-submit">{busy ? 'Building…' : 'Build package'}</button></div>
        </form>
      )}
      {list.data && list.data.length === 0 && <Empty>No package yet.</Empty>}
      {list.data && list.data.length > 0 && (
        <div className="table-wrap"><table className="tbl" data-testid="package-table"><thead><tr><th scope="col">Package</th><th scope="col">Scope</th><th scope="col" className="num">Items</th><th scope="col">Validation</th><th scope="col">Status</th><th scope="col">Built / signed</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{list.data.map((p) => <tr key={p.id}><td><strong>{p.name}</strong> <span className="hint">v{p.version}</span></td><td className="hint">{p.scope_type}{p.scope_values.length ? `: ${p.scope_values.join(', ')}` : ''}</td><td className="num">{p.item_count ?? p.item_ids.length}</td><td>{p.validation ? <span className="pill" data-tone={p.validation.passed && !(p.validation.drifted_items?.length) ? 'good' : 'bad'}>{p.validation.passed && !(p.validation.drifted_items?.length) ? 'pass' : `${p.validation.missing_required.length} missing · ${p.validation.unvalidated.length} unvalidated${p.validation.drifted_items?.length ? ` · ${p.validation.drifted_items.length} drifted` : ''}`}</span> : '—'}</td><td><span className="pill" data-tone={p.status === 'signed_off' ? 'good' : p.status === 'validated' ? 'info' : p.status === 'superseded' ? undefined : 'warn'}>{p.status.replace('_', ' ')}</span></td><td className="hint">{p.built_by} · {fmt(p.built_at)}{p.signed_off_by && <><br />signed {p.signed_off_by} · {fmt(p.signed_off_at)}</>}</td>
            <td style={{ whiteSpace: 'nowrap' }}><button type="button" className="row-btn" onClick={() => openPkg(p)} data-testid={`package-open-${p.id}`}>Open</button> {p.status !== 'superseded' && editor && <><button type="button" className="row-btn" onClick={() => act(p, 'validate')}>Re-validate</button> <button type="button" className="row-btn" onClick={() => act(p, 'rebuild')}>Rebuild v{p.version + 1}</button></>} {p.status === 'validated' && canSign(viewer) && p.built_by !== mySub && <button type="button" className="row-btn" onClick={() => setSigning(p)} data-testid={`package-sign-${p.id}`}>Sign off</button>}</td></tr>)}</tbody></table></div>
      )}
      {open && eng.id && (
        <Drawer title={`${open.name} v${open.version}`} subtitle={`${open.status.replace('_', ' ')} · built by ${open.built_by} on ${fmt(open.built_at)}${open.signed_off_by ? ` · signed off by ${open.signed_off_by}` : ''}`} onClose={() => setOpen(null)} testId="package-drawer" wide
          footer={<><button type="button" className="btn btn-secondary" onClick={() => downloadExport(prepareApi.fileUrl(eng.id, `packages/${open.id}/export?format=csv`), `package-${open.id.slice(0, 8)}.csv`, (m) => setErr(m))}>Export CSV</button> <button type="button" className="btn btn-secondary" onClick={() => downloadExport(prepareApi.fileUrl(eng.id, `packages/${open.id}/export`), `package-${open.id.slice(0, 8)}.json`, (m) => setErr(m))}>Export manifest (JSON)</button> <button type="button" className="btn btn-primary" onClick={() => setOpen(null)}>Close</button></>}>
          {open.validation && (
            <>
              <p><span className="pill" data-tone={open.validation.passed ? 'good' : 'bad'}>{open.validation.passed ? 'Validation passes' : 'Validation fails'}</span> <span className="hint">{open.validation.cui_items} CUI item(s) · {open.validation.expired} expired{open.validation.checked_at ? ` · checked ${fmt(open.validation.checked_at)}` : ''}</span></p>
              {open.validation.missing_required.length > 0 && <p className="note" data-tone="bad">Missing required evidence: {open.validation.missing_required.slice(0, 12).map((m) => `${m.requirement_id} (${m.missing.join(', ')})`).join('; ')}{open.validation.missing_required.length > 12 ? ` … +${open.validation.missing_required.length - 12}` : ''}</p>}
              {open.validation.unvalidated.length > 0 && <p className="note" data-tone="warn">Unvalidated: {open.validation.unvalidated.map((u) => `${u.title} (${u.status})`).join('; ')}</p>}
              {open.validation.drifted_items && open.validation.drifted_items.length > 0 && <p className="note" data-tone="bad">{open.validation.drifted_items.length} item(s) changed since the manifest was frozen — rebuild the package.</p>}
            </>
          )}
          {open.sign_off_notes && <p className="note" data-tone="good">Sign-off: {open.sign_off_notes}</p>}
          <h3 className="card-title">Manifest · {open.manifest?.items.length ?? 0} items</h3>
          <div className="table-wrap"><table className="tbl"><thead><tr><th scope="col">Evidence</th><th scope="col">Requirements</th><th scope="col">Archetype</th><th scope="col">Status</th><th scope="col">SHA-256</th></tr></thead><tbody>{(open.manifest?.items ?? []).map((i) => <tr key={i.id}><td><strong>{i.title}</strong><div className="hint">{i.file_name ?? 'link'} · {i.classification.toUpperCase()}</div></td><td className="hint">{i.requirement_ids.join(', ')}</td><td className="hint">{i.archetype_code ?? '—'}</td><td><span className="pill" data-tone={i.status === 'validated' ? 'good' : 'warn'}>{i.status}{i.strength ? ` · ${i.strength}` : ''}</span></td><td className="hint" style={{ fontFamily: 'monospace' }}>{i.sha256?.slice(0, 16) ?? '—'}…</td></tr>)}</tbody></table></div>
        </Drawer>
      )}
      {signing && <ConfirmDialog title={`Sign off ${signing.name} v${signing.version}`} confirmLabel="Sign off" onConfirm={sign} onCancel={() => setSigning(null)} error={err}><p>You are confirming, as <strong>{me}</strong>, that this package's {signing.item_count ?? signing.item_ids.length} items were reviewed against their requirements. Built by {signing.built_by}; separation of duties applies.</p><label className="form-row">Notes *<textarea maxLength={2000} className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="package-sign-notes" /></label></ConfirmDialog>}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

// ====================================================================== assessor workspace
export function AssessorWorkspacePage({ viewer }: { viewer: Viewer }) {
  const eng = useEngagement();
  const ov = useLoader<AssessorOverview>(eng.id ? () => prepareApi.assessor(eng.id) : null, [eng.id]);
  const reqs = useLoader<AssessorRequest[]>(eng.id ? () => prepareApi.requests(eng.id) : null, [eng.id]);
  const [family, setFamily] = useState('all');
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<AssessorOverview['requirements'][number] | null>(null);
  const [question, setQuestion] = useState('');
  const [answerFor, setAnswerFor] = useState<AssessorRequest | null>(null);
  const [answer, setAnswer] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const asker = isAssessorSide(viewer);
  const answerer = isSignedIn(viewer) && actionsFor(viewer.role, 'prepare', 'assessor-workspace').includes('edit');
  const rows = useMemo(() => (ov.data?.requirements ?? []).filter((r) => (family === 'all' || r.family === family) && (!onlyGaps || r.assessed !== 'met') && (!q || `${r.requirement_id} ${r.practice}`.toLowerCase().includes(q.toLowerCase()))), [ov.data, family, onlyGaps, q]);
  const ask = async (e: FormEvent) => { e.preventDefault(); const r = await prepareApi.ask(eng.id, { question, requirement_id: open?.requirement_id ?? null }); if (r.ok) { setToast('Question logged.'); setQuestion(''); reqs.reload(); } else setErr(failureText(r)); };
  const doAnswer = async () => { if (!answerFor) return; const r = await prepareApi.answer(eng.id, answerFor.id, answer); if (r.ok) { setToast('Answered.'); setAnswerFor(null); setAnswer(''); reqs.reload(); } else setErr(failureText(r)); };
  return (
    <div className="pg" data-testid="page-prepare-assessor">
      <PageHeader icon="workspace" title="Assessor workspace" lede="What the C3PAO sees, read-only: for every requirement the assessed status, the approved implementation statement, the validated evidence with its hash and reviewer, whether it is in a signed-off package, and any POA&M entry. Questions from the assessor are logged and answered here." actions={<EngagementSelect eng={eng} />} />
      {(eng.error || ov.error || err) && <p className="note" data-tone="bad" role="alert">{eng.error ?? ov.error ?? err}</p>}
      {ov.data && (
        <div className="stats">
          <Stat icon="sprs" value={ov.data.sprs?.score ?? '—'} label="SPRS" sub={ov.data.sprs ? fmt(ov.data.sprs.assessed_at) : 'no run'} />
          <Stat icon="golden" value={ov.data.packages.length} label="Signed-off packages" tone={ov.data.packages.length ? 'good' : 'warn'} sub={ov.data.packages.map((p) => `${p.name} v${p.version}`).join(', ') || 'none'} />
          <Stat icon="situation" value={ov.data.boundary ? `v${ov.data.boundary.version}` : '—'} label="Confirmed boundary" tone={ov.data.boundary ? 'good' : 'bad'} />
          <Stat icon="requirements" value={ov.data.requirements.filter((r) => r.assessed === 'met').length} label="Requirements Met" sub={`${ov.data.requirements.filter((r) => r.statement_approved).length} approved statements`} />
          <Stat icon="help" value={(reqs.data ?? []).filter((r) => r.status === 'open').length} label="Open questions" tone={(reqs.data ?? []).some((r) => r.status === 'open') ? 'warn' : 'good'} />
        </div>
      )}
      <div className="toolbar">
        <label className="grow"><span className="sr-only">Search</span><input className="input" placeholder="Search requirement or practice" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label>Family <select className="select" value={family} onChange={(e) => setFamily(e.target.value)}><option value="all">All</option>{[...FAMILY.entries()].map(([f, n]) => <option key={f} value={f}>{f} · {n}</option>)}</select></label>
        <label style={{ fontWeight: 400 }}><input type="checkbox" checked={onlyGaps} onChange={(e) => setOnlyGaps(e.target.checked)} /> only not Met</label>
      </div>
      {rows.length > 0 && (
        <div className="table-wrap"><table className="tbl" data-testid="assessor-table"><thead><tr><th scope="col">Requirement</th><th scope="col">Assessed</th><th scope="col">Implementation</th><th scope="col">Evidence</th><th scope="col">POA&M</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.requirement_id}><td><strong>{r.requirement_id}</strong> <span className="hint">L{r.level}</span><div className="hint" style={{ maxWidth: 380 }}>{r.practice}</div></td><td>{r.assessed ? <span className="pill" data-tone={r.assessed === 'met' ? 'good' : r.assessed === 'partial' ? 'warn' : 'bad'}>{r.assessed.replace('_', ' ')}</span> : '—'}</td><td>{r.implementation_status ? <span className="pill" data-tone={IMPL_TONE[r.implementation_status]}>{IMPL_LABEL[r.implementation_status]}{r.statement_approved ? ' ✓' : ''}</span> : <span className="hint">no statement</span>}</td><td>{r.evidence.length ? <>{r.evidence.length} <span className="hint">({r.evidence.filter((e) => e.in_signed_package).length} in package)</span></> : <span className="pill" data-tone="warn">none</span>}</td><td>{r.poam ? <span className="pill" data-tone={r.poam.eligible ? 'info' : 'bad'}>{r.poam.status}{r.poam.eligible ? '' : ' · ineligible'}</span> : '—'}</td><td><button type="button" className="row-btn" onClick={() => setOpen(r)} data-testid={`assessor-open-${r.requirement_id}`}>View</button></td></tr>)}</tbody></table></div>
      )}
      <section className="card card-pad">
        <h2 className="card-title">Assessor questions</h2>
        {reqs.data && reqs.data.length === 0 && <Empty>No question logged yet.</Empty>}
        {reqs.data && reqs.data.length > 0 && <table className="tbl" data-testid="assessor-requests"><tbody>{reqs.data.map((r) => <tr key={r.id}><td><strong>{r.requirement_id ?? 'General'}</strong><div>{r.question}</div><div className="hint">{r.requested_by} · {fmt(r.created_at)}</div>{r.answer && <div className="note" data-tone="good" style={{ marginTop: 6 }}>{r.answer} <span className="hint">— {r.answered_by}, {fmt(r.answered_at)}</span></div>}</td><td><span className="pill" data-tone={r.status === 'open' ? 'warn' : r.status === 'answered' ? 'good' : undefined}>{r.status}</span></td><td style={{ whiteSpace: 'nowrap' }}>{answerer && r.status === 'open' && <button type="button" className="row-btn" onClick={() => setAnswerFor(r)}>Answer</button>} {asker && r.status !== 'closed' && <button type="button" className="row-btn" onClick={async () => { await prepareApi.closeRequest(eng.id, r.id); reqs.reload(); }}>Close</button>}</td></tr>)}</tbody></table>}
        {asker && eng.id && <form onSubmit={ask} style={{ display: 'flex', gap: 6, marginTop: 10 }}><input className="input" placeholder={`Ask a question${open ? ` about ${open.requirement_id}` : ''}`} value={question} onChange={(e) => setQuestion(e.target.value)} minLength={5} style={{ flex: 1 }} data-testid="assessor-ask" /><button type="submit" className="btn btn-primary" disabled={question.length < 5}>Ask</button></form>}
      </section>
      {open && (
        <Drawer title={`${open.requirement_id} — ${open.assessed ? open.assessed.replace('_', ' ') : 'not assessed'}`} subtitle={open.practice} onClose={() => setOpen(null)} testId="assessor-drawer" wide footer={<button type="button" className="btn btn-primary" onClick={() => setOpen(null)}>Close</button>}>
          <h3 className="card-title">Implementation statement {open.statement_approved ? <span className="pill" data-tone="good">approved</span> : <span className="pill" data-tone="warn">not approved</span>}</h3>
          <p>{open.statement || <em>No statement provided.</em>}</p>
          <h3 className="card-title">Validated evidence</h3>
          {open.evidence.length === 0 && <p className="hint">None.</p>}
          {open.evidence.length > 0 && <table className="tbl"><thead><tr><th scope="col">Evidence</th><th scope="col">Archetype / form</th><th scope="col">Reviewed by</th><th scope="col">SHA-256</th><th scope="col">Package</th></tr></thead><tbody>{open.evidence.map((e) => <tr key={e.id}><td><strong>{e.title}</strong><div className="hint">collected {fmt(e.collected_at)}</div></td><td className="hint">{e.archetype_code ?? '—'}<br />{e.form ?? ''}</td><td className="hint">{e.reviewed_by ?? '—'}</td><td className="hint" style={{ fontFamily: 'monospace' }}>{e.sha256?.slice(0, 16) ?? '—'}…</td><td>{e.in_signed_package ? <span className="pill" data-tone="good">signed</span> : <span className="pill" data-tone="warn">not packaged</span>}</td></tr>)}</tbody></table>}
          {open.poam && <p className="note" data-tone={open.poam.eligible ? 'info' : 'bad'}>POA&M: {open.poam.status}{open.poam.scheduled_completion ? `, scheduled ${fmt(open.poam.scheduled_completion)}` : ''}{open.poam.eligible ? '' : ' — this requirement cannot remain on a POA&M at certification'}</p>}
        </Drawer>
      )}
      {answerFor && <ConfirmDialog title={`Answer: ${answerFor.requirement_id ?? 'general'}`} confirmLabel="Send answer" onConfirm={doAnswer} onCancel={() => setAnswerFor(null)} error={err}><p className="hint">{answerFor.question}</p><label className="form-row">Answer *<textarea maxLength={2000} className="input" rows={4} value={answer} onChange={(e) => setAnswer(e.target.value)} data-testid="assessor-answer" /></label></ConfirmDialog>}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

// ====================================================================== reports
const REPORTS: { kind: string; title: string; what: string; icon: string }[] = [
  { kind: 'readiness', title: 'CMMC readiness report', what: 'The 15-item checklist with counts, SPRS and readiness score', icon: 'readiness' },
  { kind: 'coverage', title: 'Requirement coverage report', what: 'Per requirement: required archetypes covered / pending / missing', icon: 'catalog' },
  { kind: 'gaps', title: 'Gap analysis report', what: 'Requirements not Met in the latest run, heaviest first, with engine status and overrides', icon: 'discovery' },
  { kind: 'sprs', title: 'SPRS report', what: 'Score, projection and every requirement status of the latest run', icon: 'sprs' },
  { kind: 'poam', title: 'POA&M report', what: 'Plan of Action & Milestones with eligibility flags', icon: 'contracts' },
  { kind: 'evidence-inventory', title: 'Evidence inventory report', what: 'Every evidence item with hash, status, strength, reviewer and classification', icon: 'integrity' },
];
export function ReportsPage({ go }: { go: (r: RouteId) => void }) {
  const eng = useEngagement();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="pg" data-testid="page-prepare-reports">
      <PageHeader icon="guide" title="Reports & exports" lede="Everything the assessor or leadership asks for, from the same records the screens show — as CSV (spreadsheet), Markdown (document) or JSON (machine). The SSP and the evidence package export live on their own pages." actions={<EngagementSelect eng={eng} />} />
      {(eng.error || err) && <p className="note" data-tone="bad" role="alert">{eng.error ?? err}</p>}
      <div className="form-grid-2">
        {REPORTS.map((r) => (
          <section key={r.kind} className="card card-pad" data-testid={`report-${r.kind}`}>
            <h2 className="card-title">{r.title}</h2>
            <p className="hint">{r.what}</p>
            {eng.id && <div className="toolbar" style={{ gap: 6 }}>{(['csv', 'md', 'json'] as const).map((f) => <button key={f} type="button" className="btn btn-secondary" onClick={() => downloadExport(prepareApi.fileUrl(eng.id, `reports/${r.kind}?format=${f}`), `${r.kind}.${f}`, setErr)}>{f.toUpperCase()}</button>)}</div>}
          </section>
        ))}
        <section className="card card-pad"><h2 className="card-title">Assessment package export</h2><p className="hint">The signed-off evidence package manifest (JSON with download links, or CSV) — on the Evidence packages page.</p><button type="button" className="btn btn-secondary" onClick={() => go('prepare/packages')}>Open packages</button></section>
        <section className="card card-pad"><h2 className="card-title">System Security Plan</h2><p className="hint">Full SSP document as Markdown or JSON — on the SSP page.</p><button type="button" className="btn btn-secondary" onClick={() => go('prepare/ssp')}>Open SSP</button></section>
      </div>
    </div>
  );
}
