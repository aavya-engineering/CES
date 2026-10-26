// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// RulesPage.tsx — S1.2: CES-Shared → Evaluation Rules, signed in (mockups
// "Evaluation Rules" and "Add Evidence Rule"). Seeded with one signal-check
// rule per control-signal-registry.json entry (107). Rule logic is data from a
// fixed vocabulary (BHD decision a: evaluators stay code in EvidenceOps); rules
// authored here are not executed until EvidenceOps reads them (doc 26).
import { takePendingSearch } from '../../searchHandoff';
import { useMemo, useState } from 'react';
import { sharedApi, type Archetype, type ItemView, type Rule } from '@/shared/api/sharedApi';
import { describeFailure, matchesText, shownData, statusOf, useGovernedList, useItemDetail, useSharedViewer } from '../../governedState';
import { DeleteItemDialog, GovernanceBar, RowActions, StatusPill, Toast, VersionHistory } from '../../governed';
import { Empty, PageHeader, Pager, RowsPerPage, SortTh, Stat } from '../../ui';
import { usePaged, useSort } from '../../paging';
import { REQUIREMENTS } from '../../referenceData';

const TYPE_LABEL: Record<Rule['rule_type'], string> = {
  signal_check: 'Signal Check',
  evidence_presence: 'Evidence Presence',
  evidence_attribute: 'Evidence Attribute',
  document_review: 'Document Review',
};
const CHECK_LABEL: Record<Rule['logic']['conditions'][number]['check'], string> = {
  evidence_present: 'Required evidence is present',
  evidence_current_within_days: 'Evidence is current within N days',
  attribute_present: 'Evidence contains attribute',
  approved_by_owner: 'Evidence approved by owner',
};
const OUTCOME_LABEL = { met: 'Met', not_met: 'Not met', partial: 'Partial', not_assessed: 'Not assessed' } as const;
const STRENGTH_TONE = { strong: 'good', adequate: 'info', weak: 'warn' } as const;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const appliesTo = (r: Rule) => [r.applies_to.requirements.length && 'Requirement', r.applies_to.archetypes.length && 'Archetype'].filter(Boolean).join(' + ') || '—';

