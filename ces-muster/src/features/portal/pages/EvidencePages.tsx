// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// EvidencePages.tsx — UI-02: CES-Shared → Standard Evidence Catalog and
// Requirement-to-Evidence Mapping (mockups 7, 8). Real data from the Planner
// knowledge files Muster ships (v0.1.0, 2026-02-03). The catalog has 50
// archetypes in 13 domains; the mapping matrix holds ONE mapping today — the
// page says so rather than showing the mockup's 68. Read-only: the mockup's
// "Add Evidence Archetype" / "Add Mapping" need an owner and a store (TBD, BHD).
import { takePendingSearch } from '../searchHandoff';
import { useEffect, useMemo, useState } from 'react';
import {
  domainLabel,
  loadArchetypeCatalog,
  loadEvidenceMatrix,
  type ArchetypeCatalog,
  type EvidenceArchetype,
  type EvidenceMatrix,
} from '../evidenceData';
import { REQUIREMENTS } from '../referenceData';
import { Empty, PageHeader, Pager, Stat } from '../ui';
import { usePaged } from '../paging';

type Load<T> = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: T };

function useLoad<T>(fn: () => Promise<T>): Load<T> {
  const [s, setS] = useState<Load<T>>({ state: 'loading' });
  useEffect(() => {
    let live = true;
    fn().then(
      (data) => live && setS({ state: 'ready', data }),
      (err: unknown) => live && setS({ state: 'error', message: err instanceof Error ? err.message : String(err) })
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return s;
}

function LoadState({ s }: { s: Load<unknown> }) {
  if (s.state === 'loading') return <Empty>Loading reference data…</Empty>;
  if (s.state === 'error') return <p className="note" data-tone="bad" role="alert">Could not load the reference file: {s.message}</p>;
  return null;
}

const METHOD_LABEL: Record<string, string> = { examine: 'Examine', interview: 'Interview', test: 'Test' };

export function EvidenceCatalogPage() {
  const s = useLoad<ArchetypeCatalog>(loadArchetypeCatalog);
  const [q, setQ] = useState(() => takePendingSearch('shared/evidence'));
  const [domain, setDomain] = useState('');
  const [method, setMethod] = useState('');
  const [selected, setSelected] = useState<EvidenceArchetype | null>(null);
  const archetypes = useMemo(() => (s.state === 'ready' ? s.data.archetypes : []), [s]);
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return archetypes.filter(
      (a) =>
        (!domain || a.domain === domain) &&
        (!method || a.assessor_methods_expected.includes(method)) &&
        (!n || a.archetype_id.toLowerCase().includes(n) || a.name.toLowerCase().includes(n) || a.description.toLowerCase().includes(n))
    );
  }, [archetypes, q, domain, method]);
  const paged = usePaged(filtered, 10);

  return (
    <div className="pg" data-testid="page-evidence">
      <PageHeader
        icon="▣"
        title="Standard Evidence Catalog"
        lede="Reusable kinds of evidence that can show a CMMC requirement is met: acceptable forms, how an assessor checks them, collection and retention notes. From the CES Planner Evidence Archetype Catalog."
        actions={
          s.state === 'ready' && (
            <div className="pg-meta">
              <strong>Catalog v{s.data.version}</strong>
              Generated {s.data.generated_on}
            </div>
          )
        }
      />
      <LoadState s={s} />
      {s.state === 'ready' && (
        <>
          <div className="stats">
            <Stat icon="▣" value={archetypes.length} label="Evidence archetypes" testId="stat-archetypes" />
            <Stat icon="◇" value={s.data.domains.length} label="Domains" />
            <Stat icon="✓" value={archetypes.filter((a) => a.maps_to_cmmc_practices.length > 0).length} label="Linked to requirements" sub="maps_to_cmmc_practices filled" tone="good" />
            <Stat icon="?" value={archetypes.filter((a) => a.maps_to_cmmc_practices.length === 0).length} label="Not linked yet" tone="warn" />
          </div>
          <div className="card toolbar" role="search">
            <label className="grow">
              Search
              <input className="input" type="search" placeholder="Code, name or description" value={q} onChange={(e) => setQ(e.target.value)} data-testid="evidence-search" />
            </label>
            <label>
              Domain
              <select className="select" value={domain} onChange={(e) => setDomain(e.target.value)}>
                <option value="">All domains</option>
                {s.data.domains.map((d) => (
                  <option key={d} value={d}>
                    {domainLabel(d)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Assessor method
              <select className="select" value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="">All methods</option>
                <option value="examine">Examine</option>
                <option value="interview">Interview</option>
                <option value="test">Test</option>
              </select>
            </label>
          </div>
          <div className={selected ? 'split' : undefined}>
            <section className="card" aria-label="Evidence archetypes">
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th scope="col">Code</th>
                      <th scope="col">Name</th>
                      <th scope="col">Domain</th>
                      <th scope="col">Assessor methods</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.slice.map((a) => (
                      <tr key={a.archetype_id} aria-selected={selected?.archetype_id === a.archetype_id}>
                        <td>
                          <button type="button" className="row-btn" onClick={() => setSelected(a)}>
                            {a.archetype_id}
                          </button>
                        </td>
                        <td>{a.name}</td>
                        <td>{domainLabel(a.domain)}</td>
                        <td>
                          {a.assessor_methods_expected.map((m) => (
                            <span key={m} className="pill" style={{ marginRight: 4 }}>
                              {METHOD_LABEL[m] ?? m}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filtered.length === 0 && <Empty>No archetype matches these filters.</Empty>}
              <Pager {...paged} noun="archetypes" />
            </section>
            {selected && (
              <aside className="card card-pad detail" aria-label="Archetype details" data-testid="evidence-detail">
                <div className="detail-head">
                  <div>
                    <span className="pill">{domainLabel(selected.domain)}</span>
                    <h2>{selected.name}</h2>
                    <div className="pg-meta">{selected.archetype_id}</div>
                  </div>
                  <button type="button" className="icon-x" onClick={() => setSelected(null)} aria-label="Close details">
                    ×
                  </button>
                </div>
                <p>{selected.description}</p>
                <h3 className="card-title" style={{ fontSize: 14 }}>Acceptable forms</h3>
                <ul>
                  {selected.acceptable_forms_examples.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                {selected.collection_notes && (
                  <>
                    <h3 className="card-title" style={{ fontSize: 14 }}>Collection guidance</h3>
                    <p>{selected.collection_notes}</p>
                  </>
                )}
                {selected.retention_notes_template && (
                  <>
                    <h3 className="card-title" style={{ fontSize: 14 }}>Retention guidance (template)</h3>
                    <p>{selected.retention_notes_template}</p>
                  </>
                )}
                <h3 className="card-title" style={{ fontSize: 14 }}>Related requirements</h3>
                <p>{selected.maps_to_cmmc_practices.length ? selected.maps_to_cmmc_practices.join(', ') : 'None linked in the catalog yet.'}</p>
              </aside>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function EvidenceMappingPage() {
  const s = useLoad<EvidenceMatrix>(loadEvidenceMatrix);
  const byId = useMemo(() => new Map(REQUIREMENTS.map((r) => [r.control_id, r])), []);
  return (
    <div className="pg" data-testid="page-mapping">
      <PageHeader
        icon="⇄"
        title="Requirement-to-Evidence Mapping"
        lede="Which evidence archetypes support a requirement, at what strength, how an assessor checks them, and what to avoid. From the CES Planner Assessor Evidence Matrix."
        actions={
          s.state === 'ready' && (
            <div className="pg-meta">
              <strong>Matrix v{s.data.version}</strong>
              Generated {s.data.generated_on}
            </div>
          )
        }
      />
      <LoadState s={s} />
      {s.state === 'ready' && (
        <>
          <div className="stats">
            <Stat icon="⇄" value={s.data.mappings.length} label="Requirements mapped" sub={`of ${REQUIREMENTS.length}`} testId="stat-mapped" />
            <Stat icon="!" value={REQUIREMENTS.length - s.data.mappings.length} label="Not mapped yet" tone="warn" />
            <Stat icon="▲" value={s.data.strength_tiers.join(' · ')} label="Evidence strength tiers" />
          </div>
          {s.data.mappings.length < REQUIREMENTS.length && (
            <p className="note" data-tone="warn" style={{ marginBottom: 14 }}>
              The matrix in this release maps {s.data.mappings.length} of {REQUIREMENTS.length} requirements. Filling it is
              content work for BHD (owner TBD); this page shows whatever the file contains.
            </p>
          )}
          {s.data.mappings.map((m) => (
            <section key={m.practice_id} className="card card-pad" style={{ marginBottom: 14 }} data-testid="mapping-card">
              <div className="detail-head">
                <div>
                  <span className="pill" data-tone="good">{m.truth_tag ?? 'mapping'}</span>
                  <h2 style={{ margin: '6px 0 0', fontSize: 18 }}>{m.practice_id}</h2>
                  <p style={{ margin: '4px 0 0' }}>{byId.get(m.practice_id)?.practice ?? 'Requirement text not found in the reference data.'}</p>
                </div>
              </div>
              <dl className="kv">
                <dt>Assessor methods</dt>
                <dd>{m.assessor_methods.map((x) => METHOD_LABEL[x] ?? x).join(', ')}</dd>
              </dl>
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table className="tbl">
                  <thead>
                    <tr>
                      <th scope="col">Archetype</th>
                      <th scope="col">Strength</th>
                      <th scope="col">What it looks like</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.evidence.map((e, i) => (
                      <tr key={`${e.emx_id}-${i}`}>
                        <td>{e.emx_id}</td>
                        <td>
                          <span className="pill" data-tone={e.strength === 'strong' ? 'good' : e.strength === 'adequate' ? 'info' : 'warn'}>
                            {e.strength}
                          </span>
                        </td>
                        <td>{e.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {m.anti_patterns.length > 0 && (
                <>
                  <h3 className="card-title" style={{ fontSize: 14, marginTop: 14 }}>Anti-patterns</h3>
                  <ul>
                    {m.anti_patterns.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
