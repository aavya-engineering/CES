// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// RequirementsPage.tsx — UI-02: CES-Shared → 110 Requirements (mockup 3).
// Real reference data, read-only. The mockup's "Priority", "Assessment status"
// and "Add / Import" are not shown: no such data or editing exists in CES
// (one canonical copy, PRD SH-FR-04; doc 14 M1–M5, M9).
import { takePendingSearch } from '../searchHandoff';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRequirementFilter } from '../requirementFilter';
import { FAMILIES, REQUIREMENTS, SPRS_META, type RequirementRow } from '../referenceData';
import { PageHeader, Pager, Stat, Empty, RowsPerPage, SelectBox, SortTh } from '../ui';
import { usePaged, useSelection, useSort, weightTone } from '../paging';
import { OBJECTIVES } from '../objectivesData';
import { EditRequirementDrawer, ModulePills, PriorityPill } from '../requirementMeta';
import { metaFor, nistOf, useRequirementMeta, MODULE_LABEL, PRIORITY_LABEL } from '../requirementMetaData';
import { useSharedViewer } from '../governedState';
import { DeleteItemDialog, RowActions, Toast } from '../governed';
import { ImportMetaDrawer } from '../requirementCsv';
import { exportRequirementsCsv } from '../requirementCsvData';
import type { ItemView, ModuleId, RequirementMeta } from '@/shared/api/sharedApi';

