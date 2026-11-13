// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// EvidenceCatalogPage.tsx — Collect Evidence › NIST evidence catalog (2026-11-11).
// The BHD catalog: one row per NIST SP 800-171A examine object, with the
// assessment objectives it evidences. Shows an assessor-style view: for each
// requirement, which examine objects are defined in a released catalog, which
// have evidence (validated / pending / missing), and objective-level coverage.
// Also hosts the batch check BHD's contractor rows go through before release.

import { useEffect, useMemo, useState } from 'react';
import type { RouteId, Viewer } from '../../nav';
import { actionsFor } from '../../lifecycle/rbac';
import { Drawer, Toast } from '../../governed';
import { Empty, PageHeader, Stat } from '../../ui';
import { TableSearch } from '../../tableSearch';
import { engagementLabel, useEngagement } from '../useEngagement';
import { failureText } from '../onboard/onboardApi';
import { evidenceApi, type CatalogFinding, type CatalogOverview, type CatalogRequirement, type CatalogState } from './evidenceApi';

const STATE_LABEL: Record<CatalogState, string> = { covered: 'Evidenced', pending: 'Awaiting review', missing: 'Missing', undefined: 'Not in catalog yet' };
const STATE_TONE: Record<CatalogState, 'good' | 'warn' | 'bad' | undefined> = { covered: 'good', pending: 'warn', missing: 'bad', undefined: undefined };
const FAMILIES = ['AC', 'AT', 'AU', 'CM', 'IA', 'IR', 'MA', 'MP', 'PE', 'PS', 'RA', 'CA', 'SC', 'SI'];

function EngagementSelect({ eng }: { eng: ReturnType<typeof useEngagement> }) {
  return (
    <label>Engagement{' '}
      <select className="select" value={eng.id} onChange={(e) => eng.setId(e.target.value)} data-testid="catalog-engagement">
        {!eng.rows?.length && <option value="">— no engagement —</option>}
        {(eng.rows ?? []).map((e) => <option key={e.id} value={e.id}>{engagementLabel(e)}</option>)}
      </select>
    </label>
  );
}

function Bar({ value, total, tone }: { value: number; total: number; tone?: 'good' | 'warn' }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return <span className="bar bar-inline" title={`${value} of ${total}`} aria-label={`${value} of ${total}`}><span className="bar-fill" data-tone={tone} style={{ width: `${pct}%` }} /></span>;
}

