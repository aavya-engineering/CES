// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// RequirementsPage.tsx — CES-Shared → 110 Requirements (mockup 6).
// The 110 NIST SP 800-171 Rev. 2 requirements are fixed (decision D2);
// platform administrators add metadata to them and, since S1.9, create /
// edit / delete organisation-defined requirements (no SPRS weight) and bulk
// import both from CSV. Every change is a draft a second admin publishes.
import { takePendingSearch } from '../searchHandoff';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRequirementFilter } from '../requirementFilter';
import { FAMILIES, REQUIREMENTS, SPRS_META, type RequirementRow } from '../referenceData';
import { PageHeader, Pager, Stat, Empty, RowsPerPage, SelectBox, SortTh } from '../ui';
import { usePaged, useSelection, useSort, weightTone } from '../paging';
import { OBJECTIVES } from '../objectivesData';
import { ModulePills, PriorityPill } from '../requirementMeta';
import { effectivePriority, metaFor, nistOf, useRequirementMeta, MODULE_LABEL, PRIORITY_LABEL } from '../requirementMetaData';
import { shownData, useGovernedList, useSharedViewer } from '../governedState';
import { DeleteItemDialog, RowActions, StatusPill, Toast } from '../governed';
import { ImportMetaDrawer } from '../requirementCsv';
import { downloadRequirementTemplate, exportRequirementsView, type ExportColumn } from '../requirementCsvData';
import RequirementFormPage, { type RequirementFormMode } from './RequirementFormPage';
import { CalendarDays, ChevronDown, Settings, ChevronUp, Database, Download, FileText, Network, Pencil, Plus, Search, ShieldCheck, Tag, Upload } from 'lucide-react';
import type { CustomRequirement, ItemView, ModuleId, RequirementMeta } from '@/shared/api/sharedApi';

