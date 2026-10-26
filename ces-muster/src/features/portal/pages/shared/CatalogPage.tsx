// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// CatalogPage.tsx — S1.2: CES-Shared → Standard Evidence Catalog, signed in
// (mockup "Standard Evidence Catalog"). Archetypes come from muster-api (seeded
// from the Planner catalog); platform administrators add and edit drafts, a
// second administrator publishes, and old versions are kept.
import { takePendingSearch } from '../../searchHandoff';
import { useMemo, useState } from 'react';
import { sharedApi, type Archetype, type ItemView, type Mapping, type Method } from '@/shared/api/sharedApi';
import { DOMAIN_LABELS, domainLabel } from '../../evidenceData';
import { describeFailure, matchesText, shownData, statusOf, useGovernedList, useItemDetail, useSharedViewer } from '../../governedState';
import { DeleteItemDialog, Drawer, GovernanceBar, LinesInput, RowActions, StatusPill, Toast, VersionHistory } from '../../governed';
import { Empty, PageHeader, Pager, RowsPerPage, SortTh, Stat } from '../../ui';
import { usePaged, useSort } from '../../paging';
import { REQUIREMENTS } from '../../referenceData';

const METHODS: Method[] = ['examine', 'interview', 'test'];
const METHOD_LABEL: Record<Method, string> = { examine: 'Examine', interview: 'Interview', test: 'Test' };

