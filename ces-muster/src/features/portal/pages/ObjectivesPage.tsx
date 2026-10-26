// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// ObjectivesPage.tsx — R1: CES-Shared → Reference Data → Assessment Objectives.
// The 320 NIST SP 800-171A determination statements ([a], [b] …) from ces-shared,
// read-only, with a roll-up per requirement (BHD response to Tech Arch V1.0, P0-2).
// No evidence column: no source file maps evidence to a single objective yet
// (doc 25, Q-1), so none is shown rather than guessed.
import { useMemo, useState } from 'react';
import { FAMILIES, REQUIREMENTS } from '../referenceData';
import { OBJECTIVES, objectiveCounts } from '../objectivesData';
import { PageHeader, Pager, Stat, Empty } from '../ui';
import { usePaged } from '../paging';

export default function ObjectivesPage() {
  const [tab, setTab] = useState<'objectives' | 'requirements'>('objectives');
  const [q, setQ] = useState('');
  const [family, setFamily] = useState('');
  const [level, setLevel] = useState('');
  /** Exact requirement, set from the roll-up (a text search for 3.1.1 would also match 3.1.10). */
  const [req, setReq] = useState('');
  const counts = useMemo(() => objectiveCounts(), []);
  const [maxId, maxN] = useMemo(() => [...counts.entries()].reduce((a, b) => (b[1] > a[1] ? b : a)), [counts]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return OBJECTIVES.filter(
      (o) =>
        (!req || o.controlId === req) &&
        (!family || o.requirement.family === family) &&
        (!level || o.requirement.level === level) &&
        (!needle ||
          o.objectiveId.toLowerCase().includes(needle) ||
          o.requirement.nist_ref.startsWith(needle) ||
          o.description.toLowerCase().includes(needle))
    );
  }, [q, family, level, req]);
  const rollup = useMemo(() => {
    const ids = new Set(filtered.map((o) => o.controlId));
    return REQUIREMENTS.filter((r) => ids.has(r.control_id));
  }, [filtered]);
  const paged = usePaged(filtered, 25);
  const pagedReq = usePaged(rollup, 25);
  const clear = () => {
    setReq('');
    setQ('');
    setFamily('');
    setLevel('');
  };
  const showOne = (controlId: string) => {
    setReq(controlId);
    setQ('');
    setFamily('');
    setLevel('');
    setTab('objectives');
  };

  return (
    <div className="pg" data-testid="page-objectives">
      <PageHeader
        icon="◎"
        title="Assessment Objectives"
        lede="What an assessor checks for each requirement: the NIST SP 800-171A determination statements ([a], [b] …). One canonical copy from ces-shared — read-only here."
        actions={
          <div className="pg-meta">
            <strong>NIST SP 800-171A</strong>
            ces-shared assessment-objectives.reference.json
          </div>
        }
      />
      <div className="stats">
        <Stat icon="◎" value={OBJECTIVES.length} label="Assessment objectives" testId="stat-obj-total" />
        <Stat icon="110" value={counts.size} label="Requirements covered" sub={`of ${REQUIREMENTS.length}`} testId="stat-obj-reqs" />
        <Stat icon="↑" value={maxN} label="Most on one requirement" sub={maxId} />
        <Stat icon="E·I·T" value="3" label="Methods per objective" sub="Every objective lists examine, interview and test" />
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div role="tablist" aria-label="Objective views" className="tabs">
          <button type="button" role="tab" aria-selected={tab === 'objectives'} onClick={() => setTab('objectives')} data-testid="obj-tab-objectives">
            All objectives
          </button>
          <button type="button" role="tab" aria-selected={tab === 'requirements'} onClick={() => setTab('requirements')} data-testid="obj-tab-requirements">
            By requirement
          </button>
        </div>
      </div>

      <div className="card toolbar" role="search">
        <label className="grow">
          Search
          <input
            className="input"
            type="search"
            placeholder="Objective ID, NIST reference or text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="obj-search"
          />
        </label>
        <label>
          Family
          <select className="select" value={family} onChange={(e) => setFamily(e.target.value)} data-testid="obj-family">
            <option value="">All families</option>
            {FAMILIES.map((f) => (
              <option key={f.abbreviation} value={f.abbreviation}>
                {f.abbreviation} — {f.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          CMMC level
          <select className="select" value={level} onChange={(e) => setLevel(e.target.value)} data-testid="obj-level">
            <option value="">Level 1 and 2</option>
            <option value="L1">Level 1</option>
            <option value="L2">Level 2</option>
          </select>
        </label>
        {req && (
          <button type="button" className="pill" onClick={() => setReq('')} data-testid="obj-req-chip" aria-label={`Show all requirements, not only ${req}`}>
            {req} ×
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={clear}>
          Clear filters
        </button>
      </div>

      {tab === 'objectives' ? (
        <section className="card" aria-label="Objectives">
          <div className="table-wrap">
            <table className="tbl" data-testid="obj-table">
              <thead>
                <tr>
                  <th scope="col">Objective</th>
                  <th scope="col">Determination statement</th>
                  <th scope="col">Requirement</th>
                  <th scope="col">Level</th>
                  <th scope="col">Methods</th>
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((o) => (
                  <tr key={o.objectiveId}>
                    <td style={{ whiteSpace: 'nowrap' }}>{o.objectiveId}</td>
                    <td>{o.description}</td>
                    <td>
                      <span className="pill">{o.requirement.family}</span> {o.requirement.nist_ref}
                    </td>
                    <td>{o.requirement.level}</td>
                    <td>
                      <span className="method-tags">
                        {o.methods.map((m) => (
                          <span key={m} className="pill" data-tone="info">
                            {m}
                          </span>
                        ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <Empty>No objective matches these filters.</Empty>}
          <Pager {...paged} noun="objectives" />
        </section>
      ) : (
        <section className="card" aria-label="Objectives by requirement">
          <div className="table-wrap">
            <table className="tbl" data-testid="obj-rollup">
              <thead>
                <tr>
                  <th scope="col">Requirement</th>
                  <th scope="col">Requirement text</th>
                  <th scope="col" className="num">
                    Objectives
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagedReq.slice.map((r) => (
                  <tr key={r.control_id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" className="row-btn" onClick={() => showOne(r.control_id)}>
                        {r.control_id}
                      </button>
                    </td>
                    <td>{r.practice}</td>
                    <td className="num">{counts.get(r.control_id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rollup.length === 0 && <Empty>No requirement matches these filters.</Empty>}
          <Pager {...pagedReq} noun="requirements" />
        </section>
      )}
    </div>
  );
}
