// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// EvidenceCollectPages.tsx — Sprint 6 slice "Collect Evidence" (workbook groups
// Evidence Overview, Explorer, Collection, Management, Validation, Repository).
// Real data from muster-api: items validated against the published CES-Shared
// catalogue (archetype, requirement→archetype mapping, EVR rule conditions),
// reviewed by a different person (SoD), versioned; coverage per requirement;
// evidence requests. Aavya portal theme. (The catalogue editors themselves stay
// under Shared Foundation: EvidencePages.tsx / pages/shared.)

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { RouteId, Viewer } from '../../nav';
import { actionsFor } from '../../lifecycle/rbac';
import { ConfirmDialog, Drawer, Toast } from '../../governed';
import { Empty, PageHeader, Stat } from '../../ui';
import { REQUIREMENTS } from '../../referenceData';
import { getMusterToken } from '@/shared/api/musterToken';
import { engagementLabel, useEngagement } from '../useEngagement';
import { failureText } from '../onboard/onboardApi';
import { assessApi, type AssessmentRun } from '../assess/assessApi';
import { EVIDENCE_KINDS, evidenceApi, KIND_LABEL, STATUS_LABEL, STATUS_TONE, toBase64, type Catalogue, type Coverage, type EvidenceInput, type EvidenceItem, type EvidenceKind, type EvidenceRequest, type EvidenceStatus, type EvidenceSummary, type ValidationReport } from './evidenceApi';

const PRACTICE = new Map(REQUIREMENTS.map((r) => [r.control_id, r.practice]));
const FAMILY = new Map(REQUIREMENTS.map((r) => [r.family, r.family_name]));
const REQ_IDS = REQUIREMENTS.map((r) => r.control_id);
const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—');
const kb = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
const isSignedIn = (v: Viewer): v is { kind: 'signed-in'; role: string } => v.kind === 'signed-in';
const canEdit = (v: Viewer, group: string) => isSignedIn(v) && actionsFor(v.role, 'evidence', group).includes('edit');
const canApprove = (v: Viewer) => isSignedIn(v) && (v.role === 'evidence_reviewer' || v.role === 'bhd_operator');

