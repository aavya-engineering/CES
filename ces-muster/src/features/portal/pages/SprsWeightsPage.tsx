// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// SprsWeightsPage.tsx — UI-02: CES-Shared → SPRS Weight Table (mockups 4–6).
//
// Shows the DoD Assessment Methodology weights as they are: 5, 3 or 1 points
// deducted per unmet requirement, one requirement (the SSP) not scored, start
// 110, floor −203. The mockup's fractional weights summing to 1.00 and its
// "Add Requirement Weight" form are not built: weights are set by the DoD
// methodology and kept in one canonical ces-shared file (doc 14 M3, M4).
import { useState } from 'react';
import {
  PARTIAL_CREDIT,
  POAM_PROHIBITED,
  REQUIREMENTS,
  SPRS_META,
  familySummaries,
  totalDeduction,
  weightCounts,
  type RequirementRow,
} from '../referenceData';
import { PageHeader, Pager, Stat, Empty, RowsPerPage, SelectBox, SortTh } from '../ui';
import { usePaged, useSelection, useSort, weightTone } from '../paging';
import { exportRequirementsCsv } from '../requirementCsvData';
import { RequirementDetail, RequirementFilters } from './RequirementsPage';
import { useRequirementFilter } from '../requirementFilter';
import { EditRequirementDrawer, ModulePills, PriorityPill } from '../requirementMeta';
import { metaFor, useRequirementMeta } from '../requirementMetaData';
import { useSharedViewer } from '../governedState';
import { RowActions, Toast } from '../governed';

type SprsCol = 'id' | 'title' | 'family' | 'weight';