export function EvidenceCatalogPage({ viewer, go }: { viewer: Viewer; go: (r: RouteId) => void }) {
  const eng = useEngagement();
  const canWrite = viewer.kind === 'signed-in' && actionsFor(viewer.role, 'evidence', 'evidence-collection').includes('edit');
  const [ov, setOv] = useState<CatalogOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [family, setFamily] = useState('all');
  const [onlyDefined, setOnlyDefined] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<CatalogRequirement | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [check, setCheck] = useState<{ findings: CatalogFinding[]; ok: number; total: number } | null>(null);
  const [checkBusy, setCheckBusy] = useState(false);
  const [showCheck, setShowCheck] = useState(false);

  useEffect(() => {
    if (!eng.id) { setOv(null); return; }
    let live = true;
    evidenceApi.nistCatalog(eng.id).then((r) => { if (!live) return; if (r.ok) { setOv(r.data); setError(null); } else setError(failureText(r)); });
    return () => { live = false; };
  }, [eng.id]);
  useEffect(() => {
    if (!eng.id || !open) { setDetail(null); return; }
    let live = true;
    evidenceApi.nistRequirement(eng.id, open).then((r) => { if (live && r.ok) setDetail(r.data); });
    return () => { live = false; };
  }, [eng.id, open]);

  const rows = useMemo(() => (ov?.requirements ?? []).filter((r) => (family === 'all' || r.requirement_id.startsWith(family)) && (!onlyDefined || r.examine_defined > 0)), [ov, family, onlyDefined]);
  const totals = useMemo(() => (ov?.requirements ?? []).reduce((a, r) => ({ examine: a.examine + r.examine_total, defined: a.defined + r.examine_defined, covered: a.covered + r.examine_covered, objectives: a.objectives + r.objectives_total, objCovered: a.objCovered + r.objectives_covered, reqDefined: a.reqDefined + (r.examine_defined > 0 ? 1 : 0) }), { examine: 0, defined: 0, covered: 0, objectives: 0, objCovered: 0, reqDefined: 0 }), [ov]);

  const runCheck = async (file: File) => {
    if (!eng.id) return;
    setCheckBusy(true); setCheck(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const rowsIn = Array.isArray(parsed) ? parsed : (parsed as { definitions?: unknown[] }).definitions ?? [];
      const r = await evidenceApi.nistValidate(eng.id, rowsIn);
      if (r.ok) { setCheck(r.data); setShowCheck(true); } else setToast(failureText(r));
    } catch (e) { setToast(`Could not read ${file.name}: ${e instanceof Error ? e.message : String(e)} — JSON only here; CSV goes through npm run catalog:check.`); }
    finally { setCheckBusy(false); }
  };

  return (
    <div className="pg" data-testid="page-evidence-catalog">
      <PageHeader icon="evidenceops" title="NIST evidence catalog" lede="One row per NIST SP 800-171A examine object — what an assessor will ask to see — with the assessment objectives each one evidences. Released by BHD; evidence filed against a definition shows here as coverage per object and per objective." />
      <div className="toolbar">
        <EngagementSelect eng={eng} />
        <select className="select" value={family} onChange={(e) => setFamily(e.target.value)} aria-label="Family"><option value="all">All families</option>{FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}</select>
        <label className="check"><input type="checkbox" checked={onlyDefined} onChange={(e) => setOnlyDefined(e.target.checked)} /> Only requirements with catalog rows</label>
        {canWrite && <label className="btn btn-secondary" style={{ cursor: checkBusy ? 'progress' : 'pointer' }} title="Check a BHD catalog batch (JSON) against the schema and the NIST examine lists before it is released">
          {checkBusy ? 'Checking…' : 'Check a catalog batch'}<input type="file" accept="application/json,.json" hidden disabled={checkBusy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void runCheck(f); e.target.value = ''; }} />
        </label>}
      </div>
      {error && <p className="note" data-tone="bad" role="alert">{error}</p>}
      {ov && (
        <>
          <div className="stats">
            <Stat icon="rules" value={`${ov.definitions}`} label={`catalog rows · release${ov.releases.length === 1 ? '' : 's'} ${ov.releases.map((r) => r.release).join(', ')}`} />
            <Stat icon="requirements" value={`${totals.reqDefined} / 110`} label="requirements with catalog rows" />
            <Stat icon="evidence" value={`${totals.covered} / ${totals.defined}`} label="examine objects evidenced (of those defined)" tone={totals.defined && totals.covered === totals.defined ? 'good' : undefined} />
            <Stat icon="sprs" value={`${totals.objCovered} / ${totals.objectives}`} label="assessment objectives evidenced" />
          </div>
          <p className="hint">Release {ov.releases.map((r) => `${r.release} (${r.date}, ${r.catalog_version}, ${r.definitions} rows)`).join('; ')}. Requirements without rows show their NIST examine list as “not in catalog yet” — the next BHD batches fill them in family order (AC, AT, AU, CM, IA …).</p>
          <TableSearch target='[data-testid="catalog-table"]' />
          <table className="tbl" data-testid="catalog-table">
            <thead><tr><th scope="col">Requirement</th><th scope="col">NIST examine objects</th><th scope="col">In catalog</th><th scope="col">Evidenced</th><th scope="col">Objectives evidenced</th><th scope="col" />
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.requirement_id}>
                  <td><code>{r.requirement_id}</code></td>
                  <td>{r.examine_total}</td>
                  <td>{r.examine_defined ? <span className="pill" data-tone={r.examine_defined === r.examine_total ? 'good' : 'warn'}>{r.examine_defined} / {r.examine_total}</span> : <span className="hint">not yet</span>}</td>
                  <td>{r.examine_defined ? <><Bar value={r.examine_covered} total={r.examine_defined} tone="good" /> <span className="hint">{r.examine_covered} / {r.examine_defined}</span></> : <span className="hint">—</span>}</td>
                  <td><Bar value={r.objectives_covered} total={r.objectives_total} tone="good" /> <span className="hint">{r.objectives_covered} / {r.objectives_total}</span></td>
                  <td><button type="button" className="btn btn-ghost" onClick={() => setOpen(r.requirement_id)}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <Empty>No requirement matches the filter.</Empty>}
        </>
      )}
      {!eng.id && <Empty>Choose an engagement to see its evidence against the catalog.</Empty>}

      {open && (
        <Drawer title={`${open} — examine objects and objectives`} onClose={() => setOpen(null)} wide footer={<button type="button" className="btn btn-secondary" onClick={() => setOpen(null)}>Close</button>}>
          {!detail && <p className="hint">Loading…</p>}
          {detail && (
            <>
              {detail.requirement_text && <p className="note" data-tone="info">{detail.requirement_text}</p>}
              <h3 className="card-title">NIST SP 800-171A examine list ({detail.examine.length})</h3>
              <ol className="cat-examine" data-testid="catalog-examine">
                {detail.examine.map((e) => (
                  <li key={e.examine_index} data-state={e.state}>
                    <div className="cat-examine-head">
                      <span className="cat-examine-n">{e.examine_index}</span>
                      <strong>{e.examine_text}</strong>
                      <span className="pill" data-tone={STATE_TONE[e.state]}>{STATE_LABEL[e.state]}</span>
                    </div>
                    {e.definition && <div className="hint">{e.definition.definition_id} · {e.definition.form_title} · {e.definition.tier === 'must_have' ? 'must have' : 'nice to have'} · {e.definition.production}{e.definition.objective_ids.length ? ` · objectives ${e.definition.objective_ids.map((o) => o.replace(/^.*\[/, '[')).join(' ')}` : ''}</div>}
                    {e.items.length > 0 && <ul className="cat-examine-items">{e.items.map((i) => <li key={i.id}>{i.title ?? i.id.slice(0, 8)} <span className="hint">— {i.status}</span></li>)}</ul>}
                    {e.definition && e.state === 'missing' && canWrite && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { try { localStorage.setItem('ces.evidence.preset', JSON.stringify({ requirement: detail.requirement_id, definition_id: e.definition!.definition_id })); } catch { /* ignore */ } go('evidence/collect'); }}>Collect this</button>}
                  </li>
                ))}
              </ol>
              <h3 className="card-title">Assessment objectives ({detail.objectives.length})</h3>
              <table className="tbl">
                <thead><tr><th scope="col">Objective</th><th scope="col">Statement</th><th scope="col">Bucket</th><th scope="col">Evidence</th></tr></thead>
                <tbody>{detail.objectives.map((o) => <tr key={o.objective_id}><td><code>{o.objective_id.replace(/^.*\[/, '[')}</code></td><td>{o.statement}</td><td title="BHD read-coverage bucket: A = a tenant read plausibly evidences it">{o.bucket}</td><td><span className="pill" data-tone={STATE_TONE[o.state]}>{STATE_LABEL[o.state]}</span> <span className="hint">{o.items.length} item{o.items.length === 1 ? '' : 's'}{o.definitions.length ? ` · via ${o.definitions.length} catalog row${o.definitions.length === 1 ? '' : 's'}` : ''}</span></td></tr>)}</tbody>
              </table>
            </>
          )}
        </Drawer>
      )}

      {showCheck && check && (
        <Drawer title={`Catalog batch check — ${check.ok} of ${check.total} rows clean`} onClose={() => setShowCheck(false)} wide footer={<button type="button" className="btn btn-secondary" onClick={() => setShowCheck(false)}>Close</button>}>
          <p className="note" data-tone={check.findings.some((f) => f.severity === 'fix') ? 'warn' : 'good'}>{check.findings.filter((f) => f.severity === 'fix').length} fix · {check.findings.filter((f) => f.severity === 'tidy').length} tidy. Same checks as <code>npm run catalog:check</code>: schema, NIST text word for word, one document-type id per row, objective ids belong to the requirement, unique ids.</p>
          {check.findings.length === 0 && <Empty>Every row validates — ready to be added as a release.</Empty>}
          {check.findings.length > 0 && <table className="tbl"><thead><tr><th scope="col">Row</th><th scope="col">Id</th><th scope="col">Severity</th><th scope="col">Finding</th><th scope="col">Suggested fix</th></tr></thead><tbody>{check.findings.map((f, i) => <tr key={i}><td>{f.row}</td><td><code>{f.definition_id ?? '—'}</code></td><td><span className="pill" data-tone={f.severity === 'fix' ? 'bad' : 'warn'}>{f.severity}</span></td><td>{f.code} — {f.message}</td><td className="hint">{f.suggested_fix ?? ''}</td></tr>)}</tbody></table>}
        </Drawer>
      )}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