function EngagementSelect({ eng }: { eng: ReturnType<typeof useEngagement> }) {
  return (
    <label>Engagement{' '}
      <select className="select" value={eng.id} onChange={(e) => eng.setId(e.target.value)} data-testid="evidence-engagement">
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

function Validation({ v }: { v: ValidationReport }) {
  return (
    <div data-testid="evidence-validation">
      <p><span className="pill" data-tone={v.passed ? 'good' : 'bad'}>{v.passed ? 'Checks pass' : 'Blocking checks fail'}</span> <span className="pill" data-tone={v.strength === 'strong' ? 'good' : v.strength === 'adequate' ? 'info' : 'bad'}>strength: {v.strength}</span> <span className="hint">mapping {v.mapping.type}{v.mapping.expected_strength ? ` · expects ${v.mapping.expected_strength}` : ''} · checked {fmt(v.checked_at)}</span></p>
      <ul className="checklist">
        {v.checks.map((c) => <li key={c.id}><span className="pill" data-tone={c.ok ? 'good' : c.blocking ? 'bad' : 'warn'}>{c.ok ? 'OK' : c.blocking ? 'FAIL' : 'Note'}</span> <span>{c.label}{c.note && <div className="hint">{c.note}</div>}</span></li>)}
      </ul>
      {v.rules.length > 0 && (
        <>
          <h4 className="card-title" style={{ marginTop: 10 }}>Evaluation rules (CES-Shared)</h4>
          <ul className="checklist">
            {v.rules.map((r) => <li key={r.code}><span className="pill" data-tone={r.outcome === 'met' ? 'good' : r.outcome === 'not_met' ? 'bad' : r.outcome === 'partial' ? 'warn' : 'info'}>{r.outcome.replace('_', ' ')}</span> <span><strong>{r.code}</strong> {r.name}<div className="hint">{r.message}{r.conditions.length ? ` · ${r.conditions.map((c) => `${c.check}${c.value ? `(${c.value})` : ''}: ${c.ok === null ? '?' : c.ok ? 'ok' : 'fail'}`).join(', ')}` : ''}</div></span></li>)}
          </ul>
        </>
      )}
    </div>
  );
}

// ====================================================================== item form (new / edit / new version)
function ItemForm({ eid, cat, initial, mode, presetRequirement, presetArchetype, onSaved, onClose }: { eid: string; cat: Catalogue; initial: EvidenceItem | null; mode: 'new' | 'edit' | 'version'; presetRequirement?: string; presetArchetype?: string | null; onSaved: (m: string) => void; onClose: () => void }) {
  const [f, setF] = useState<EvidenceInput>(initial ? { title: initial.title, description: initial.description, requirement_ids: initial.requirement_ids, archetype_code: initial.archetype_code, form: initial.form, kind: initial.kind, source: initial.source, owner: initial.owner, classification: initial.classification, period_start: initial.period_start?.slice(0, 10) ?? null, period_end: initial.period_end?.slice(0, 10) ?? null, retention_until: initial.retention_until?.slice(0, 10) ?? null, metadata: initial.metadata } : { title: '', requirement_ids: presetRequirement ? [presetRequirement] : [], archetype_code: presetArchetype ?? null, kind: 'document', source: 'upload', classification: 'internal', metadata: {} });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reqInput, setReqInput] = useState('');
  const set = <K extends keyof EvidenceInput>(k: K, v: EvidenceInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const archetype = cat.archetypes.find((a) => a.code === f.archetype_code) ?? null;
  const suggested = useMemo(() => { const reqs = f.requirement_ids ?? []; const codes = new Set(cat.mappings.filter((m) => reqs.includes(m.control_id)).map((m) => m.archetype_code)); return cat.archetypes.filter((a) => codes.has(a.code)); }, [cat, f.requirement_ids]);
  const addReq = (id: string) => { const v = id.trim().toUpperCase(); if (REQ_IDS.includes(v) && !(f.requirement_ids ?? []).includes(v)) set('requirement_ids', [...(f.requirement_ids ?? []), v]); setReqInput(''); };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: EvidenceInput = { ...f, description: f.description || null, owner: f.owner || null, form: f.form || null, period_start: f.period_start || null, period_end: f.period_end || null, retention_until: f.retention_until || null };
      if (file) { if (file.size > 10 * 1024 * 1024) { setError('Files over 10 MB: store them in the document repository and paste the link in metadata.external_url.'); setBusy(false); return; } body.content_base64 = await toBase64(file); body.file_name = file.name; body.content_type = file.type || 'application/octet-stream'; }
      const r = mode === 'edit' && initial ? await evidenceApi.update(eid, initial.id, body) : mode === 'version' && initial ? await evidenceApi.newVersion(eid, initial.id, body) : await evidenceApi.create(eid, body);
      if (r.ok) onSaved(mode === 'edit' ? 'Evidence updated and re-validated.' : mode === 'version' ? `Version ${r.data.version} created; previous archived.` : r.data.validation?.passed ? 'Evidence added — checks pass; submit it for review.' : 'Evidence added as draft — fix the failing checks before submitting.');
      else setError(failureText(r));
    } finally { setBusy(false); }
  };
  return (
    <Drawer title={mode === 'edit' ? 'Edit evidence' : mode === 'version' ? `New version of ${initial?.title}` : 'Add evidence'} subtitle="Map it to the requirement(s) and the standard evidence archetype; validation runs on save." onClose={onClose} testId="evidence-drawer" wide
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="submit" form="evidence-form" className="btn btn-primary" disabled={busy || !(f.requirement_ids?.length) || !f.title} data-testid="evidence-submit">{busy ? 'Saving…' : mode === 'edit' ? 'Save' : mode === 'version' ? 'Create version' : 'Add evidence'}</button></>}>
      <form id="evidence-form" onSubmit={submit}>
        {error && <p className="note" data-tone="bad" role="alert">{error}</p>}
        <label className="form-row">Title *<input className="input" value={f.title ?? ''} onChange={(e) => set('title', e.target.value)} required minLength={3} placeholder="e.g. Entra user list export — November 2026" data-testid="evidence-title" /></label>
        <label className="form-row">Requirements *
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(f.requirement_ids ?? []).map((id) => <span key={id} className="pill" data-tone="info">{id} <button type="button" className="row-btn" onClick={() => set('requirement_ids', (f.requirement_ids ?? []).filter((x) => x !== id))} aria-label={`Remove ${id}`}>×</button></span>)}
            <input className="input" list="evidence-req-ids" value={reqInput} onChange={(e) => setReqInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addReq(reqInput); } }} onBlur={() => reqInput && addReq(reqInput)} placeholder="Add requirement id" style={{ width: 200 }} data-testid="evidence-req" />
            <datalist id="evidence-req-ids">{REQ_IDS.map((id) => <option key={id} value={id}>{PRACTICE.get(id)?.slice(0, 60)}</option>)}</datalist>
          </span>
        </label>
        <div className="form-grid-2">
          <label className="form-row">Standard evidence archetype
            <select className="select" value={f.archetype_code ?? ''} onChange={(e) => { set('archetype_code', e.target.value || null); set('form', null); }} data-testid="evidence-archetype">
              <option value="">— choose —</option>
              {suggested.length > 0 && <optgroup label="Mapped to the chosen requirements">{suggested.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</optgroup>}
              <optgroup label="All archetypes">{cat.archetypes.filter((a) => !suggested.includes(a)).map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}</optgroup>
            </select>
            {archetype?.collection_notes && <span className="hint">{archetype.collection_notes}</span>}
          </label>
          <label className="form-row">Form *
            <select className="select" value={f.form ?? ''} onChange={(e) => set('form', e.target.value || null)} disabled={!archetype} data-testid="evidence-form-select">
              <option value="">— one of the archetype's acceptable forms —</option>
              {(archetype?.acceptable_forms ?? []).map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
        </div>
        <div className="form-grid-2">
          <label className="form-row">Kind<select className="select" value={f.kind ?? 'document'} onChange={(e) => set('kind', e.target.value as EvidenceKind)}>{EVIDENCE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
          <label className="form-row">Classification
            <select className="select" value={f.classification ?? 'internal'} onChange={(e) => set('classification', e.target.value as EvidenceInput['classification'])}><option value="internal">Internal</option><option value="non_cui">Non-CUI</option><option value="cui">CUI</option></select>
            {f.classification === 'cui' && <span className="hint">CUI evidence: stored encrypted at rest on the enclave volume; downloads are audited.</span>}
          </label>
        </div>
        {mode !== 'edit' && (
          <label className="form-row">{mode === 'version' ? 'New file *' : 'File (≤ 10 MB)'}
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} data-testid="evidence-file" />
            <span className="hint">{file ? `${file.name} · ${kb(file.size)} · ${file.type || 'unknown type'}` : 'Or leave empty and set metadata.external_url for a repository link.'}</span>
          </label>
        )}
        <div className="form-grid-2">
          <label className="form-row">Owner<input className="input" value={f.owner ?? ''} onChange={(e) => set('owner', e.target.value)} placeholder="Who can speak to this evidence" /></label>
          <label className="form-row">Retention until<input className="input" type="date" value={f.retention_until ?? ''} onChange={(e) => set('retention_until', e.target.value || null)} /></label>
        </div>
        <div className="form-grid-2">
          <label className="form-row">Coverage period start<input className="input" type="date" value={f.period_start ?? ''} onChange={(e) => set('period_start', e.target.value || null)} /></label>
          <label className="form-row">Coverage period end<input className="input" type="date" value={f.period_end ?? ''} onChange={(e) => set('period_end', e.target.value || null)} /></label>
        </div>
        <label className="form-row">Description<textarea className="input" rows={2} value={f.description ?? ''} onChange={(e) => set('description', e.target.value)} /></label>
        <label className="form-row">Metadata (key = value per line; e.g. exported_by = cis-1, external_url = https://…)
          <textarea className="input" rows={3} value={Object.entries(f.metadata ?? {}).map(([k, v]) => `${k} = ${String(v)}`).join('\n')} onChange={(e) => set('metadata', Object.fromEntries(e.target.value.split('\n').map((l) => l.split('=')).filter((p) => p.length >= 2 && p[0].trim()).map(([k, ...v]) => [k.trim(), v.join('=').trim()])))} data-testid="evidence-metadata" />
        </label>
      </form>
    </Drawer>
  );
}

// ====================================================================== item detail
function ItemDrawer({ eid, item, cat, viewer, onChanged, onEdit, onVersion, onClose }: { eid: string; item: EvidenceItem; cat: Catalogue; viewer: Viewer; onChanged: (m: string) => void; onEdit: () => void; onVersion: () => void; onClose: () => void }) {
  const [detail, setDetail] = useState<EvidenceItem>(item);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  useEffect(() => { evidenceApi.item(eid, item.id).then((r) => r.ok && setDetail(r.data)); }, [eid, item.id]);
  const me = isSignedIn(viewer) ? viewer.role : '';
  const editor = canEdit(viewer, 'evidence-collection');
  const reviewer = canApprove(viewer);
  const archetype = cat.archetypes.find((a) => a.code === detail.archetype_code);
  const act = async (what: string, fn: () => Promise<{ ok: true; data: unknown } | { ok: false; status: number; degraded: boolean; error?: string }>, msg: string) => { setBusy(what); setError(null); const r = await fn(); setBusy(null); if (r.ok) onChanged(msg); else setError(failureText(r)); };
  const download = async () => {
    const jwt = getMusterToken();
    const res = await fetch(evidenceApi.contentUrl(eid, detail.id), { headers: jwt ? { Authorization: `Bearer ${jwt}` } : {} });
    if (!res.ok) { setError(res.status === 409 ? 'No stored file — open the external link in metadata.' : `Download failed (${res.status}).`); return; }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a'); a.href = url; a.download = detail.file_name ?? 'evidence'; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <Drawer title={detail.title} subtitle={`v${detail.version} · ${STATUS_LABEL[detail.status]} · ${KIND_LABEL[detail.kind]} · ${detail.source} · ${detail.classification.toUpperCase()}`} onClose={onClose} testId="evidence-detail" wide footer={<button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>}>
      {error && <p className="note" data-tone="bad" role="alert">{error}</p>}
      <div className="stats">
        <Stat icon="requirements" value={detail.requirement_ids.length} label="Requirements" sub={detail.requirement_ids.join(', ')} />
        <Stat icon="catalog" value={archetype?.code ?? '—'} label="Archetype" sub={archetype?.name} />
        <Stat icon="integrity" value={detail.size_bytes ? kb(detail.size_bytes) : 'link'} label="Content" sub={detail.sha256 ? `sha256 ${detail.sha256.slice(0, 12)}…` : undefined} />
      </div>
      <p className="hint">Form: {detail.form ?? '—'} · collected {fmt(detail.collected_at)} · owner {detail.owner ?? '—'} · period {fmtDate(detail.period_start)} → {fmtDate(detail.period_end)} · retention until {fmtDate(detail.retention_until)}{detail.created_by ? ` · submitted by ${detail.created_by}` : ''}</p>
      {detail.description && <p>{detail.description}</p>}
      {detail.metadata && Object.keys(detail.metadata).length > 0 && <table className="tbl"><tbody>{Object.entries(detail.metadata).map(([k, v]) => <tr key={k}><td>{k}</td><td>{typeof v === 'string' && /^https?:\/\//.test(v) ? <a href={v} target="_blank" rel="noreferrer">{v}</a> : String(v)}</td></tr>)}</tbody></table>}
      {detail.reviewed_by && <p className="note" data-tone={detail.status === 'validated' ? 'good' : 'bad'}>{detail.status === 'validated' ? 'Approved' : 'Rejected'} by {detail.reviewed_by} on {fmt(detail.reviewed_at)}: {detail.review_notes}</p>}
      <h3 className="card-title">Validation</h3>
      {detail.validation ? <Validation v={detail.validation} /> : <p className="hint">Not validated yet.</p>}
      {detail.related_versions && detail.related_versions.length > 0 && <p className="hint">Related versions: {detail.related_versions.map((v) => `v${v.version} (${STATUS_LABEL[v.status]})`).join(', ')}</p>}
      <h3 className="card-title">Actions</h3>
      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        {(detail.size_bytes > 0) && <button type="button" className="btn btn-secondary" onClick={download} data-testid="evidence-download">Download</button>}
        {editor && <button type="button" className="btn btn-secondary" disabled={!!busy} onClick={() => act('validate', () => evidenceApi.validate(eid, detail.id), 'Re-validated.')}>Re-validate</button>}
        {editor && (detail.status === 'draft' || detail.status === 'submitted' || detail.status === 'rejected') && <button type="button" className="btn btn-secondary" onClick={onEdit}>Edit</button>}
        {editor && (detail.status === 'draft' || detail.status === 'rejected') && <button type="button" className="btn btn-primary" disabled={!!busy || !detail.validation?.passed} title={detail.validation?.passed ? undefined : 'Fix the blocking checks first'} onClick={() => act('submit', () => evidenceApi.submit(eid, detail.id), 'Submitted for review.')} data-testid="evidence-submit-review">Submit for review</button>}
        {reviewer && detail.status === 'submitted' && detail.created_by !== me && (
          <form onSubmit={(e: FormEvent) => e.preventDefault()} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <input className="input" placeholder="Review notes (what you checked)" value={notes} onChange={(e) => setNotes(e.target.value)} minLength={5} style={{ minWidth: 280 }} data-testid="evidence-review-notes" />
            <button type="button" className="btn btn-primary" disabled={!!busy || notes.length < 5} onClick={() => act('approve', () => evidenceApi.review(eid, detail.id, 'approve', notes), 'Evidence approved.')} data-testid="evidence-approve">Approve</button>
            <button type="button" className="btn btn-secondary" disabled={!!busy || notes.length < 5} onClick={() => act('reject', () => evidenceApi.review(eid, detail.id, 'reject', notes), 'Evidence rejected.')}>Reject</button>
          </form>
        )}
        {reviewer && detail.status === 'submitted' && detail.created_by === me && <span className="hint">You submitted this — another reviewer must approve it (separation of duties).</span>}
        {editor && detail.status !== 'archived' && <button type="button" className="btn btn-secondary" onClick={onVersion}>New version</button>}
        {editor && detail.status !== 'archived' && <button type="button" className="btn btn-secondary" onClick={() => setConfirmArchive(true)}>Archive</button>}
      </div>
      {confirmArchive && <ConfirmDialog title="Archive evidence" confirmLabel="Archive" onConfirm={() => act('archive', () => evidenceApi.archive(eid, detail.id), 'Archived.')} onCancel={() => setConfirmArchive(false)}><p>The item stays in the repository for retention but no longer counts towards coverage.</p></ConfirmDialog>}
    </Drawer>
  );
}

// ====================================================================== overview
export function EvidenceOverviewPage({ viewer, go }: { viewer: Viewer; go: (r: RouteId) => void }) {
  const eng = useEngagement();
  const s = useLoader<EvidenceSummary>(eng.id ? () => evidenceApi.summary(eng.id) : null, [eng.id]);
  const cov = useLoader<Coverage[]>(eng.id ? () => evidenceApi.coverage(eng.id) : null, [eng.id]);
  const [family, setFamily] = useState('all');
  const [state, setState] = useState<'all' | 'missing' | 'partial' | 'covered'>('all');
  const d = s.data;
  const rows = useMemo(() => (cov.data ?? []).filter((c) => (family === 'all' || c.requirement_id.startsWith(family)) && (state === 'all' ? c.state !== 'none_required' : c.state === state)), [cov.data, family, state]);
  const byFamily = useMemo(() => { const m = new Map<string, { total: number; covered: number; partial: number; missing: number }>(); for (const c of cov.data ?? []) { if (c.state === 'none_required') continue; const f = c.requirement_id.slice(0, 2); const x = m.get(f) ?? { total: 0, covered: 0, partial: 0, missing: 0 }; x.total++; x[c.state as 'covered' | 'partial' | 'missing']++; m.set(f, x); } return [...m.entries()].sort(); }, [cov.data]);
  return (
    <div className="pg" data-testid="page-evidence-overview">
      <PageHeader icon="evidenceops" title="Evidence overview" lede="How much of the assessor's required evidence exists, is validated, or is still missing — per requirement and per control family — plus what is waiting for review and what expires soon." actions={<EngagementSelect eng={eng} />} />
      {(eng.error || s.error || cov.error) && <p className="note" data-tone="bad" role="alert">{eng.error ?? s.error ?? cov.error}</p>}
      {d && (
        <div className="stats">
          <Stat icon="catalog" value={d.items.total} label="Evidence items" sub={`${d.items.by_status.validated} validated · ${d.items.cui} CUI`} />
          <Stat icon="readiness" value={d.coverage.covered} label="Requirements covered" tone="good" sub={`of ${d.coverage.requirements - d.coverage.none_required} with required evidence`} testId="evidence-covered" />
          <Stat icon="situation" value={d.coverage.missing} label="Missing entirely" tone={d.coverage.missing ? 'bad' : 'good'} sub={`${d.coverage.partial} partial`} />
          <Stat icon="roles" value={d.items.pending_review} label="Awaiting review" tone={d.items.pending_review ? 'warn' : 'good'} />
          <Stat icon="bell" value={d.requests.open} label="Open requests" tone={d.requests.overdue ? 'bad' : undefined} sub={d.requests.overdue ? `${d.requests.overdue} overdue` : undefined} />
          <Stat icon="integrity" value={d.items.expiring_30d} label="Expiring in 30 days" tone={d.items.expiring_30d ? 'warn' : undefined} sub={`catalogue ${d.catalogue.archetypes} archetypes · ${d.catalogue.mappings} mappings · ${d.catalogue.rules} rules`} />
        </div>
      )}
      {byFamily.length > 0 && (
        <section className="card card-pad">
          <h2 className="card-title">Coverage by control family</h2>
          <div className="table-wrap"><table className="tbl" data-testid="coverage-family"><thead><tr><th scope="col">Family</th><th scope="col" className="num">Requirements</th><th scope="col" className="num">Covered</th><th scope="col" className="num">Partial</th><th scope="col" className="num">Missing</th><th scope="col" style={{ width: '30%' }}>Progress</th></tr></thead>
            <tbody>{byFamily.map(([f, x]) => <tr key={f}><td><strong>{f}</strong> <span className="hint">{FAMILY.get(f)}</span></td><td className="num">{x.total}</td><td className="num">{x.covered}</td><td className="num">{x.partial}</td><td className="num">{x.missing}</td><td><div className="bar"><div className="bar-fill" data-tone={x.missing === 0 && x.partial === 0 ? 'good' : x.covered > 0 ? 'warn' : 'bad'} style={{ width: `${(x.covered / x.total) * 100}%` }} /></div></td></tr>)}</tbody></table></div>
        </section>
      )}
      <div className="toolbar">
        <label>Family <select className="select" value={family} onChange={(e) => setFamily(e.target.value)}><option value="all">All</option>{byFamily.map(([f]) => <option key={f} value={f}>{f} · {FAMILY.get(f)}</option>)}</select></label>
        <label>State <select className="select" value={state} onChange={(e) => setState(e.target.value as typeof state)}><option value="all">All with required evidence</option><option value="missing">Missing</option><option value="partial">Partial</option><option value="covered">Covered</option></select></label>
        <span className="grow" />
        <button type="button" className="btn btn-secondary" onClick={() => go('evidence/explorer')}>Explorer</button>
        {canEdit(viewer, 'evidence-collection') && <button type="button" className="btn btn-primary" onClick={() => go('evidence/collect')}>Collect evidence</button>}
      </div>
      {cov.data && rows.length === 0 && <Empty>Nothing in this filter.</Empty>}
      {rows.length > 0 && (
        <div className="table-wrap"><table className="tbl" data-testid="coverage-table"><thead><tr><th scope="col">Requirement</th><th scope="col" className="num">Required</th><th scope="col" className="num">Covered</th><th scope="col" className="num">Pending</th><th scope="col">Missing archetypes</th><th scope="col">State</th></tr></thead>
          <tbody>{rows.map((c) => <tr key={c.requirement_id}><td><strong>{c.requirement_id}</strong><div className="hint" style={{ maxWidth: 420 }}>{PRACTICE.get(c.requirement_id)}</div></td><td className="num">{c.required}</td><td className="num">{c.covered}</td><td className="num">{c.pending}</td><td className="hint">{c.missing.join(', ') || '—'}</td><td><span className="pill" data-tone={c.state === 'covered' ? 'good' : c.state === 'partial' ? 'warn' : 'bad'}>{c.state}</span></td></tr>)}</tbody></table></div>
      )}
    </div>
  );
}

// ====================================================================== explorer (+ validation queue, repository)
export function EvidenceExplorerPage({ viewer, initialStatus }: { viewer: Viewer; initialStatus?: EvidenceStatus }) {
  const eng = useEngagement();
  const cat = useLoader<Catalogue>(eng.id ? () => evidenceApi.catalog(eng.id) : null, [eng.id]);
  const [status, setStatus] = useState<EvidenceStatus | 'all'>(initialStatus ?? 'all');
  const [requirement, setRequirement] = useState('');
  const [q, setQ] = useState('');
  const items = useLoader<EvidenceItem[]>(eng.id ? () => evidenceApi.items(eng.id, { status: status === 'all' ? undefined : status, requirement: requirement || undefined, q: q || undefined }) : null, [eng.id, status, requirement, q]);
  const [open, setOpen] = useState<EvidenceItem | null>(null);
  const [form, setForm] = useState<{ mode: 'edit' | 'version'; item: EvidenceItem } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const rows = items.data ?? [];
  const changed = (m: string) => { setOpen(null); setForm(null); setToast(m); items.reload(); };
  return (
    <div className="pg" data-testid="page-evidence-explorer">
      <PageHeader icon="catalog" title="Evidence explorer" lede="Every evidence item of the engagement with its validation result, review state and version. Reviewers work the 'Awaiting review' filter; the repository view keeps archived versions for retention." actions={<EngagementSelect eng={eng} />} />
      <div className="toolbar">
        <label className="grow"><span className="sr-only">Search</span><input className="input" placeholder="Search title, file, requirement" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label>Requirement <input className="input" list="explorer-req" value={requirement} onChange={(e) => setRequirement(e.target.value.toUpperCase())} placeholder="AC.L1-3.1.1" style={{ width: 150 }} /><datalist id="explorer-req">{REQ_IDS.map((id) => <option key={id} value={id} />)}</datalist></label>
        <label>Status <select className="select" value={status} onChange={(e) => setStatus(e.target.value as EvidenceStatus | 'all')} data-testid="explorer-status"><option value="all">All</option>{(Object.keys(STATUS_LABEL) as EvidenceStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></label>
      </div>
      {(eng.error || items.error) && <p className="note" data-tone="bad" role="alert">{eng.error ?? items.error}</p>}
      {items.data && rows.length === 0 && <Empty>No evidence matches.</Empty>}
      {rows.length > 0 && (
        <div className="table-wrap"><table className="tbl" data-testid="evidence-table"><thead><tr><th scope="col">Evidence</th><th scope="col">Requirements</th><th scope="col">Archetype</th><th scope="col">Kind / source</th><th scope="col">Validation</th><th scope="col">Status</th><th scope="col">Updated</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead>
          <tbody>{rows.map((i) => <tr key={i.id}><td><strong>{i.title}</strong><div className="hint">{i.file_name ?? 'link'} · v{i.version} · {i.classification.toUpperCase()}</div></td><td className="hint">{i.requirement_ids.join(', ')}</td><td className="hint">{i.archetype_code ?? '—'}</td><td className="hint">{KIND_LABEL[i.kind]} · {i.source}</td><td>{i.validation ? <span className="pill" data-tone={i.validation.passed ? (i.validation.strength === 'strong' ? 'good' : 'info') : 'bad'}>{i.validation.passed ? i.validation.strength : 'fails'}</span> : '—'}</td><td><span className="pill" data-tone={STATUS_TONE[i.status]}>{STATUS_LABEL[i.status]}</span></td><td className="hint">{fmt(i.updated_at)}</td><td><button type="button" className="row-btn" onClick={() => setOpen(i)} data-testid={`evidence-open-${i.id}`}>Open</button></td></tr>)}</tbody></table></div>
      )}
      {open && eng.id && cat.data && <ItemDrawer eid={eng.id} item={open} cat={cat.data} viewer={viewer} onChanged={changed} onEdit={() => setForm({ mode: 'edit', item: open })} onVersion={() => setForm({ mode: 'version', item: open })} onClose={() => setOpen(null)} />}
      {form && eng.id && cat.data && <ItemForm eid={eng.id} cat={cat.data} initial={form.item} mode={form.mode} onSaved={changed} onClose={() => setForm(null)} />}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

// ====================================================================== collect (upload + requests)
export function EvidenceCollectPage({ viewer }: { viewer: Viewer }) {
  const eng = useEngagement();
  const cat = useLoader<Catalogue>(eng.id ? () => evidenceApi.catalog(eng.id) : null, [eng.id]);
  const requests = useLoader<EvidenceRequest[]>(eng.id ? () => evidenceApi.requests(eng.id) : null, [eng.id]);
  const runs = useLoader<AssessmentRun[]>(eng.id ? () => assessApi.runs(eng.id) : null, [eng.id]);
  const [adding, setAdding] = useState<{ requirement?: string; archetype?: string | null; request?: EvidenceRequest } | null>(null);
  const [genBusy, setGenBusy] = useState(false);
  const [assignee, setAssignee] = useState('');
  const [due, setDue] = useState('');
  const [onlyGaps, setOnlyGaps] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const editor = canEdit(viewer, 'evidence-collection');
  const archName = (code: string | null) => cat.data?.archetypes.find((a) => a.code === code)?.name ?? code ?? '—';
  const rows = (requests.data ?? []).filter((q) => showDone || q.status === 'open' || q.status === 'submitted');
  const generate = async () => {
    setGenBusy(true);
    setErr(null);
    const latest = runs.data?.[0];
    const r = await evidenceApi.generateRequests(eng.id, { only_gaps_of_run: onlyGaps && latest ? latest.id : undefined, assignee: assignee || null, due_date: due || null });
    setGenBusy(false);
    if (r.ok) { setToast(`${r.data.created} evidence request(s) created.`); requests.reload(); } else setErr(failureText(r));
  };
  const saved = async (m: string) => { setToast(m); setAdding(null); requests.reload(); };
  const linkRequest = async (req: EvidenceRequest, item: EvidenceItem) => { await evidenceApi.updateRequest(eng.id, req.id, { evidence_item_id: item.id }); requests.reload(); };
  return (
    <div className="pg" data-testid="page-evidence-collect">
      <PageHeader icon="evidenceops" title="Collect evidence" lede="Upload or link evidence against a requirement and archetype, or work the request list: one request per required archetype the assessor will expect and nobody has provided yet. Run captures from Stamper / AdminOps arrive here with source = stamper / adminops." actions={<EngagementSelect eng={eng} />} />
      {(eng.error || requests.error || err) && <p className="note" data-tone="bad" role="alert">{eng.error ?? requests.error ?? err}</p>}
      {editor && eng.id && (
        <section className="card card-pad" data-testid="collect-actions">
          <div className="toolbar" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-primary" onClick={() => setAdding({})} data-testid="evidence-add">Add evidence</button>
            <span className="grow" />
            <label>Assignee <input className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="IT admin" style={{ width: 140 }} /></label>
            <label>Due <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
            <label style={{ fontWeight: 400 }}><input type="checkbox" checked={onlyGaps} onChange={(e) => setOnlyGaps(e.target.checked)} disabled={!runs.data?.length} /> only gaps of the latest run</label>
            <button type="button" className="btn btn-secondary" onClick={generate} disabled={genBusy || !cat.data} data-testid="requests-generate">{genBusy ? 'Generating…' : 'Generate requests for missing evidence'}</button>
          </div>
          <p className="hint">Requests come from the published requirement → archetype mapping ({cat.data?.mappings.filter((m) => m.mapping_type === 'required').length ?? '…'} required mappings): one per required archetype without validated or pending evidence.</p>
        </section>
      )}
      <section className="card card-pad">
        <h2 className="card-title">Evidence requests <label style={{ fontWeight: 400, marginLeft: 12 }}><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> show fulfilled / cancelled</label></h2>
        {requests.data && rows.length === 0 && <Empty>No open request.{editor ? ' Generate them from the mapping, or add evidence directly.' : ''}</Empty>}
        {rows.length > 0 && (
          <div className="table-wrap"><table className="tbl" data-testid="requests-table"><thead><tr><th scope="col">Requirement</th><th scope="col">Evidence wanted</th><th scope="col">Assignee</th><th scope="col">Due</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{rows.map((q) => { const overdue = q.status === 'open' && q.due_date && new Date(q.due_date) < new Date(); return (
              <tr key={q.id}><td><strong>{q.requirement_id}</strong><div className="hint" style={{ maxWidth: 360 }}>{PRACTICE.get(q.requirement_id)}</div></td><td>{archName(q.archetype_code)}<div className="hint" style={{ maxWidth: 360 }}>{q.instructions}</div></td><td>{q.assignee ?? '—'}</td><td style={{ color: overdue ? 'var(--co-violation)' : undefined }}>{fmtDate(q.due_date)}</td><td><span className="pill" data-tone={q.status === 'fulfilled' ? 'good' : q.status === 'submitted' ? 'info' : overdue ? 'bad' : q.status === 'cancelled' ? undefined : 'warn'}>{q.status}</span></td>
                <td>{editor && q.status === 'open' && <><button type="button" className="row-btn" onClick={() => setAdding({ requirement: q.requirement_id, archetype: q.archetype_code, request: q })} data-testid={`request-fulfil-${q.id}`}>Provide</button> <button type="button" className="row-btn" onClick={async () => { await evidenceApi.updateRequest(eng.id, q.id, { status: 'cancelled' }); requests.reload(); }}>Cancel</button></>}</td></tr>); })}</tbody></table></div>
        )}
      </section>
      {adding && eng.id && cat.data && <ItemForm eid={eng.id} cat={cat.data} initial={null} mode="new" presetRequirement={adding.requirement} presetArchetype={adding.archetype} onSaved={async (m) => { if (adding.request) { const list = await evidenceApi.items(eng.id, { requirement: adding.request.requirement_id }); const newest = list.ok ? list.data[0] : null; if (newest) await linkRequest(adding.request, newest); } await saved(m); }} onClose={() => setAdding(null)} />}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
