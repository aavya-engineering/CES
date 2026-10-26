// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// MappingPage.tsx — S1.2: CES-Shared → Requirement-to-Evidence Mapping, signed
// in (mockup "Requirement-to-Evidence Mapping"). Seeded from the Fundamental
// Requirements Store evidence_minimum (450 mappings over the 110 requirements;
// BHD P1-9). Strength, rationale and truth tag are empty in the source and are
// filled in here as drafts that a second administrator publishes.
import { takePendingSearch } from '../../searchHandoff';
import { useMemo, useState } from 'react';
import { sharedApi, type Archetype, type ItemView, type Mapping, type Method } from '@/shared/api/sharedApi';
import { describeFailure, matchesText, shownData, statusOf, useGovernedList, useItemDetail, useSharedViewer } from '../../governedState';
import { DeleteItemDialog, Drawer, GovernanceBar, LinesInput, RowActions, StatusPill, Toast, VersionHistory } from '../../governed';
import { domainLabel } from '../../evidenceData';
import { Empty, PageHeader, Pager, RowsPerPage, SortTh, Stat } from '../../ui';
import { usePaged, useSort } from '../../paging';
import { FAMILIES, REQUIREMENTS } from '../../referenceData';

const METHODS: Method[] = ['examine', 'interview', 'test'];
const METHOD_LABEL: Record<Method, string> = { examine: 'Examine', interview: 'Interview', test: 'Test' };
const STRENGTH_TONE = { strong: 'good', adequate: 'info', weak: 'warn' } as const;
const STRENGTH_RANK = { strong: 0, adequate: 1, weak: 2 } as const;
const REQ = new Map(REQUIREMENTS.map((r) => [r.control_id, r]));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function MappingPage() {
  const viewer = useSharedViewer();
  const { s, reload } = useGovernedList<Mapping>('mapping');
  const arch = useGovernedList<Archetype>('archetype');
  const archetypes = useMemo(() => new Map((arch.s.state === 'ready' ? arch.s.data : []).map((v) => [v.key, v])), [arch.s]);
  const [q, setQ] = useState(() => takePendingSearch('shared/mapping'));
  const [level, setLevel] = useState('');
  const [family, setFamily] = useState('');
  const [archetype, setArchetype] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ view: ItemView<Mapping> | null } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ItemView<Mapping> | null>(null);
  const [bump, setBump] = useState(0);

  const items = useMemo(() => (s.state === 'ready' ? s.data : []), [s]);
  const rows = useMemo(
    () =>
      items
        .filter((v) => {
          const d = shownData(v, viewer.canEdit);
          if (!d) return false;
          const r = REQ.get(d.control_id);
          return (
            (!level || String(r?.cmmc_level) === level) &&
            (!family || r?.family === family) &&
            (!archetype || d.archetype_code === archetype) &&
            (!type || d.mapping_type === type) &&
            (!status || statusOf(v).key === status) &&
            matchesText(q, d.control_id, r?.practice, d.archetype_code, archetypes.get(d.archetype_code)?.current?.name)
          );
        })
        .sort((a, b) => {
          const ra = REQUIREMENTS.findIndex((r) => r.control_id === a.key.split('::')[0]);
          const rb = REQUIREMENTS.findIndex((r) => r.control_id === b.key.split('::')[0]);
          return ra - rb || a.key.localeCompare(b.key);
        }),
    [items, q, level, family, archetype, type, status, viewer.canEdit, archetypes]
  );
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const { sort, onSort, sorted } = useSort<(typeof rows)[number], 'req' | 'archetype' | 'type' | 'strength' | 'status'>(rows, (v, col) => {
    const d = shownData(v, viewer.canEdit)!;
    if (col === 'req') return REQ.get(d.control_id)?.nist_ref ?? d.control_id;
    if (col === 'archetype') return d.archetype_code;
    if (col === 'type') return d.mapping_type;
    if (col === 'strength') return d.expected_strength ? STRENGTH_RANK[d.expected_strength] : 9;
    return statusOf(v).label;
  });
  const paged = usePaged(sorted, rowsPerPage);
  const selected = items.find((v) => v.key === selectedKey) ?? null;
  const covered = new Set(items.filter((v) => v.current).map((v) => v.current!.control_id)).size;
  const changed = (msg: string) => {
    setToast(msg);
    setEditing(null);
    setBump((b) => b + 1);
    void reload();
  };

  return (
    <div className="pg" data-testid="page-mapping">
      <PageHeader
        icon="⇄"
        title="Requirement-to-Evidence Mapping"
        lede="Map CMMC requirements to standard evidence archetypes. Define how each evidence type supports a requirement, including assessor methods, expected evidence strength and additional guidance."
        actions={
          viewer.canEdit && (
            <button type="button" className="btn btn-primary" onClick={() => setEditing({ view: null })} data-testid="mapping-add">
              ＋ Add Mapping
            </button>
          )
        }
      />
      <div className="stats stats-4">
        <Stat icon="⇄" value={items.length} label="Mappings" sub="Requirement → archetype" testId="stat-mappings" />
        <Stat icon="▤" value={covered} label="Requirements covered" sub={`of ${REQUIREMENTS.length}`} tone="good" testId="stat-mapped" />
        <Stat icon="!" value={items.filter((v) => shownData(v, viewer.canEdit)?.mapping_type === 'required').length} label="Required" sub="Store must-have" tone="bad" />
        <Stat icon="◷" value={items.filter((v) => v.draft).length} label="Drafts" sub="Waiting to be published" tone="warn" />
      </div>
      <div className="card toolbar" role="search">
        <label className="grow">
          Search
          <input className="input" type="search" placeholder="Search by requirement ID, requirement text or evidence name…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="mapping-search" />
        </label>
        <label>
          CMMC Level
          <select className="select" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">All Levels</option>
            <option value="1">Level 1</option>
            <option value="2">Level 2</option>
          </select>
        </label>
        <label>
          Domain / Family
          <select className="select" value={family} onChange={(e) => setFamily(e.target.value)} data-testid="mapping-family">
            <option value="">All Families</option>
            {FAMILIES.map((f) => (
              <option key={f.abbreviation} value={f.abbreviation}>
                {f.abbreviation} - {f.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Evidence Archetype
          <select className="select" value={archetype} onChange={(e) => setArchetype(e.target.value)}>
            <option value="">All Archetypes</option>
            {[...archetypes.keys()].map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mapping Type
          <select className="select" value={type} onChange={(e) => setType(e.target.value)} data-testid="mapping-type">
            <option value="">All Types</option>
            <option value="required">Required</option>
            <option value="recommended">Recommended</option>
          </select>
        </label>
        <label>
          Status
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="published">Published</option>
            <option value="pending">Published · draft pending</option>
            {viewer.canEdit && <option value="draft">Draft</option>}
            {viewer.canEdit && <option value="retired">Retired</option>}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setQ('');
            setLevel('');
            setFamily('');
            setArchetype('');
            setType('');
            setStatus('');
          }}
        >
          Clear Filters
        </button>
      </div>
      {s.state === 'loading' && <Empty>Loading mappings…</Empty>}
      {s.state === 'error' && (
        <p className="note" data-tone="bad" role="alert">
          {s.message}
        </p>
      )}
      {s.state === 'ready' && (
        <div className={selected ? 'split split-wide' : undefined}>
          <section className="card" aria-label="Mappings">
            <div className="card-bar">
              <strong data-testid="mapping-count">{rows.length} Requirement-to-Evidence Mappings</strong>
            </div>
            <div className="table-wrap">
              <table className="tbl" data-testid="mapping-table">
                <thead>
                  <tr>
                    <SortTh label="Requirement ID" col="req" sort={sort} onSort={onSort} />
                    <th scope="col">Requirement Name</th>
                    <SortTh label="Evidence Archetype" col="archetype" sort={sort} onSort={onSort} />
                    <SortTh label="Mapping Type" col="type" sort={sort} onSort={onSort} />
                    <SortTh label="Expected Strength" col="strength" sort={sort} onSort={onSort} />
                    <SortTh label="Status" col="status" sort={sort} onSort={onSort} />
                    {viewer.canEdit && <th scope="col">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {paged.slice.map((v) => {
                    const d = shownData(v, viewer.canEdit)!;
                    const r = REQ.get(d.control_id);
                    return (
                      <tr key={v.key} aria-selected={selectedKey === v.key}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button type="button" className="row-btn" onClick={() => setSelectedKey(v.key)}>
                            {d.control_id}
                          </button>
                          <div className="cell-sub">
                            {r?.family_name} - L{r?.cmmc_level}
                          </div>
                        </td>
                        <td>
                          <span className="clamp-3" title={r?.practice}>
                            {r?.practice}
                          </span>
                        </td>
                        <td>
                          {d.archetype_code}
                          <div className="cell-sub">{archetypes.get(d.archetype_code)?.current?.name}</div>
                        </td>
                        <td>
                          <span className="pill" data-tone={d.mapping_type === 'required' ? 'bad' : undefined}>
                            {cap(d.mapping_type)}
                          </span>
                        </td>
                        <td>
                          {d.expected_strength ? (
                            <span className="pill" data-tone={STRENGTH_TONE[d.expected_strength]}>
                              {cap(d.expected_strength)}
                            </span>
                          ) : (
                            <span className="muted">Not set</span>
                          )}
                        </td>
                        <td>
                          <StatusPill view={v} />
                        </td>
                        {viewer.canEdit && (
                          <td>
                            <RowActions
                              label={v.key}
                              testId={`mapping-actions-${v.key}`}
                              actions={[
                                { label: 'View', onSelect: () => setSelectedKey(v.key) },
                                { label: 'Edit', onSelect: () => setEditing({ view: v }), testId: `mapping-edit-${v.key}` },
                                { label: 'Delete', tone: 'danger', onSelect: () => setDeleting(v), testId: `mapping-delete-${v.key}` },
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
            {rows.length === 0 && <Empty>No mapping matches these filters.</Empty>}
            <div className="pager-row">
              <Pager {...paged} noun="mappings" />
              <RowsPerPage value={rowsPerPage} onChange={setRowsPerPage} />
            </div>
          </section>
          {selected && (
            <MappingDetail view={selected} archetype={archetypes.get(shownData(selected, true)!.archetype_code)} bump={bump} onClose={() => setSelectedKey(null)} onEdit={() => setEditing({ view: selected })} onChanged={changed} />
          )}
        </div>
      )}
      {editing && <MappingDrawer view={editing.view} archetypes={archetypes} onClose={() => setEditing(null)} onSaved={changed} />}
      {deleting && (
        <DeleteItemDialog
          kind="mapping"
          view={deleting}
          name={deleting.key}
          onCancel={() => setDeleting(null)}
          onDone={(msg) => {
            setDeleting(null);
            if (selectedKey === deleting.key) setSelectedKey(null);
            changed(msg);
          }}
        />
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function MappingDetail({
  view,
  archetype,
  bump,
  onClose,
  onEdit,
  onChanged,
}: {
  view: ItemView<Mapping>;
  archetype: ItemView<Archetype> | undefined;
  bump: number;
  onClose: () => void;
  onEdit: () => void;
  onChanged: (msg: string) => void;
}) {
  const viewer = useSharedViewer();
  const [tab, setTab] = useState<'overview' | 'methods' | 'anti' | 'versions'>('overview');
  const detail = useItemDetail<Mapping>('mapping', view.key, bump);
  const d = shownData(view, viewer.canEdit)!;
  const r = REQ.get(d.control_id);
  const a = archetype?.current;
  return (
    <aside className="card card-pad detail" aria-label="Mapping details" data-testid="mapping-detail">
      <div className="detail-head">
        <div>
          <span className="muted">
            {d.control_id} → {d.archetype_code}
          </span>{' '}
          <StatusPill view={view} />
          <h2>{r?.practice}</h2>
          <span className="muted">
            {r?.family_name} ({r?.family}) · CMMC Level {r?.cmmc_level}
          </span>
        </div>
        <button type="button" className="icon-x" onClick={onClose} aria-label="Close details">
          ×
        </button>
      </div>
      <div role="tablist" className="tabs tabs-sm">
        {(
          [
            ['overview', 'Overview'],
            ['methods', `Assessor Methods (${d.assessor_methods.length})`],
            ['anti', `Anti-Patterns (${d.anti_patterns.length})`],
            ['versions', 'Version History'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`mapping-tab-${k}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'overview' && (
        <>
          <h3 className="detail-sub">Mapping Details</h3>
          <dl className="kv">
            <dt>Evidence Archetype</dt>
            <dd>
              {d.archetype_code} — {a?.name ?? '—'}
            </dd>
            <dt>Mapping Type</dt>
            <dd>{cap(d.mapping_type)}</dd>
            <dt>Expected Strength</dt>
            <dd>{d.expected_strength ? cap(d.expected_strength) : 'Not set'}</dd>
            <dt>Truth Tag</dt>
            <dd>{d.truth_tag ?? 'Not set'}</dd>
            <dt>Rationale</dt>
            <dd>{d.rationale || <span className="muted">Not written yet</span>}</dd>
          </dl>
          <h3 className="detail-sub">Requirement Details</h3>
          <dl className="kv">
            <dt>Requirement ID</dt>
            <dd>{d.control_id}</dd>
            <dt>Requirement Text</dt>
            <dd>{r?.practice}</dd>
          </dl>
          {a && (
            <>
              <h3 className="detail-sub">Evidence Archetype Details</h3>
              <dl className="kv">
                <dt>Domain</dt>
                <dd>{domainLabel(a.domain)}</dd>
                <dt>Description</dt>
                <dd>{a.description}</dd>
              </dl>
            </>
          )}
        </>
      )}
      {tab === 'methods' && (
        <ul className="obj-list">
          {d.assessor_methods.map((m) => (
            <li key={m}>{METHOD_LABEL[m]}</li>
          ))}
          {!d.assessor_methods.length && <li className="muted">None listed in the source.</li>}
        </ul>
      )}
      {tab === 'anti' && (
        <ul className="obj-list">
          {d.anti_patterns.map((x) => (
            <li key={x}>{x}</li>
          ))}
          {!d.anti_patterns.length && <li className="muted">None recorded for this mapping.</li>}
        </ul>
      )}
      {tab === 'versions' && (detail.state === 'ready' ? <VersionHistory detail={detail.data} /> : <Empty>Loading…</Empty>)}
      {viewer.canEdit && (
        <div className="detail-actions">
          <button type="button" className="btn btn-secondary" onClick={onEdit} data-testid="mapping-edit">
            ✎ {view.draft ? 'Edit draft' : 'Edit Mapping'}
          </button>
        </div>
      )}
      <GovernanceBar kind="mapping" view={view} onChanged={onChanged} />
    </aside>
  );
}

const EMPTY: Mapping = {
  control_id: REQUIREMENTS[0].control_id,
  archetype_code: '',
  mapping_type: 'recommended',
  expected_strength: null,
  assessor_methods: [],
  rationale: '',
  truth_tag: null,
  anti_patterns: [],
};

function MappingDrawer({
  view,
  archetypes,
  onClose,
  onSaved,
}: {
  view: ItemView<Mapping> | null;
  archetypes: Map<string, ItemView<Archetype>>;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const usable = [...archetypes.values()].filter((v) => v.current);
  const [d, setD] = useState<Mapping>(view ? shownData(view, true)! : { ...EMPTY, archetype_code: usable[0]?.key ?? '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Mapping>(k: K, v: Mapping[K]) => setD((cur) => ({ ...cur, [k]: v }));
  const save = async () => {
    setBusy(true);
    setError(null);
    const data = { ...d, rationale: d.rationale.trim(), anti_patterns: d.anti_patterns.map((x) => x.trim()).filter(Boolean) };
    const r = view ? await sharedApi.saveDraft('mapping', view.key, data) : await sharedApi.create('mapping', data);
    setBusy(false);
    if (!r.ok) return setError(describeFailure(r));
    onSaved(`Draft v${r.data.version} of ${data.control_id} → ${data.archetype_code} saved. Another administrator publishes it.`);
  };
  return (
    <Drawer
      title={view ? 'Edit Mapping' : 'Add Mapping'}
      subtitle="Saved as a draft. A second platform administrator publishes it."
      onClose={onClose}
      testId="mapping-drawer"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy} data-testid="mapping-save">
            {busy ? 'Saving…' : 'Save draft'}
          </button>
        </>
      }
    >
      <label className="form-row">
        Requirement *
        <select className="select" value={d.control_id} onChange={(e) => set('control_id', e.target.value)} disabled={!!view} data-testid="mapping-requirement">
          {REQUIREMENTS.map((r) => (
            <option key={r.control_id} value={r.control_id}>
              {r.control_id} — {r.practice.slice(0, 70)}
            </option>
          ))}
        </select>
      </label>
      <label className="form-row">
        Evidence Archetype *
        <select className="select" value={d.archetype_code} onChange={(e) => set('archetype_code', e.target.value)} disabled={!!view} data-testid="mapping-archetype">
          {usable.map((v) => (
            <option key={v.key} value={v.key}>
              {v.key} — {v.current!.name}
            </option>
          ))}
        </select>
        {view && <span className="hint">Requirement and archetype identify the mapping and cannot change. Retire it and add a new one instead.</span>}
      </label>
      <fieldset className="form-row radio-row">
        <legend>Mapping Type *</legend>
        {(['required', 'recommended'] as const).map((t) => (
          <label key={t}>
            <input type="radio" name="mtype" checked={d.mapping_type === t} onChange={() => set('mapping_type', t)} /> {cap(t)}
          </label>
        ))}
      </fieldset>
      <label className="form-row">
        Expected Strength
        <select className="select" value={d.expected_strength ?? ''} onChange={(e) => set('expected_strength', (e.target.value || null) as Mapping['expected_strength'])} data-testid="mapping-strength">
          <option value="">Not set</option>
          <option value="strong">Strong</option>
          <option value="adequate">Adequate</option>
          <option value="weak">Weak</option>
        </select>
      </label>
      <fieldset className="form-row radio-row">
        <legend>Assessor Methods</legend>
        {METHODS.map((m) => (
          <label key={m}>
            <input
              type="checkbox"
              checked={d.assessor_methods.includes(m)}
              onChange={() => set('assessor_methods', d.assessor_methods.includes(m) ? d.assessor_methods.filter((x) => x !== m) : [...d.assessor_methods, m])}
            />{' '}
            {METHOD_LABEL[m]}
          </label>
        ))}
      </fieldset>
      <label className="form-row">
        Rationale
        <textarea className="input" rows={3} value={d.rationale} onChange={(e) => set('rationale', e.target.value)} placeholder="Explain how this evidence supports the requirement." data-testid="mapping-rationale" />
      </label>
      <label className="form-row">
        Truth Tag
        <select className="select" value={d.truth_tag ?? ''} onChange={(e) => set('truth_tag', (e.target.value || null) as Mapping['truth_tag'])}>
          <option value="">Not set</option>
          <option value="FACT">FACT</option>
          <option value="INFERENCE">INFERENCE</option>
          <option value="OPEN_QUESTION">OPEN_QUESTION</option>
        </select>
      </label>
      <LinesInput label="Anti-Patterns" value={d.anti_patterns} onChange={(v) => set('anti_patterns', v)} placeholder="Screenshots without timestamps" />
      {error && (
        <p className="note" data-tone="bad" role="alert" data-testid="mapping-error">
          {error}
        </p>
      )}
    </Drawer>
  );
}