export function RequirementFilters({ f, showWeight = true }: { f: ReturnType<typeof useRequirementFilter>; showWeight?: boolean }) {
  // Retesting #19/#20, Sheet1 #29/#30 (2026-10-29): the same filter card as the
  // 110 Requirements page — big search on top, labelled dropdowns below,
  // "Clear Filters" as a link on the right (mockup m15).
  return (
    <div className="card filter-card" role="search">
      <div className="filter-top">
        <label className="search-input search-input-lg">
          <span className="sr-only">Search requirements</span>
          <Search size={20} aria-hidden="true" />
          <input
            className="input"
            type="search"
            placeholder="Search by requirement ID, title or control family…"
            value={f.q}
            onChange={(e) => f.setQ(e.target.value)}
            data-testid="req-search"
          />
        </label>
      </div>
      <div className="filter-grid filter-grid-inline">
        <label>
          Security Family
          <select className="select" value={f.family} onChange={(e) => f.setFamily(e.target.value)} data-testid="req-family">
            <option value="">All</option>
            {FAMILIES.map((fam) => (
              <option key={fam.abbreviation} value={fam.abbreviation}>
                {fam.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Control Family
          <select className="select" value={f.family} onChange={(e) => f.setFamily(e.target.value)} data-testid="req-family-code">
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
        {showWeight && (
          <label>
            Weight Range
            <select className="select" value={f.weight} onChange={(e) => f.setWeight(e.target.value)} data-testid="req-weight">
              <option value="">All</option>
              <option value="5">5 points</option>
              <option value="3">3 points</option>
              <option value="1">1 point</option>
              <option value="0">Not scored</option>
            </select>
          </label>
        )}
        <button type="button" className="btn btn-link filter-clear" onClick={f.clear}>
          Clear Filters
        </button>
      </div>
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
type HideableCol = 'family' | 'securityFamily' | 'type' | 'priority' | 'modules' | 'weight';
const HIDEABLE: { col: HideableCol; label: string }[] = [
  { col: 'family', label: 'Control Family' },
  { col: 'securityFamily', label: 'Security Family' },
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
        <Settings size={16} aria-hidden="true" /> Columns
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

/** S1.9: an organisation-defined requirement shown as a table row (no SPRS weight, no CMMC level). */
function customRow(d: CustomRequirement): RequirementRow {
  return {
    control_id: d.control_id,
    nist_ref: d.source_section,
    family: d.family,
    family_name: FAMILIES.find((f) => f.abbreviation === d.family)?.name ?? '',
    cmmc_level: 0,
    practice: d.title,
    weight: 0,
    poam_allowed: true,
    unscored: false,
    level: 'L2',
    poam_prohibited: false,
  };
}

/** Retesting #14 (2026-10-29): "Export ▾" split button as in the mockup — CSV now, template in the menu. */
function ExportMenu({ label, onExport, onExportAll, onTemplate, disabled }: { label: string; onExport: () => void; onExportAll: () => void; onTemplate?: () => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="split-btn split-btn-secondary" ref={box}>
      <button type="button" className="btn btn-secondary" onClick={onExport} disabled={disabled} title={disabled ? 'Select requirements to export, or use the menu to export all' : undefined} data-testid="req-export">
        <Download size={16} aria-hidden="true" /> {label}
      </button>
      <button type="button" className="btn btn-secondary split-btn-caret" aria-label="More export options" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="req-export-menu">
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      {open && (
        <div className="split-menu" role="menu">
          <button type="button" role="menuitem" onClick={pick(onExportAll)} data-testid="req-export-all">
            <Download size={16} aria-hidden="true" /> Export all (visible columns)
          </button>
          {onTemplate && (
            <button type="button" role="menuitem" onClick={pick(onTemplate)}>
              <Download size={16} aria-hidden="true" /> Download CSV template
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** S1.9: the "Import / Update" split button — create, bulk import, template. */
function ImportMenu({ onCreate, onImport }: { onCreate: () => void; onImport: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="split-btn" ref={box}>
      <button type="button" className="btn btn-primary" onClick={onImport} data-testid="req-import">
        Import / Update
      </button>
      <button type="button" className="btn btn-primary split-btn-caret" aria-label="More create and import options" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="req-import-menu">
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      {open && (
        <div className="split-menu" role="menu">
          <button type="button" role="menuitem" onClick={pick(onCreate)} data-testid="req-create">
            <Plus size={16} aria-hidden="true" /> Create requirement
          </button>
          <button type="button" role="menuitem" onClick={pick(onImport)} data-testid="req-bulk-import">
            <Upload size={16} aria-hidden="true" /> Bulk import (CSV)
          </button>
          <button type="button" role="menuitem" onClick={pick(downloadRequirementTemplate)} data-testid="req-template">
            <Download size={16} aria-hidden="true" /> Download CSV template
          </button>
        </div>
      )}
    </div>
  );
}

const fmtStamp = (iso: string) => {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function RequirementsPage() {
  const viewer = useSharedViewer();
  const meta = useRequirementMeta();
  const customList = useGovernedList<CustomRequirement>('custom_requirement', viewer.signedIn);
  const customViews = useMemo(() => (customList.s.state === 'ready' ? customList.s.data : []).filter((v) => shownData(v, viewer.canEdit) && v.status !== 'retired'), [customList.s, viewer.canEdit]);
  const customById = useMemo(() => new Map(customViews.map((v) => [v.key, v])), [customViews]);
  const allRows = useMemo(() => [...REQUIREMENTS, ...customViews.map((v) => customRow(shownData(v, viewer.canEdit)!))], [customViews, viewer.canEdit]);
  const f = useRequirementFilter(allRows, takePendingSearch('shared/requirements'));
  const [priority, setPriority] = useState('');
  const [module, setModule] = useState('');
  const [type, setType] = useState('');
  const [showFilters, setShowFilters] = useState(true);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selected, setSelected] = useState<RequirementRow | null>(null);
  const [form, setForm] = useState<RequirementFormMode | null>(null);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ kind: 'requirement_meta' | 'custom_requirement'; view: ItemView<unknown>; name: string } | null>(null);
  const isCustom = (id: string) => customById.has(id);
  const metaOf = (id: string): RequirementMeta | null => {
    const c = customById.get(id);
    if (c) {
      const d = shownData(c, viewer.canEdit)!;
      return { control_id: d.control_id, priority: d.priority, modules: d.modules, implementation_guidance: d.implementation_guidance };
    }
    return metaFor(meta.byId.get(id), viewer.canEdit);
  };
  // Only the priority an administrator set (decision 2026-10-27: no weight default).
  const prio = (r: RequirementRow) => effectivePriority(metaOf(r.control_id));
  const typeOf = (r: RequirementRow) => (isCustom(r.control_id) ? 'Custom' : nistOf(r.nist_ref)?.requirement_type ?? '—');

  const rows = useMemo(
    () =>
      f.filtered.filter((r) => {
        const m = metaOf(r.control_id);
        return (
          (!priority || (priority === 'unset' ? !m?.priority : prio(r) === priority)) &&
          (!module || (m?.modules ?? []).includes(module as ModuleId)) &&
          (!type || typeOf(r) === type)
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f.filtered, priority, module, type, meta.byId, customById, viewer.canEdit]
  );
  const { sort, onSort, sorted } = useSort<RequirementRow, ReqCol>(rows, (row, col) => {
    switch (col) {
      case 'id':
        return isCustom(row.control_id) ? `~${row.control_id}` : row.nist_ref;
      case 'title':
        return row.practice;
      case 'family':
        return row.family;
      case 'type':
        return typeOf(row);
      case 'priority':
        return prio(row) ? PRIORITY_RANK[prio(row)!] : 9;
      case 'weight':
        return isCustom(row.control_id) ? -1 : row.weight;
    }
  });
  const paged = usePaged(sorted, rowsPerPage);
  const pick = useSelection(rows.map((row) => row.control_id));
  const [hidden, setHidden] = useState<Set<HideableCol>>(() => new Set<HideableCol>(['type', 'weight']));
  const show = (c: HideableCol) => !hidden.has(c);
  const exportRows = pick.some ? sorted.filter((row) => pick.sel.has(row.control_id)) : sorted;
  // QA 2026-10-29 #5: the CSV carries exactly the columns shown in the table, in table order.
  const exportCols: ExportColumn[] = (['id', 'title', 'family', 'securityFamily', 'type', 'priority', 'modules', 'weight'] as const).filter(
    (c) => c === 'id' || c === 'title' || show(c as HideableCol)
  );
  const withPriority = allRows.filter((r) => metaOf(r.control_id)?.priority).length;
  const drafts = [...meta.byId.values(), ...customViews].filter((v) => v.draft).length;
  const stamps = [...meta.byId.values(), ...customViews]
    .flatMap((v) => [v.published?.published_at, viewer.canEdit ? v.draft?.updated_at : null])
    .filter((x): x is string => !!x)
    .sort();
  const lastUpdated = stamps.length ? stamps[stamps.length - 1] : SPRS_META.generated_on;
  const options = useMemo(() => allRows.map((r) => ({ id: r.control_id, title: r.practice })), [allRows]);
  const clearAll = () => {
    f.clear();
    setPriority('');
    setModule('');
    setType('');
  };
  const done = (msg: string) => {
    setToast(msg);
    setForm(null);
    setImporting(false);
    void meta.reload();
    void customList.reload();
  };
  const edit = (r: RequirementRow) => {
    const c = customById.get(r.control_id);
    setForm(c ? { mode: 'edit-custom', view: c } : { mode: 'edit-base', row: r, view: meta.byId.get(r.control_id) });
  };

  if (form) {
    return <RequirementFormPage form={form} options={options} onBack={() => setForm(null)} onSaved={done} />;
  }

  return (
    <div className="pg" data-testid="page-requirements">
      <PageHeader
        icon={<FileText size={30} aria-hidden="true" />}
        title="110 Requirements"
        lede="CMMC Level 2 (NIST SP 800-171 Rev. 2) control requirements used across all CES modules. This reference data is used for readiness assessment, scoring and evidence validation."
        actions={
          <div className="pg-head-buttons">
            <div className="source-box">
              <strong>NIST SP 800-171 Rev. 2</strong>
              <span>Source Standard</span>
            </div>
            <div className="pg-meta" data-testid="req-last-updated">
              Last updated
              <strong>{fmtStamp(lastUpdated)}</strong>
            </div>
            {/* S1.10: Create stays visible — demo feedback said create / import were "missing" when only in the caret menu. */}
            {viewer.canEdit && (
              <button type="button" className="btn btn-secondary" onClick={() => setForm({ mode: 'create' })} data-testid="req-create-visible">
                <Plus size={16} aria-hidden="true" /> Create Requirement
              </button>
            )}
            {viewer.canEdit && <ImportMenu onCreate={() => setForm({ mode: 'create' })} onImport={() => setImporting(true)} />}
          </div>
        }
      />
      <div className="stats stats-6">
        <Stat icon={<FileText size={24} />} value={REQUIREMENTS.length} label="Total Requirements" sub={customViews.length ? `+${customViews.length} organisation-defined` : undefined} testId="stat-req-total" />
        <Stat icon={<ShieldCheck size={24} />} value={FAMILIES.length} label="Security Families" tone="good" />
        <Stat icon={<Network size={24} />} value={REQUIREMENTS.filter((r) => r.cmmc_level === 1).length} label="Level 1 Requirements" tone="muster" />
        <Stat icon={<Tag size={24} />} value={3} label="Priority Levels" sub={viewer.signedIn ? `High / Medium / Low · ${withPriority} set` : 'High / Medium / Low'} tone="warn" testId="stat-req-priority" />
        <Stat icon={<Database size={24} />} value="Rev. 2" label="Source Version" sub="NIST SP 800-171" />
        <Stat icon={<CalendarDays size={24} />} value={fmtStamp(lastUpdated).split(',').slice(0, 2).join(',')} label="Last Updated" sub={viewer.canEdit && drafts ? `${drafts} draft${drafts === 1 ? '' : 's'} to publish` : 'Reference Data'} testId="stat-req-drafts" />
      </div>

      <div className="card filter-card" role="search">
        <div className="filter-top">
          <label className="search-input search-input-lg">
            <span className="sr-only">Search requirements</span>
            <Search size={20} aria-hidden="true" />
            <input className="input" type="search" placeholder="Search requirements by ID, title or description…" value={f.q} onChange={(e) => f.setQ(e.target.value)} data-testid="req-search" />
          </label>
          <button type="button" className="btn btn-link" onClick={clearAll}>
            Clear Filters
          </button>
          <button type="button" className="btn btn-secondary" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)} data-testid="req-toggle-filters">
            {showFilters ? 'Hide Filters' : 'Show Filters'} {showFilters ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
          </button>
        </div>
        {showFilters && (
          <div className="filter-grid">
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
                <option value="unset">Default (from SPRS weight)</option>
              </select>
            </label>
            <label>
              Requirement Type
              <select className="select" value={type} onChange={(e) => setType(e.target.value)} data-testid="req-type">
                <option value="">All</option>
                <option value="Basic">Basic</option>
                <option value="Derived">Derived</option>
                <option value="Custom">Organisation-defined</option>
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
          </div>
        )}
      </div>
      {meta.error && (
        <p className="note" data-tone="warn" role="alert">
          Metadata could not be loaded: {meta.error}
        </p>
      )}

      <div className={selected ? 'split' : undefined}>
        <section className="card" aria-label="Requirements">
          <div className="card-bar">
            <strong data-testid="req-count">
              {rows.length} requirement{rows.length === 1 ? '' : 's'}
            </strong>
            <span className="card-bar-actions">
              <ExportMenu
                label={pick.some ? `Export ${pick.sel.size} selected` : 'Export'}
                disabled={!pick.some}
                onExport={() => exportRequirementsView(exportRows, metaOf, exportCols)}
                onExportAll={() => exportRequirementsView(sorted, metaOf, exportCols)}
                onTemplate={viewer.canEdit ? downloadRequirementTemplate : undefined}
              />
              <ColumnChooser hidden={hidden} setHidden={setHidden} />
            </span>
          </div>
          <div className="table-wrap">
            <table className="tbl tbl-req" data-testid="req-table">
              <thead>
                <tr>
                  <th scope="col" className="col-check">
                    <SelectBox checked={pick.all} indeterminate={pick.some} onChange={pick.toggleAll} label="Select all requirements" />
                  </th>
                  <SortTh label="Req ID" col="id" sort={sort} onSort={onSort} />
                  <SortTh label="Requirement Title" col="title" sort={sort} onSort={onSort} />
                  {show('family') && <SortTh label="Control Family" col="family" sort={sort} onSort={onSort} />}
                  {show('securityFamily') && <th scope="col">Security Family</th>}
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
                  const custom = customById.get(r.control_id);
                  const v = custom ?? meta.byId.get(r.control_id);
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
                      <td>
                        <span className="clamp-1" title={r.practice}>
                          {r.practice}
                        </span>
                      </td>
                      {show('family') && (
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {r.family} - {r.family_name}
                        </td>
                      )}
                      {show('securityFamily') && <td style={{ whiteSpace: 'nowrap' }}>{r.family_name}</td>}
                      {show('type') && <td>{custom ? <span className="pill" data-tone="info">Custom</span> : typeOf(r)}</td>}
                      {show('priority') && <td><PriorityPill meta={m} /></td>}
                      {show('modules') && <td>{viewer.signedIn ? <ModulePills meta={m} /> : '—'}</td>}
                      {show('weight') && (
                        <td className="num">
                          {custom ? (
                            <span className="muted" title="Organisation-defined: not part of the SPRS score">
                              —
                            </span>
                          ) : (
                            <span className="pill" data-tone={weightTone(r.weight)}>
                              {r.weight}
                            </span>
                          )}
                        </td>
                      )}
                      {viewer.canEdit && (
                        <td>
                          <RowActions
                            label={r.control_id}
                            testId={`req-actions-${r.control_id}`}
                            actions={[
                              { label: 'View', onSelect: () => setSelected(r) },
                              { label: 'Edit', onSelect: () => edit(r), testId: `req-edit-${r.control_id}` },
                              ...(custom
                                ? [{ label: 'Delete', tone: 'danger' as const, onSelect: () => setDeleting({ kind: 'custom_requirement', view: custom, name: `${r.control_id} ${r.practice}` }), testId: `req-delete-${r.control_id}` }]
                                : v
                                  ? [{ label: 'Clear metadata', tone: 'danger' as const, onSelect: () => setDeleting({ kind: 'requirement_meta', view: v, name: `${r.control_id} metadata` }), testId: `req-delete-${r.control_id}` }]
                                  : []),
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
          isCustom(selected.control_id) ? (
            <CustomDetail view={customById.get(selected.control_id)!} canEdit={viewer.canEdit} onClose={() => setSelected(null)} onEdit={viewer.canEdit ? () => edit(selected) : undefined} />
          ) : (
            <RequirementDetail
              row={selected}
              onClose={() => setSelected(null)}
              meta={viewer.signedIn ? metaOf(selected.control_id) : undefined}
              onEdit={viewer.canEdit ? () => edit(selected) : undefined}
            />
          )
        )}
      </div>
      {importing && <ImportMetaDrawer existing={meta.byId} customExisting={customById} onClose={() => setImporting(false)} onDone={done} />}
      {deleting && (
        <DeleteItemDialog
          kind={deleting.kind}
          view={deleting.view}
          name={deleting.name}
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

function CustomDetail({ view, canEdit, onClose, onEdit }: { view: ItemView<CustomRequirement>; canEdit: boolean; onClose: () => void; onEdit?: () => void }) {
  const d = shownData(view, canEdit)!;
  return (
    <aside className="card card-pad detail" aria-label="Requirement details" data-testid="req-detail">
      <div className="detail-head">
        <div>
          <span className="pill" data-tone="info">
            Organisation-defined · not scored
          </span>
          <h2>{d.control_id}</h2>
        </div>
        <button type="button" className="icon-x" onClick={onClose} aria-label="Close details">
          ×
        </button>
      </div>
      <p>
        <strong>{d.title}</strong>
      </p>
      <p>{d.description}</p>
      {onEdit && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>
          <Pencil size={14} aria-hidden="true" /> Edit
        </button>
      )}
      <dl className="kv">
        <dt>Status</dt>
        <dd>
          <StatusPill view={view} />
        </dd>
        <dt>Family</dt>
        <dd>
          {d.family} — {FAMILIES.find((f) => f.abbreviation === d.family)?.name}
        </dd>
        <dt>Priority</dt>
        <dd>{PRIORITY_LABEL[d.priority]}</dd>
        <dt>Source</dt>
        <dd>
          {d.source_standard}
          {d.source_section ? ` · ${d.source_section}` : ''}
        </dd>
        <dt>Used in modules</dt>
        <dd>{d.modules.map((m) => MODULE_LABEL[m]).join(', ') || '—'}</dd>
        {d.assessment_criteria && (
          <>
            <dt>Assessment criteria</dt>
            <dd>{d.assessment_criteria}</dd>
          </>
        )}
        {!!d.related?.length && (
          <>
            <dt>Related</dt>
            <dd>{d.related.join(', ')}</dd>
          </>
        )}
        {d.effective_date && (
          <>
            <dt>Effective</dt>
            <dd>{d.effective_date}</dd>
          </>
        )}
      </dl>
    </aside>
  );
}