export function RequirementFilters({ f, showWeight = true }: { f: ReturnType<typeof useRequirementFilter>; showWeight?: boolean }) {
  return (
    <div className="card toolbar" role="search">
      <label className="grow">
        Search
        <input
          className="input"
          type="search"
          placeholder="Requirement ID, NIST reference or text"
          value={f.q}
          onChange={(e) => f.setQ(e.target.value)}
          data-testid="req-search"
        />
      </label>
      <label>
        Family
        <select className="select" value={f.family} onChange={(e) => f.setFamily(e.target.value)} data-testid="req-family">
          <option value="">All families</option>
          {FAMILIES.map((fam) => (
            <option key={fam.abbreviation} value={fam.abbreviation}>
              {fam.abbreviation} — {fam.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        CMMC level
        <select className="select" value={f.level} onChange={(e) => f.setLevel(e.target.value)} data-testid="req-level">
          <option value="">Level 1 and 2</option>
          <option value="1">Level 1</option>
          <option value="2">Level 2</option>
        </select>
      </label>
      {showWeight && (
        <label>
          SPRS weight
          <select className="select" value={f.weight} onChange={(e) => f.setWeight(e.target.value)} data-testid="req-weight">
            <option value="">All weights</option>
            <option value="5">5 points</option>
            <option value="3">3 points</option>
            <option value="1">1 point</option>
            <option value="0">0 (not scored)</option>
          </select>
        </label>
      )}
      <button type="button" className="btn btn-ghost" onClick={f.clear}>
        Clear filters
      </button>
    </div>
  );
}

export function RequirementDetail({
  row,
  onClose,
  meta,
  onEdit,
}: {
  row: RequirementRow;
  onClose: () => void;
  meta?: RequirementMeta | null;
  onEdit?: () => void;
}) {
  const n = nistOf(row.nist_ref);
  return (
    <aside className="card card-pad detail" aria-label="Requirement details" data-testid="req-detail">
      <div className="detail-head">
        <div>
          <span className="pill" data-tone={weightTone(row.weight)}>
            {row.unscored ? 'Not scored' : `SPRS weight ${row.weight}`}
          </span>
          <h2>{row.control_id}</h2>
        </div>
        <button type="button" className="icon-x" onClick={onClose} aria-label="Close details">
          ×
        </button>
      </div>
      <p>{row.practice}</p>
      {onEdit && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit} data-testid="req-detail-edit">
          ✎ Edit metadata
        </button>
      )}
      <dl className="kv">
        <dt>NIST SP 800-171</dt>
        <dd>{row.nist_ref} (Rev. 2)</dd>
        {n && (
          <>
            <dt>NIST text</dt>
            <dd data-testid="req-detail-nist">{n.nist_text}</dd>
            <dt>Requirement type</dt>
            <dd>{n.requirement_type}</dd>
          </>
        )}
        {meta !== undefined && (
          <>
            <dt>Priority</dt>
            <dd>
              <PriorityPill meta={meta} />
            </dd>
            <dt>Used in modules</dt>
            <dd>
              <ModulePills meta={meta} />
            </dd>
            {meta?.implementation_guidance && (
              <>
                <dt>Implementation guidance</dt>
                <dd>{meta.implementation_guidance}</dd>
              </>
            )}
          </>
        )}
        <dt>Family</dt>
        <dd>
          {row.family} — {row.family_name}
        </dd>
        <dt>CMMC level</dt>
        <dd>Level {row.cmmc_level}</dd>
        <dt>SPRS deduction if not met</dt>
        <dd>{row.unscored ? 'None — but no score can be produced without it' : `${row.weight} point${row.weight === 1 ? '' : 's'}`}</dd>
        {row.partial && (
          <>
            <dt>If partly met</dt>
            <dd data-testid="req-detail-partial">
              {row.partial.weight} points — {row.partial.condition}
              {row.partial.poamAllowedAtPartial ? ' (may go on a POA&M when partly met)' : ''}
            </dd>
          </>
        )}
        <dt>Can go on a POA&amp;M</dt>
        <dd>{row.poam_prohibited ? 'No — never (on the methodology’s prohibited list)' : row.poam_allowed ? 'Yes' : 'No'}</dd>
      </dl>
      <ObjectiveList controlId={row.control_id} />
      {row.note && (
        <p className="note" style={{ marginTop: 14 }}>
          {row.note}
        </p>
      )}
    </aside>
  );
}

/** R1: the requirement's NIST SP 800-171A objectives, shown in its detail panel. */
function ObjectiveList({ controlId }: { controlId: string }) {
  const list = OBJECTIVES.filter((o) => o.controlId === controlId);
  return (
    <section aria-label="Assessment objectives" style={{ marginTop: 14 }} data-testid="req-detail-objectives">
      <h3 className="detail-sub">Assessment objectives ({list.length})</h3>
      <ol className="obj-list">
        {list.map((o) => (
          <li key={o.objectiveId}>
            <span className="obj-letter">[{o.letter}]</span> {o.description}
          </li>
        ))}
      </ol>
    </section>
  );
}

type ReqCol = 'id' | 'title' | 'family' | 'type' | 'priority' | 'weight';
type HideableCol = 'family' | 'type' | 'priority' | 'modules' | 'weight';
const HIDEABLE: { col: HideableCol; label: string }[] = [
  { col: 'family', label: 'Control Family' },
  { col: 'type', label: 'Type' },
  { col: 'priority', label: 'Priority' },
  { col: 'modules', label: 'Used In Modules' },
  { col: 'weight', label: 'Weight' },
];
const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

/** S1.4: the wireframe "Columns" button — show or hide optional columns. */
function ColumnChooser({ hidden, setHidden }: { hidden: Set<HideableCol>; setHidden: (s: Set<HideableCol>) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <span className="col-chooser" ref={box}>
      <button type="button" className="btn btn-secondary" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="req-columns">
        ⚙ Columns
      </button>
      {open && (
        <div className="col-chooser-menu" role="group" aria-label="Visible columns" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
          {HIDEABLE.map(({ col, label }) => (
            <label key={col}>
              <input
                type="checkbox"
                checked={!hidden.has(col)}
                onChange={(e) => {
                  const next = new Set(hidden);
                  if (e.target.checked) next.delete(col);
                  else next.add(col);
                  setHidden(next);
                }}
                data-testid={`col-toggle-${col}`}
              />{' '}
              {label}
            </label>
          ))}
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      )}
    </span>
  );
}

export default function RequirementsPage() {
  const viewer = useSharedViewer();
  const meta = useRequirementMeta();
  const f = useRequirementFilter(REQUIREMENTS, takePendingSearch('shared/requirements'));
  const [priority, setPriority] = useState('');
  const [module, setModule] = useState('');
  const [type, setType] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selected, setSelected] = useState<RequirementRow | null>(null);
  const [editing, setEditing] = useState<RequirementRow | null>(null);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ItemView<RequirementMeta> | null>(null);
  const metaOf = (id: string) => metaFor(meta.byId.get(id), viewer.canEdit);

  const rows = useMemo(
    () =>
      f.filtered.filter((r) => {
        const m = metaOf(r.control_id);
        return (
          (!priority || (priority === 'unset' ? !m?.priority : m?.priority === priority)) &&
          (!module || (m?.modules ?? []).includes(module as ModuleId)) &&
          (!type || nistOf(r.nist_ref)?.requirement_type === type)
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f.filtered, priority, module, type, meta.byId, viewer.canEdit]
  );
  const { sort, onSort, sorted } = useSort<RequirementRow, ReqCol>(rows, (row, col) => {
    const m = metaOf(row.control_id);
    switch (col) {
      case 'id':
        return row.nist_ref;
      case 'title':
        return row.practice;
      case 'family':
        return row.family;
      case 'type':
        return nistOf(row.nist_ref)?.requirement_type ?? '';
      case 'priority':
        return m?.priority ? PRIORITY_RANK[m.priority] : 9;
      case 'weight':
        return row.weight;
    }
  });
  const paged = usePaged(sorted, rowsPerPage);
  const pick = useSelection(rows.map((row) => row.control_id));
  const [hidden, setHidden] = useState<Set<HideableCol>>(new Set());
  const show = (c: HideableCol) => !hidden.has(c);
  const exportRows = pick.some ? sorted.filter((row) => pick.sel.has(row.control_id)) : sorted;
  const withPriority = REQUIREMENTS.filter((r) => metaOf(r.control_id)?.priority).length;
  const drafts = [...meta.byId.values()].filter((v) => v.draft).length;
  const clearAll = () => {
    f.clear();
    setPriority('');
    setModule('');
    setType('');
  };
  const done = (msg: string) => {
    setToast(msg);
    setEditing(null);
    setImporting(false);
    void meta.reload();
  };

  return (
    <div className="pg" data-testid="page-requirements">
      <PageHeader
        icon="▤"
        title="110 Requirements"
        lede="CMMC Level 2 (NIST SP 800-171 Rev. 2) control requirements used across all CES modules. This reference data is used for readiness assessment, scoring and evidence validation."
        actions={
          <div className="pg-head-buttons">
            <div className="pg-meta">
              <strong>NIST SP 800-171 Rev. 2</strong>
              Source Standard
            </div>
            {viewer.canEdit && (
              <button type="button" className="btn btn-primary" onClick={() => setImporting(true)} data-testid="req-import">
                Import / Update
              </button>
            )}
          </div>
        }
      />
      <div className="stats stats-6">
        <Stat icon="▤" value={REQUIREMENTS.length} label="Total Requirements" testId="stat-req-total" />
        <Stat icon="⛨" value={FAMILIES.length} label="Security Families" tone="good" />
        <Stat icon="L1" value={REQUIREMENTS.filter((r) => r.cmmc_level === 1).length} label="Level 1 Requirements" sub={`${REQUIREMENTS.filter((r) => r.cmmc_level === 2).length} at Level 2`} tone="muster" />
        <Stat icon="⚑" value={viewer.signedIn ? withPriority : '—'} label="Priority Set" sub={viewer.signedIn ? 'High / Medium / Low' : 'Sign in to see metadata'} tone="warn" testId="stat-req-priority" />
        <Stat icon="⛁" value="Rev. 2" label="Source Version" sub="NIST SP 800-171" />
        <Stat icon="✎" value={viewer.canEdit ? drafts : SPRS_META.generated_on} label={viewer.canEdit ? 'Drafts to publish' : 'Last Updated'} sub={viewer.canEdit ? 'Metadata changes' : 'Reference Data'} testId="stat-req-drafts" />
      </div>

      <div className="card toolbar toolbar-grid" role="search">
        <label className="grow span-all">
          <span className="sr-only">Search</span>
          <input className="input" type="search" placeholder="Search requirements by ID, title or description…" value={f.q} onChange={(e) => f.setQ(e.target.value)} data-testid="req-search" />
        </label>
        <label>
          Control Family
          <select className="select" value={f.family} onChange={(e) => f.setFamily(e.target.value)} data-testid="req-family">
            <option value="">All</option>
            {FAMILIES.map((fam) => (
              <option key={fam.abbreviation} value={fam.abbreviation}>
                {fam.abbreviation} - {fam.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          CMMC Level
          <select className="select" value={f.level} onChange={(e) => f.setLevel(e.target.value)} data-testid="req-level">
            <option value="">All</option>
            <option value="1">Level 1</option>
            <option value="2">Level 2</option>
          </select>
        </label>
        <label>
          Priority
          <select className="select" value={priority} onChange={(e) => setPriority(e.target.value)} disabled={!viewer.signedIn} data-testid="req-priority">
            <option value="">All</option>
            {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
            <option value="unset">Not set</option>
          </select>
        </label>
        <label>
          Requirement Type
          <select className="select" value={type} onChange={(e) => setType(e.target.value)} data-testid="req-type">
            <option value="">All</option>
            <option value="Basic">Basic</option>
            <option value="Derived">Derived</option>
          </select>
        </label>
        <label>
          Used In Module
          <select className="select" value={module} onChange={(e) => setModule(e.target.value)} disabled={!viewer.signedIn} data-testid="req-module">
            <option value="">All</option>
            {Object.entries(MODULE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn-ghost" onClick={clearAll}>
          Clear Filters
        </button>
      </div>
      {meta.error && (
        <p className="note" data-tone="warn" role="alert">
          Metadata could not be loaded: {meta.error}
        </p>
      )}

      <div className={selected ? 'split' : undefined}>
        <section className="card" aria-label="Requirements">
          <div className="card-bar">
            <strong data-testid="req-count">{rows.length} requirements</strong>
            <span className="card-bar-actions">
              <button type="button" className="btn btn-secondary" onClick={() => exportRequirementsCsv(exportRows, metaOf)} data-testid="req-export">
                ⭳ {pick.some ? `Export ${pick.sel.size} selected` : 'Export'}
              </button>
              <ColumnChooser hidden={hidden} setHidden={setHidden} />
            </span>
          </div>
          <div className="table-wrap">
            <table className="tbl" data-testid="req-table">
              <thead>
                <tr>
                  <th scope="col" className="col-check">
                    <SelectBox checked={pick.all} indeterminate={pick.some} onChange={pick.toggleAll} label="Select all requirements" />
                  </th>
                  <SortTh label="Req ID" col="id" sort={sort} onSort={onSort} />
                  <SortTh label="Requirement Title" col="title" sort={sort} onSort={onSort} />
                  {show('family') && <SortTh label="Control Family" col="family" sort={sort} onSort={onSort} />}
                  {show('type') && <SortTh label="Type" col="type" sort={sort} onSort={onSort} />}
                  {show('priority') && <SortTh label="Priority" col="priority" sort={sort} onSort={onSort} />}
                  {show('modules') && <th scope="col">Used In Modules</th>}
                  {show('weight') && <SortTh label="Weight" col="weight" sort={sort} onSort={onSort} className="num" />}
                  {viewer.canEdit && <th scope="col">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((r) => {
                  const m = metaOf(r.control_id);
                  const v = meta.byId.get(r.control_id);
                  return (
                    <tr key={r.control_id} aria-selected={selected?.control_id === r.control_id}>
                      <td className="col-check">
                        <SelectBox checked={pick.sel.has(r.control_id)} onChange={(on) => pick.toggle(r.control_id, on)} label={`Select ${r.control_id}`} />
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button type="button" className="row-btn" onClick={() => setSelected(r)}>
                          {r.control_id}
                        </button>
                        {v?.draft && viewer.canEdit && (
                          <span className="pill" data-tone="warn" style={{ marginLeft: 6 }}>
                            Draft
                          </span>
                        )}
                      </td>
                      <td>{r.practice}</td>
                      {show('family') && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {r.family} - {r.family_name}
                        </td>
                      )}
                      {show('type') && <td>{nistOf(r.nist_ref)?.requirement_type ?? '—'}</td>}
                      {show('priority') && <td>{viewer.signedIn ? <PriorityPill meta={m} /> : '—'}</td>}
                      {show('modules') && <td>{viewer.signedIn ? <ModulePills meta={m} /> : '—'}</td>}
                      {show('weight') && (
                        <td className="num">
                          <span className="pill" data-tone={weightTone(r.weight)}>
                            {r.weight}
                          </span>
                        </td>
                      )}
                      {viewer.canEdit && (
                        <td>
                          <RowActions
                            label={r.control_id}
                            testId={`req-actions-${r.control_id}`}
                            actions={[
                              { label: 'View', onSelect: () => setSelected(r) },
                              { label: 'Edit', onSelect: () => setEditing(r), testId: `req-edit-${r.control_id}` },
                              ...(v ? [{ label: 'Clear metadata', tone: 'danger' as const, onSelect: () => setDeleting(v), testId: `req-delete-${r.control_id}` }] : []),
                            ]}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <Empty>No requirement matches these filters.</Empty>}
          <div className="pager-row">
            <Pager {...paged} noun="requirements" />
            <RowsPerPage value={rowsPerPage} onChange={setRowsPerPage} options={[10, 25, 50, 110]} />
          </div>
        </section>
        {selected && (
          <RequirementDetail
            row={selected}
            onClose={() => setSelected(null)}
            meta={viewer.signedIn ? metaOf(selected.control_id) : undefined}
            onEdit={viewer.canEdit ? () => setEditing(selected) : undefined}
          />
        )}
      </div>
      {editing && <EditRequirementDrawer row={editing} view={meta.byId.get(editing.control_id)} onClose={() => setEditing(null)} onSaved={done} />}
      {importing && <ImportMetaDrawer existing={meta.byId} onClose={() => setImporting(false)} onDone={done} />}
      {deleting && (
        <DeleteItemDialog
          kind="requirement_meta"
          view={deleting}
          name={`${deleting.key} metadata`}
          onCancel={() => setDeleting(null)}
          onDone={(msg) => {
            setDeleting(null);
            done(msg);
          }}
        />
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