export default function CatalogPage() {
  const viewer = useSharedViewer();
  const { s, reload } = useGovernedList<Archetype>('archetype');
  const mappings = useGovernedList<Mapping>('mapping');
  const [q, setQ] = useState(() => takePendingSearch('shared/evidence'));
  const [domain, setDomain] = useState('');
  const [method, setMethod] = useState('');
  const [status, setStatus] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ view: ItemView<Archetype> | null } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ItemView<Archetype> | null>(null);
  const [bump, setBump] = useState(0);

  const items = useMemo(() => (s.state === 'ready' ? s.data : []), [s]);
  const rows = useMemo(
    () =>
      items.filter((v) => {
        const d = shownData(v, viewer.canEdit);
        return (
          !!d &&
          (!domain || d.domain === domain) &&
          (!method || d.assessor_methods.includes(method as Method)) &&
          (!status || statusOf(v).key === status) &&
          matchesText(q, d.code, d.name, d.description)
        );
      }),
    [items, q, domain, method, status, viewer.canEdit]
  );
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const { sort, onSort, sorted } = useSort<(typeof rows)[number], 'code' | 'name' | 'domain' | 'status'>(rows, (v, col) => {
    const d = shownData(v, viewer.canEdit)!;
    return col === 'code' ? v.key : col === 'name' ? d.name : col === 'domain' ? domainLabel(d.domain) : statusOf(v).label;
  });
  const paged = usePaged(sorted, rowsPerPage);
  const selected = items.find((v) => v.key === selectedKey) ?? null;
  const domains = [...new Set(items.map((v) => shownData(v, true)?.domain).filter(Boolean) as string[])].sort();
  const count = (k: string) => items.filter((v) => statusOf(v).key === k || (k === 'published' && statusOf(v).key === 'pending')).length;
  const changed = (msg: string) => {
    setToast(msg);
    setEditing(null);
    setBump((b) => b + 1);
    void reload();
  };

  return (
    <div className="pg" data-testid="page-catalog">
      <PageHeader
        icon="▣"
        title="Standard Evidence Catalog"
        lede="A reusable catalog of standard evidence archetypes that can help demonstrate CMMC requirements: evidence types, acceptable forms, collection guidance and assessor methods. (Based on the CES Planner Evidence Archetype Catalog.)"
        actions={
          viewer.canEdit && (
            <button type="button" className="btn btn-primary" onClick={() => setEditing({ view: null })} data-testid="catalog-add">
              ＋ Add Evidence Archetype
            </button>
          )
        }
      />
      <div className="stats stats-5">
        <Stat icon="▣" value={items.length} label="Evidence Archetypes" sub="Total in catalog" testId="stat-archetypes" />
        <Stat icon="⛁" value={domains.length} label="Domains" sub="Evidence domains" />
        <Stat icon="👥" value={METHODS.length} label="Assessor Methods" sub="Examine, Interview, Test" tone="muster" />
        <Stat icon="✓" value={count('published')} label="Published" sub="Ready for use" tone="good" testId="stat-published" />
        <Stat icon="◷" value={count('draft') + count('pending')} label="Draft" sub="In progress" tone="warn" testId="stat-drafts" />
      </div>
      <div className="card toolbar" role="search">
        <label className="grow">
          Search
          <input className="input" type="search" placeholder="Search by name, code, description…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="catalog-search" />
        </label>
        <label>
          Domain
          <select className="select" value={domain} onChange={(e) => setDomain(e.target.value)} data-testid="catalog-domain">
            <option value="">All Domains</option>
            {domains.map((d) => (
              <option key={d} value={d}>
                {domainLabel(d)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Assessor Method
          <select className="select" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">All Methods</option>
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="catalog-status">
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
            setDomain('');
            setMethod('');
            setStatus('');
          }}
        >
          Clear Filters
        </button>
      </div>
      {s.state === 'loading' && <Empty>Loading the catalog…</Empty>}
      {s.state === 'error' && (
        <p className="note" data-tone="bad" role="alert">
          {s.message}
        </p>
      )}
      {s.state === 'ready' && (
        <div className={selected ? 'split split-wide' : undefined}>
          <section className="card" aria-label="Evidence archetypes">
            <div className="card-bar">
              <strong>{rows.length} Evidence Archetypes</strong>
            </div>
            <div className="table-wrap">
              <table className="tbl" data-testid="catalog-table">
                <thead>
                  <tr>
                    <SortTh label="Code" col="code" sort={sort} onSort={onSort} />
                    <SortTh label="Name" col="name" sort={sort} onSort={onSort} />
                    <SortTh label="Domain" col="domain" sort={sort} onSort={onSort} />
                    <th scope="col">Assessor Methods</th>
                    <SortTh label="Status" col="status" sort={sort} onSort={onSort} />
                    {viewer.canEdit && <th scope="col">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {paged.slice.map((v) => {
                    const d = shownData(v, viewer.canEdit)!;
                    return (
                      <tr key={v.key} aria-selected={selectedKey === v.key}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button type="button" className="row-btn" onClick={() => setSelectedKey(v.key)}>
                            {v.key}
                          </button>
                        </td>
                        <td>{d.name}</td>
                        <td>{domainLabel(d.domain)}</td>
                        <td>
                          <span className="method-tags">
                            {d.assessor_methods.map((m) => (
                              <span key={m} className="pill">
                                {METHOD_LABEL[m]}
                              </span>
                            ))}
                          </span>
                        </td>
                        <td>
                          <StatusPill view={v} />
                        </td>
                        {viewer.canEdit && (
                          <td>
                            <RowActions
                              label={v.key}
                              testId={`catalog-actions-${v.key}`}
                              actions={[
                                { label: 'View', onSelect: () => setSelectedKey(v.key) },
                                { label: 'Edit', onSelect: () => setEditing({ view: v }), testId: `catalog-edit-${v.key}` },
                                { label: 'Delete', tone: 'danger', onSelect: () => setDeleting(v), testId: `catalog-delete-${v.key}` },
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
            {rows.length === 0 && <Empty>No archetype matches these filters.</Empty>}
            <div className="pager-row">
              <Pager {...paged} noun="results" />
              <RowsPerPage value={rowsPerPage} onChange={setRowsPerPage} />
            </div>
          </section>
          {selected && (
            <ArchetypeDetail
              view={selected}
              mappings={mappings.s.state === 'ready' ? mappings.s.data : []}
              bump={bump}
              onClose={() => setSelectedKey(null)}
              onEdit={() => setEditing({ view: selected })}
              onChanged={changed}
            />
          )}
        </div>
      )}
      {editing && <ArchetypeDrawer view={editing.view} domains={domains} onClose={() => setEditing(null)} onSaved={changed} />}
      {deleting && (
        <DeleteItemDialog
          kind="archetype"
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

function ArchetypeDetail({
  view,
  mappings,
  bump,
  onClose,
  onEdit,
  onChanged,
}: {
  view: ItemView<Archetype>;
  mappings: ItemView<Mapping>[];
  bump: number;
  onClose: () => void;
  onEdit: () => void;
  onChanged: (msg: string) => void;
}) {
  const viewer = useSharedViewer();
  const [tab, setTab] = useState<'overview' | 'forms' | 'related' | 'versions'>('overview');
  const detail = useItemDetail<Archetype>('archetype', view.key, bump);
  const d = shownData(view, viewer.canEdit)!;
  const related = mappings.filter((m) => m.current?.archetype_code === view.key).map((m) => m.current!);
  const reqName = new Map(REQUIREMENTS.map((r) => [r.control_id, r.practice]));
  return (
    <aside className="card card-pad detail" aria-label="Archetype details" data-testid="catalog-detail">
      <div className="detail-head">
        <div>
          <span className="muted">{view.key}</span> <StatusPill view={view} />
          <h2>{d.name}</h2>
        </div>
        <button type="button" className="icon-x" onClick={onClose} aria-label="Close details">
          ×
        </button>
      </div>
      <div role="tablist" className="tabs tabs-sm">
        {(
          [
            ['overview', 'Overview'],
            ['forms', `Acceptable Forms (${d.acceptable_forms.length})`],
            ['related', `Related Requirements (${related.length})`],
            ['versions', 'Versions'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`catalog-tab-${k}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'overview' && (
        <>
          <h3 className="detail-sub">Description</h3>
          <p>{d.description}</p>
          <dl className="kv">
            <dt>Domain</dt>
            <dd>{domainLabel(d.domain)}</dd>
            <dt>Archetype Code</dt>
            <dd>{d.code}</dd>
            <dt>Assessor Methods</dt>
            <dd>{d.assessor_methods.map((m) => METHOD_LABEL[m]).join(', ')}</dd>
          </dl>
          {d.collection_notes && (
            <>
              <h3 className="detail-sub">Collection Guidance</h3>
              <p>{d.collection_notes}</p>
            </>
          )}
          {d.retention_notes_template && (
            <>
              <h3 className="detail-sub">Retention Guidance (Template)</h3>
              <p>{d.retention_notes_template}</p>
            </>
          )}
        </>
      )}
      {tab === 'forms' && (
        <ul className="obj-list">
          {d.acceptable_forms.map((f) => (
            <li key={f}>{f}</li>
          ))}
          {!d.acceptable_forms.length && <li className="muted">None listed.</li>}
        </ul>
      )}
      {tab === 'related' && (
        <ul className="obj-list" data-testid="catalog-related">
          {related.map((m) => (
            <li key={m.control_id}>
              <strong>{m.control_id}</strong> · {m.mapping_type} — {reqName.get(m.control_id)}
            </li>
          ))}
          {!related.length && <li className="muted">No published mapping uses this archetype.</li>}
        </ul>
      )}
      {tab === 'versions' && (detail.state === 'ready' ? <VersionHistory detail={detail.data} /> : <Empty>Loading…</Empty>)}
      {viewer.canEdit && (
        <div className="detail-actions">
          <button type="button" className="btn btn-secondary" onClick={onEdit} data-testid="catalog-edit">
            ✎ {view.draft ? 'Edit draft' : 'Edit'}
          </button>
        </div>
      )}
      <GovernanceBar kind="archetype" view={view} onChanged={onChanged} />
    </aside>
  );
}

const EMPTY: Archetype = { code: 'EMX-', name: '', domain: 'IAM', description: '', assessor_methods: ['examine'], acceptable_forms: [], collection_notes: '', retention_notes_template: '' };

function ArchetypeDrawer({ view, domains, onClose, onSaved }: { view: ItemView<Archetype> | null; domains: string[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const [d, setD] = useState<Archetype>(view ? shownData(view, true)! : EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Archetype>(k: K, v: Archetype[K]) => setD((cur) => ({ ...cur, [k]: v }));
  const allDomains = [...new Set([...domains, ...Object.keys(DOMAIN_LABELS)])].sort();
  const save = async () => {
    setBusy(true);
    setError(null);
    const data = { ...d, code: d.code.trim().toUpperCase(), acceptable_forms: d.acceptable_forms.map((x) => x.trim()).filter(Boolean) };
    const r = view ? await sharedApi.saveDraft('archetype', view.key, data) : await sharedApi.create('archetype', data);
    setBusy(false);
    if (!r.ok) return setError(describeFailure(r));
    onSaved(`Draft v${r.data.version} of ${data.code} saved. Another administrator publishes it.`);
  };
  return (
    <Drawer
      title={view ? `Edit ${view.key}` : 'Add Evidence Archetype'}
      subtitle="Saved as a draft. A second platform administrator publishes it."
      onClose={onClose}
      testId="archetype-drawer"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy} data-testid="archetype-save">
            {busy ? 'Saving…' : 'Save draft'}
          </button>
        </>
      }
    >
      <label className="form-row">
        Archetype Code *
        <input className="input" value={d.code} onChange={(e) => set('code', e.target.value.toUpperCase())} disabled={!!view} data-testid="archetype-code" />
        <span className="hint">EMX-&lt;DOMAIN&gt;-&lt;3 digits&gt;, e.g. EMX-IAM-006. Cannot change after creation.</span>
      </label>
      <label className="form-row">
        Name *
        <input className="input" value={d.name} onChange={(e) => set('name', e.target.value)} data-testid="archetype-name" />
      </label>
      <label className="form-row">
        Domain *
        <select className="select" value={d.domain} onChange={(e) => set('domain', e.target.value)} data-testid="archetype-domain">
          {allDomains.map((x) => (
            <option key={x} value={x}>
              {domainLabel(x)}
            </option>
          ))}
        </select>
      </label>
      <label className="form-row">
        Description *
        <textarea className="input" rows={3} value={d.description} onChange={(e) => set('description', e.target.value)} data-testid="archetype-description" />
      </label>
      <fieldset className="form-row radio-row">
        <legend>Assessor Methods *</legend>
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
      <LinesInput label="Acceptable Evidence Forms" value={d.acceptable_forms} onChange={(v) => set('acceptable_forms', v)} testId="archetype-forms" placeholder="Network diagram (Visio, PDF)" />
      <label className="form-row">
        Collection Guidance
        <textarea className="input" rows={3} value={d.collection_notes} onChange={(e) => set('collection_notes', e.target.value)} />
      </label>
      <label className="form-row">
        Retention Guidance (Template)
        <textarea className="input" rows={2} value={d.retention_notes_template} onChange={(e) => set('retention_notes_template', e.target.value)} />
      </label>
      {error && (
        <p className="note" data-tone="bad" role="alert" data-testid="archetype-error">
          {error}
        </p>
      )}
    </Drawer>
  );
}