export default function SprsWeightsPage() {
  const [tab, setTab] = useState<'requirements' | 'families' | 'methodology'>('requirements');
  const counts = weightCounts();
  const total = totalDeduction();
  const families = familySummaries();
  const maxFamily = Math.max(...families.map((f) => f.maxDeduction));
  const f = useRequirementFilter(REQUIREMENTS);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const { sort, onSort, sorted } = useSort<RequirementRow, SprsCol>(f.filtered, (row, col) =>
    col === 'id' ? row.nist_ref : col === 'title' ? row.practice : col === 'family' ? row.family : row.weight
  );
  const paged = usePaged(sorted, rowsPerPage);
  const pick = useSelection(f.filtered.map((row) => row.control_id));
  const [selected, setSelected] = useState<RequirementRow | null>(null);
  const viewer = useSharedViewer();
  const meta = useRequirementMeta();
  const [editing, setEditing] = useState<RequirementRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const metaOf = (id: string) => metaFor(meta.byId.get(id), viewer.canEdit);

  return (
    <div className="pg" data-testid="page-sprs">
      <PageHeader
        icon="Σ"
        title="SPRS Weight Table"
        lede={
          <>
            Points deducted from {SPRS_META.starting_score} for each requirement that is not met (DoD Assessment
            Methodology v{SPRS_META.version}). Read-only: weights come from the methodology, not from CES users.
          </>
        }
        actions={
          <div className="pg-meta">
            <strong>{SPRS_META.source}</strong>
            ces-shared sprs-weights.json, generated {SPRS_META.generated_on}
          </div>
        }
      />
      <div className="stats">
        <Stat icon="5" value={counts[5]} label="Requirements worth 5 points" tone="bad" testId="stat-w5" />
        <Stat icon="3" value={counts[3]} label="Requirements worth 3 points" tone="warn" testId="stat-w3" />
        <Stat icon="1" value={counts[1]} label="Requirements worth 1 point" testId="stat-w1" />
        <Stat icon="0" value={counts[0]} label="Not scored" sub="SSP (3.12.4) — a prerequisite" testId="stat-w0" />
        <Stat
          icon="↓"
          value={total}
          label="Largest possible deduction"
          sub={`${SPRS_META.starting_score} − ${total} = ${SPRS_META.starting_score - total} (floor)`}
          testId="stat-total-deduction"
        />
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div role="tablist" aria-label="SPRS views" className="tabs">
          <button type="button" role="tab" aria-selected={tab === 'requirements'} onClick={() => setTab('requirements')} data-testid="sprs-tab-requirements">
            Requirements view
          </button>
          <button type="button" role="tab" aria-selected={tab === 'families'} onClick={() => setTab('families')} data-testid="sprs-tab-families">
            Control family summary
          </button>
          <button type="button" role="tab" aria-selected={tab === 'methodology'} onClick={() => setTab('methodology')} data-testid="sprs-tab-methodology">
            Methodology
          </button>
        </div>
      </div>

      {tab === 'methodology' && <Methodology />}
      {tab === 'requirements' ? (
        <>
          <RequirementFilters f={f} />
          <div className={selected ? 'split' : undefined}>
            <section className="card" aria-label="Weights">
              <div className="card-bar">
                <strong>{f.filtered.length} requirements</strong>
                <span className="card-bar-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => exportRequirementsCsv(pick.some ? sorted.filter((row) => pick.sel.has(row.control_id)) : sorted, metaOf)}
                    data-testid="sprs-export"
                  >
                    ⭳ {pick.some ? `Export ${pick.sel.size} selected` : 'Export'}
                  </button>
                </span>
              </div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th scope="col" className="col-check">
                        <SelectBox checked={pick.all} indeterminate={pick.some} onChange={pick.toggleAll} label="Select all requirements" />
                      </th>
                      <SortTh label="Requirement ID" col="id" sort={sort} onSort={onSort} />
                      <SortTh label="Requirement" col="title" sort={sort} onSort={onSort} />
                      <SortTh label="Family" col="family" sort={sort} onSort={onSort} />
                      <SortTh label="Weight" col="weight" sort={sort} onSort={onSort} className="num" />
                      <th scope="col">POA&amp;M allowed</th>
                      {viewer.signedIn && <th scope="col">Priority</th>}
                      {viewer.signedIn && <th scope="col">Modules</th>}
                      {viewer.canEdit && <th scope="col">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {paged.slice.map((r) => (
                      <tr key={r.control_id} aria-selected={selected?.control_id === r.control_id}>
                        <td className="col-check">
                          <SelectBox checked={pick.sel.has(r.control_id)} onChange={(on) => pick.toggle(r.control_id, on)} label={`Select ${r.control_id}`} />
                        </td>
                        <td>
                          <button type="button" className="row-btn" onClick={() => setSelected(r)}>
                            {r.control_id}
                          </button>
                        </td>
                        <td>{r.practice}</td>
                        <td>{r.family}</td>
                        <td className="num">
                          <span className="pill" data-tone={weightTone(r.weight)}>
                            {r.unscored ? '0 · not scored' : r.weight}
                          </span>
                          {r.partial && (
                            <div className="stat-sub" data-testid={`partial-${r.control_id}`}>
                              {r.partial.weight} if partly met
                            </div>
                          )}
                        </td>
                        <td>{r.poam_prohibited ? 'Never' : r.poam_allowed ? 'Yes' : 'No'}</td>
                        {viewer.signedIn && (
                          <td>
                            <PriorityPill meta={metaOf(r.control_id)} />
                          </td>
                        )}
                        {viewer.signedIn && (
                          <td>
                            <ModulePills meta={metaOf(r.control_id)} />
                          </td>
                        )}
                        {viewer.canEdit && (
                          <td>
                            <RowActions
                              label={r.control_id}
                              testId={`sprs-actions-${r.control_id}`}
                              actions={[
                                { label: 'View', onSelect: () => setSelected(r) },
                                { label: 'Edit', onSelect: () => setEditing(r), testId: `sprs-edit-${r.control_id}` },
                              ]}
                            />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {f.filtered.length === 0 && <Empty>No requirement matches these filters.</Empty>}
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
        </>
      ) : tab === 'families' ? (
        <section className="card" aria-label="Control family summary" data-testid="sprs-families">
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th scope="col">Family</th>
                  <th scope="col">Name</th>
                  <th scope="col" className="num">Requirements</th>
                  <th scope="col" className="num">5-point</th>
                  <th scope="col" className="num">3-point</th>
                  <th scope="col" className="num">1-point</th>
                  <th scope="col" className="num">Largest deduction</th>
                  <th scope="col" style={{ width: '22%' }}>
                    Share of {total}
                  </th>
                </tr>
              </thead>
              <tbody>
                {families.map((fam) => (
                  <tr key={fam.family}>
                    <td>
                      <strong>{fam.family}</strong>
                    </td>
                    <td>{fam.name}</td>
                    <td className="num">{fam.count}</td>
                    <td className="num">{fam.byWeight[5]}</td>
                    <td className="num">{fam.byWeight[3]}</td>
                    <td className="num">{fam.byWeight[1]}</td>
                    <td className="num">{fam.maxDeduction}</td>
                    <td>
                      <div className="bar" role="img" aria-label={`${fam.maxDeduction} of ${total} points`}>
                        <span style={{ width: `${(fam.maxDeduction / maxFamily) * 100}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {editing && (
        <EditRequirementDrawer
          row={editing}
          view={meta.byId.get(editing.control_id)}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setToast(msg);
            setEditing(null);
            void meta.reload();
          }}
        />
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

/** R1: every methodology field in sprs-weights.json (BHD response, P1-6). */
function Methodology() {
  const ratio = SPRS_META.conditional_l2_min_ratio;
  const byRef = new Map(REQUIREMENTS.map((r) => [r.nist_ref, r]));
  return (
    <div className="grid-2" data-testid="sprs-methodology">
      <section className="card card-pad" aria-label="Scoring rules">
        <h2 className="sub">Scoring rules</h2>
        <dl className="kv">
          <dt>Methodology</dt>
          <dd>{SPRS_META.source}</dd>
          <dt>Scores against</dt>
          <dd>{SPRS_META.scores_against}</dd>
          <dt>Starting score</dt>
          <dd>{SPRS_META.starting_score}</dd>
          <dt>Lowest possible score</dt>
          <dd>{SPRS_META.floor_score}</dd>
          <dt>Conditional Level 2</dt>
          <dd data-testid="sprs-ratio">
            At least {Math.round(ratio * 100)}% of the starting score ({Math.ceil(ratio * SPRS_META.starting_score)} of{' '}
            {SPRS_META.starting_score})
          </dd>
          <dt>Prerequisite</dt>
          <dd>{SPRS_META.ssp_prerequisite_control} (system security plan): not scored, but no score can be produced without it</dd>
          <dt>Data version</dt>
          <dd>
            {SPRS_META.version} · schema {SPRS_META.schema_version} · generated{' '}
            <span style={{ whiteSpace: 'nowrap' }}>{SPRS_META.generated_on}</span>
          </dd>
        </dl>
      </section>
      <section className="card card-pad" aria-label="Exceptions to the standard weights">
        <h2 className="sub">Partial credit</h2>
        <div className="table-wrap">
          <table className="tbl" data-testid="sprs-partial">
            <thead>
              <tr>
                <th scope="col">Requirement</th>
                <th scope="col" className="num">Full</th>
                <th scope="col" className="num">Partly met</th>
                <th scope="col">When</th>
              </tr>
            </thead>
            <tbody>
              {PARTIAL_CREDIT.map((p) => (
                <tr key={p.control_id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{p.control_id}</td>
                  <td className="num">{p.full_weight}</td>
                  <td className="num">{p.partial_weight}</td>
                  <td>
                    {p.partial_condition}
                    {p.poam_allowed_at_partial ? '. May go on a POA&M when partly met.' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h2 className="sub" style={{ marginTop: 18 }}>
          Never allowed on a POA&amp;M ({POAM_PROHIBITED.length})
        </h2>
        <ul className="chips" data-testid="sprs-prohibited">
          {POAM_PROHIBITED.map((ref) => (
            <li key={ref} className="pill" title={byRef.get(ref)?.practice}>
              {byRef.get(ref)?.control_id ?? ref}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