export default function RulesPage() {
  const viewer = useSharedViewer();
  const { s, reload } = useGovernedList<Rule>('rule');
  const arch = useGovernedList<Archetype>('archetype');
  const [q, setQ] = useState(() => takePendingSearch('shared/rules'));
  const [type, setType] = useState('');
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [wizard, setWizard] = useState<{ view: ItemView<Rule> | null } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ItemView<Rule> | null>(null);
  const [bump, setBump] = useState(0);

  const items = useMemo(() => (s.state === 'ready' ? s.data : []), [s]);
  const rows = useMemo(
    () =>
      items.filter((v) => {
        const d = shownData(v, viewer.canEdit);
        return (
          !!d &&
          (!type || d.rule_type === type) &&
          (!level || String(d.cmmc_level) === level) &&
          (!status || statusOf(v).key === status) &&
          matchesText(q, d.code, d.name, d.description)
        );
      }),
    [items, q, type, level, status, viewer.canEdit]
  );
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const { sort, onSort, sorted } = useSort<(typeof rows)[number], 'code' | 'name' | 'type' | 'status' | 'version' | 'updated'>(rows, (v, col) => {
    const d = shownData(v, viewer.canEdit)!;
    const row = (viewer.canEdit && v.draft) || v.published || v.retired;
    if (col === 'code') return v.key;
    if (col === 'name') return d.name;
    if (col === 'type') return TYPE_LABEL[d.rule_type];
    if (col === 'status') return statusOf(v).label;
    if (col === 'version') return row?.version ?? 0;
    return row?.updated_at ?? '';
  });
  const paged = usePaged(sorted, rowsPerPage);
  const selected = items.find((v) => v.key === selectedKey) ?? null;
  const changed = (msg: string) => {
    setToast(msg);
    setWizard(null);
    setBump((b) => b + 1);
    void reload();
  };
  const archetypes = (arch.s.state === 'ready' ? arch.s.data : []).filter((v) => v.current).map((v) => v.key);

  if (wizard) return <RuleWizard view={wizard.view} archetypes={archetypes} onCancel={() => setWizard(null)} onSaved={changed} />;

  return (
    <div className="pg" data-testid="page-rules">
      <PageHeader
        icon="⚙"
        title="Evaluation Rules"
        lede="Define and manage rules used to evaluate evidence against CMMC requirements. Rules determine how evidence artifacts, attributes and context are assessed to produce a strength level or compliance outcome."
        actions={
          viewer.canEdit && (
            <button type="button" className="btn btn-primary" onClick={() => setWizard({ view: null })} data-testid="rules-add">
              ＋ Add Evaluation Rule
            </button>
          )
        }
      />
      <p className="note" data-testid="rules-note">
        Rule logic here is data, not code: the signals to read, the EvidenceOps evaluator and simple evidence conditions. The 107 signal-check rules come from
        control-signal-registry.json. A rule authored here is used once EvidenceOps reads the published release (decision a, BHD response to Tech Arch V1.0).
      </p>
      <div className="stats stats-4">
        <Stat icon="⚙" value={items.length} label="Evaluation Rules" testId="stat-rules" />
        <Stat icon="✓" value={items.filter((v) => v.published).length} label="Published" tone="good" />
        <Stat icon="◷" value={items.filter((v) => v.draft).length} label="Drafts" tone="warn" />
        <Stat icon="?" value={REQUIREMENTS.length - new Set(items.flatMap((v) => v.current?.applies_to.requirements ?? [])).size} label="Requirements without a rule" sub="e.g. 3.4.4, 3.7.3, 3.7.6" tone="bad" testId="stat-rules-gap" />
      </div>
      <div className="card toolbar" role="search">
        <label className="grow">
          Search
          <input className="input" type="search" placeholder="Search by rule name, code, description…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="rules-search" />
        </label>
        <label>
          Rule Type
          <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All Types</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
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
            setType('');
            setLevel('');
            setStatus('');
          }}
        >
          Clear Filters
        </button>
      </div>
      {s.state === 'loading' && <Empty>Loading rules…</Empty>}
      {s.state === 'error' && (
        <p className="note" data-tone="bad" role="alert">
          {s.message}
        </p>
      )}
      {s.state === 'ready' && (
        <div className={selected ? 'split split-wide' : undefined}>
          <section className="card" aria-label="Evaluation rules">
            <div className="card-bar">
              <strong>{rows.length} Evaluation Rules</strong>
            </div>
            <div className="table-wrap">
              <table className="tbl" data-testid="rules-table">
                <thead>
                  <tr>
                    <SortTh label="Rule Code" col="code" sort={sort} onSort={onSort} />
                    <SortTh label="Rule Name" col="name" sort={sort} onSort={onSort} />
                    <SortTh label="Rule Type" col="type" sort={sort} onSort={onSort} />
                    <th scope="col">Applies To</th>
                    <SortTh label="Status" col="status" sort={sort} onSort={onSort} />
                    <SortTh label="Version" col="version" sort={sort} onSort={onSort} className="num" />
                    <SortTh label="Updated On" col="updated" sort={sort} onSort={onSort} />
                    {viewer.canEdit && <th scope="col">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {paged.slice.map((v) => {
                    const d = shownData(v, viewer.canEdit)!;
                    const row = (viewer.canEdit && v.draft) || v.published || v.retired;
                    return (
                      <tr key={v.key} aria-selected={selectedKey === v.key}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button type="button" className="row-btn" onClick={() => setSelectedKey(v.key)}>
                            {v.key}
                          </button>
                        </td>
                        <td>{d.name}</td>
                        <td>{TYPE_LABEL[d.rule_type]}</td>
                        <td>{appliesTo(d)}</td>
                        <td>
                          <StatusPill view={v} />
                        </td>
                        <td className="num">{row?.version}.0</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{row ? new Date(row.updated_at).toLocaleDateString(undefined, { dateStyle: 'short' }) : '—'}</td>
                        {viewer.canEdit && (
                          <td>
                            <RowActions
                              label={v.key}
                              testId={`rules-actions-${v.key}`}
                              actions={[
                                { label: 'View', onSelect: () => setSelectedKey(v.key) },
                                { label: 'Edit', onSelect: () => setWizard({ view: v }), testId: `rules-edit-${v.key}` },
                                { label: 'Delete', tone: 'danger', onSelect: () => setDeleting(v), testId: `rules-delete-${v.key}` },
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
            {rows.length === 0 && <Empty>No rule matches these filters.</Empty>}
            <div className="pager-row">
              <Pager {...paged} noun="rules" />
              <RowsPerPage value={rowsPerPage} onChange={setRowsPerPage} />
            </div>
          </section>
          {selected && <RuleDetail view={selected} bump={bump} onClose={() => setSelectedKey(null)} onEdit={() => setWizard({ view: selected })} onChanged={changed} />}
        </div>
      )}
      {deleting && (
        <DeleteItemDialog
          kind="rule"
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

function RuleDetail({ view, bump, onClose, onEdit, onChanged }: { view: ItemView<Rule>; bump: number; onClose: () => void; onEdit: () => void; onChanged: (msg: string) => void }) {
  const viewer = useSharedViewer();
  const [tab, setTab] = useState<'overview' | 'logic' | 'assign' | 'versions'>('overview');
  const detail = useItemDetail<Rule>('rule', view.key, bump);
  const d = shownData(view, viewer.canEdit)!;
  return (
    <aside className="card card-pad detail" aria-label="Rule details" data-testid="rule-detail">
      <div className="detail-head">
        <div>
          <span className="muted">{view.key}</span> <StatusPill view={view} />
          <h2>{d.name}</h2>
        </div>
        <button type="button" className="icon-x" onClick={onClose} aria-label="Close details">
          ×
        </button>
      </div>
      <p>{d.description}</p>
      <div role="tablist" className="tabs tabs-sm">
        {(
          [
            ['overview', 'Overview'],
            ['logic', 'Rule Logic'],
            ['assign', `Assignments (${d.applies_to.requirements.length + d.applies_to.archetypes.length})`],
            ['versions', 'Version History'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`rule-tab-${k}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'overview' && (
        <dl className="kv">
          <dt>Rule Code</dt>
          <dd>{d.code}</dd>
          <dt>Rule Type</dt>
          <dd>{TYPE_LABEL[d.rule_type]}</dd>
          <dt>CMMC Level</dt>
          <dd>Level {d.cmmc_level}</dd>
          <dt>Category</dt>
          <dd>{d.category || '—'}</dd>
          <dt>Effective</dt>
          <dd>
            {d.effective_from ?? 'Not set'} → {d.effective_to ?? 'open'}
          </dd>
          <dt>Applies To</dt>
          <dd>
            {d.applies_to.requirements.length} Requirements · {d.applies_to.archetypes.length} Evidence Archetypes
          </dd>
          <dt>Outcomes</dt>
          <dd>{d.output.outcomes.map((o) => OUTCOME_LABEL[o]).join(', ')}</dd>
          <dt>Evidence Strength</dt>
          <dd>
            {d.output.evidence_strength.length
              ? d.output.evidence_strength.map((x) => (
                  <span key={x} className="pill" data-tone={STRENGTH_TONE[x]} style={{ marginRight: 4 }}>
                    {cap(x)}
                  </span>
                ))
              : '—'}
          </dd>
          {d.tags.length > 0 && (
            <>
              <dt>Tags</dt>
              <dd>{d.tags.join(', ')}</dd>
            </>
          )}
        </dl>
      )}
      {tab === 'logic' && (
        <div data-testid="rule-logic">
          <dl className="kv">
            <dt>Evaluator</dt>
            <dd>{d.logic.evaluator ?? '—'}</dd>
            <dt>Combine</dt>
            <dd>{d.logic.operator}</dd>
          </dl>
          <h3 className="detail-sub">Signals ({d.logic.signals.length})</h3>
          <ul className="obj-list">
            {d.logic.signals.map((sg, i) => (
              <li key={i}>
                <strong>{sg.type}</strong> {sg.endpoint && <code>{sg.endpoint}</code>}
                {sg.filter && <span className="muted"> filter {sg.filter}</span>}
                {sg.required === false && <span className="muted"> (optional)</span>}
              </li>
            ))}
            {!d.logic.signals.length && <li className="muted">No tenant signals.</li>}
          </ul>
          <h3 className="detail-sub">Evidence Conditions ({d.logic.conditions.length})</h3>
          <ul className="obj-list">
            {d.logic.conditions.map((c, i) => (
              <li key={i}>
                {CHECK_LABEL[c.check]}
                {c.value ? `: ${c.value}` : ''}
              </li>
            ))}
            {!d.logic.conditions.length && <li className="muted">None.</li>}
          </ul>
        </div>
      )}
      {tab === 'assign' && (
        <ul className="obj-list">
          {d.applies_to.requirements.map((r) => (
            <li key={r}>Requirement {r}</li>
          ))}
          {d.applies_to.archetypes.map((a) => (
            <li key={a}>Archetype {a}</li>
          ))}
        </ul>
      )}
      {tab === 'versions' && (detail.state === 'ready' ? <VersionHistory detail={detail.data} /> : <Empty>Loading…</Empty>)}
      {viewer.canEdit && (
        <div className="detail-actions">
          <button type="button" className="btn btn-secondary" onClick={onEdit} data-testid="rule-edit">
            ✎ {view.draft ? 'Edit draft' : 'Edit Rule'}
          </button>
          {view.published && !view.draft && (
            <button type="button" className="btn btn-secondary" onClick={onEdit} data-testid="rule-new-version">
              ⧉ Create New Version
            </button>
          )}
        </div>
      )}
      <GovernanceBar kind="rule" view={view} onChanged={onChanged} />
    </aside>
  );
}

const EMPTY_RULE: Rule = {
  code: 'EVR-',
  name: '',
  rule_type: 'evidence_presence',
  cmmc_level: 2,
  category: '',
  description: '',
  tags: [],
  effective_from: new Date().toISOString().slice(0, 10),
  effective_to: null,
  logic: { evaluator: null, signals: [], conditions: [{ check: 'evidence_present', value: '' }], operator: 'AND' },
  applies_to: { requirements: [], archetypes: [] },
  output: { outcomes: ['met', 'not_met', 'partial', 'not_assessed'], evidence_strength: ['strong', 'adequate', 'weak'], message: '' },
};

const STEPS = ['Basic Information', 'Rule Logic', 'Applicability', 'Output & Messages', 'Review & Save'] as const;

function RuleWizard({ view, archetypes, onCancel, onSaved }: { view: ItemView<Rule> | null; archetypes: string[]; onCancel: () => void; onSaved: (msg: string) => void }) {
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Rule>(view ? shownData(view, true)! : EMPTY_RULE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Rule>(k: K, v: Rule[K]) => setD((cur) => ({ ...cur, [k]: v }));
  const [reqQuery, setReqQuery] = useState('');
  const save = async () => {
    setBusy(true);
    setError(null);
    const data = { ...d, code: d.code.trim().toUpperCase(), tags: d.tags.map((t) => t.trim()).filter(Boolean) };
    const r = view ? await sharedApi.saveDraft('rule', view.key, data) : await sharedApi.create('rule', data);
    setBusy(false);
    if (!r.ok) return setError(describeFailure(r));
    onSaved(`Draft v${r.data.version} of ${data.code} saved. Another administrator publishes it.`);
  };
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div className="pg" data-testid="rule-wizard">
      <PageHeader icon="⚙" title={view ? `Edit Evidence Rule — ${view.key}` : 'Add Evidence Rule'} lede="Define a rule used to evaluate evidence against CMMC requirements. The rule determines how evidence artifacts, attributes and context are assessed." />
      <div className="wizard">
        <div className="card">
          <ol className="stepper" aria-label="Steps">
            {STEPS.map((label, i) => (
              <li key={label} aria-current={i === step ? 'step' : undefined} data-done={i < step || undefined}>
                <button type="button" onClick={() => setStep(i)} data-testid={`rule-step-${i + 1}`}>
                  <span className="step-n">{i + 1}</span> {label}
                </button>
              </li>
            ))}
          </ol>
          <div className="card-pad">
            <h2 className="sub">{STEPS[step]}</h2>
            {step === 0 && (
              <div className="form-grid">
                <label className="form-row">
                  Rule Code *
                  <input className="input" value={d.code} onChange={(e) => set('code', e.target.value.toUpperCase())} disabled={!!view} data-testid="rule-code" />
                  <span className="hint">EVR-&lt;domain&gt;-&lt;seq&gt;, e.g. EVR-AC-001. Cannot change later.</span>
                </label>
                <label className="form-row">
                  Rule Name *
                  <input className="input" value={d.name} onChange={(e) => set('name', e.target.value)} data-testid="rule-name" />
                </label>
                <label className="form-row">
                  Rule Type *
                  <select className="select" value={d.rule_type} onChange={(e) => set('rule_type', e.target.value as Rule['rule_type'])} data-testid="rule-type">
                    {Object.entries(TYPE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-row">
                  CMMC Level *
                  <select className="select" value={d.cmmc_level} onChange={(e) => set('cmmc_level', Number(e.target.value) as 1 | 2)}>
                    <option value={1}>Level 1</option>
                    <option value={2}>Level 2</option>
                  </select>
                </label>
                <label className="form-row span-all">
                  Description *
                  <textarea className="input" rows={3} value={d.description} onChange={(e) => set('description', e.target.value)} data-testid="rule-description" />
                </label>
                <label className="form-row">
                  Rule Category
                  <input className="input" value={d.category} onChange={(e) => set('category', e.target.value)} placeholder="e.g. Access Control" />
                </label>
                <label className="form-row">
                  Tags
                  <input className="input" value={d.tags.join(', ')} onChange={(e) => set('tags', e.target.value.split(','))} placeholder="configuration, policy" />
                </label>
                <label className="form-row">
                  Effective From
                  <input className="input" type="date" value={d.effective_from ?? ''} onChange={(e) => set('effective_from', e.target.value || null)} />
                </label>
                <label className="form-row">
                  Effective To
                  <input className="input" type="date" value={d.effective_to ?? ''} onChange={(e) => set('effective_to', e.target.value || null)} />
                </label>
              </div>
            )}
            {step === 1 && (
              <div>
                <label className="form-row">
                  EvidenceOps evaluator
                  <input className="input" value={d.logic.evaluator ?? ''} onChange={(e) => set('logic', { ...d.logic, evaluator: e.target.value || null })} placeholder="e.g. caEnforcementEvaluator (optional)" />
                  <span className="hint">Name of an evaluator that exists in EvidenceOps code. Signals from the registry are kept as they are.</span>
                </label>
                <fieldset className="form-row radio-row">
                  <legend>Combine conditions with</legend>
                  {(['AND', 'OR'] as const).map((o) => (
                    <label key={o}>
                      <input type="radio" name="op" checked={d.logic.operator === o} onChange={() => set('logic', { ...d.logic, operator: o })} /> {o}
                    </label>
                  ))}
                </fieldset>
                <h3 className="detail-sub">Evidence conditions</h3>
                {d.logic.conditions.map((c, i) => (
                  <div key={i} className="cond-row">
                    <select
                      className="select"
                      value={c.check}
                      onChange={(e) => set('logic', { ...d.logic, conditions: d.logic.conditions.map((x, j) => (j === i ? { ...x, check: e.target.value as typeof c.check } : x)) })}
                      data-testid={`rule-cond-${i}`}
                    >
                      {Object.entries(CHECK_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input"
                      value={c.value}
                      placeholder={c.check === 'evidence_current_within_days' ? 'Days, e.g. 90' : c.check === 'attribute_present' ? 'Attribute, e.g. user groups' : 'Detail (optional)'}
                      onChange={(e) => set('logic', { ...d.logic, conditions: d.logic.conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}
                    />
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('logic', { ...d.logic, conditions: d.logic.conditions.filter((_, j) => j !== i) })} aria-label="Remove condition">
                      ×
                    </button>
                  </div>
                ))}
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => set('logic', { ...d.logic, conditions: [...d.logic.conditions, { check: 'evidence_present', value: '' }] })} data-testid="rule-add-cond">
                  ＋ Add condition
                </button>
                {d.logic.signals.length > 0 && (
                  <>
                    <h3 className="detail-sub" style={{ marginTop: 16 }}>
                      Registry signals (read-only)
                    </h3>
                    <ul className="obj-list">
                      {d.logic.signals.map((sg, i) => (
                        <li key={i}>
                          {sg.type} {sg.endpoint && <code>{sg.endpoint}</code>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
            {step === 2 && (
              <div className="grid-2">
                <div>
                  <h3 className="detail-sub">Requirements ({d.applies_to.requirements.length})</h3>
                  <input className="input" type="search" placeholder="Filter requirements…" value={reqQuery} onChange={(e) => setReqQuery(e.target.value)} />
                  <div className="check-list" data-testid="rule-req-list">
                    {REQUIREMENTS.filter((r) => matchesText(reqQuery, r.control_id, r.practice)).map((r) => (
                      <label key={r.control_id}>
                        <input
                          type="checkbox"
                          checked={d.applies_to.requirements.includes(r.control_id)}
                          onChange={() => set('applies_to', { ...d.applies_to, requirements: toggle(d.applies_to.requirements, r.control_id) })}
                        />{' '}
                        <strong>{r.control_id}</strong> {r.practice.slice(0, 60)}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="detail-sub">Evidence Archetypes ({d.applies_to.archetypes.length})</h3>
                  <div className="check-list">
                    {archetypes.map((a) => (
                      <label key={a}>
                        <input type="checkbox" checked={d.applies_to.archetypes.includes(a)} onChange={() => set('applies_to', { ...d.applies_to, archetypes: toggle(d.applies_to.archetypes, a) })} /> {a}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {step === 3 && (
              <div>
                <fieldset className="form-row radio-row">
                  <legend>Outcomes this rule can return</legend>
                  {(Object.keys(OUTCOME_LABEL) as Rule['output']['outcomes']).map((o) => (
                    <label key={o}>
                      <input type="checkbox" checked={d.output.outcomes.includes(o)} onChange={() => set('output', { ...d.output, outcomes: toggle(d.output.outcomes, o) })} /> {OUTCOME_LABEL[o]}
                    </label>
                  ))}
                </fieldset>
                <fieldset className="form-row radio-row">
                  <legend>Evidence strength levels</legend>
                  {(['strong', 'adequate', 'weak'] as const).map((x) => (
                    <label key={x}>
                      <input type="checkbox" checked={d.output.evidence_strength.includes(x)} onChange={() => set('output', { ...d.output, evidence_strength: toggle(d.output.evidence_strength, x) })} /> {cap(x)}
                    </label>
                  ))}
                </fieldset>
                <label className="form-row">
                  Message shown with the result
                  <textarea className="input" rows={3} maxLength={500} value={d.output.message} onChange={(e) => set('output', { ...d.output, message: e.target.value })} />
                </label>
              </div>
            )}
            {step === 4 && (
              <dl className="kv" data-testid="rule-review">
                <dt>Rule Code</dt>
                <dd>{d.code}</dd>
                <dt>Name</dt>
                <dd>{d.name || '—'}</dd>
                <dt>Type</dt>
                <dd>{TYPE_LABEL[d.rule_type]}</dd>
                <dt>Conditions</dt>
                <dd>{d.logic.conditions.map((c) => CHECK_LABEL[c.check] + (c.value ? ` (${c.value})` : '')).join(` ${d.logic.operator} `) || '—'}</dd>
                <dt>Applies to</dt>
                <dd>
                  {d.applies_to.requirements.length} requirements, {d.applies_to.archetypes.length} archetypes
                </dd>
                <dt>Outcomes</dt>
                <dd>{d.output.outcomes.map((o) => OUTCOME_LABEL[o]).join(', ')}</dd>
              </dl>
            )}
            {error && (
              <p className="note" data-tone="bad" role="alert" data-testid="rule-error">
                {error}
              </p>
            )}
            <div className="wizard-foot">
              <button type="button" className="btn btn-secondary" onClick={onCancel}>
                Cancel
              </button>
              <span style={{ flex: 1 }} />
              {step > 0 && (
                <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)}>
                  ← Back
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={save} disabled={busy} data-testid="rule-save">
                {busy ? 'Saving…' : 'Save as Draft'}
              </button>
              {step < STEPS.length - 1 && (
                <button type="button" className="btn btn-primary" onClick={() => setStep(step + 1)} data-testid="rule-next">
                  Next: {STEPS[step + 1]} →
                </button>
              )}
            </div>
          </div>
        </div>
        <aside className="card card-pad rule-preview" aria-label="Rule preview">
          <h2 className="sub">Rule Preview</h2>
          <div className="preview-box">
            <span className="pill" data-tone="warn" style={{ float: 'right' }}>
              Draft
            </span>
            <strong>{d.code || 'EVR-…'}</strong>
            <div>{d.name || 'Rule name will appear here'}</div>
            <dl className="kv kv-tight">
              <dt>Type</dt>
              <dd>{TYPE_LABEL[d.rule_type]}</dd>
              <dt>Level</dt>
              <dd>Level {d.cmmc_level}</dd>
              <dt>Version</dt>
              <dd>{view ? 'next' : '1.0'}</dd>
            </dl>
            <p className="muted">{d.description || 'Description will appear here…'}</p>
          </div>
          <h3 className="detail-sub">Applicability</h3>
          <p className="muted">
            Requirements: {d.applies_to.requirements.length || 'Not configured'} · Evidence Archetypes: {d.applies_to.archetypes.length || 'Not configured'}
          </p>
          <h3 className="detail-sub">Rule Configuration</h3>
          <p className="muted">
            Rule Logic: {d.logic.conditions.length + d.logic.signals.length ? `${d.logic.conditions.length} conditions, ${d.logic.signals.length} signals` : 'Not configured'} · Output: {d.output.outcomes.length} outcomes
          </p>
          <p className="note">Evaluation rules define how evidence is assessed to determine whether it meets the expectations for a CMMC requirement.</p>
        </aside>
      </div>
    </div>
  );
}
