// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// InfoPages.tsx — UI-02: CES-Shared overview, contracts, the module launch
// pages (Stamper, AdminOps, EvidenceOps) and the honest "not built yet" page.
import { useEffect, useState } from 'react';
import { FAMILIES, REQUIREMENTS, SPRS_META, totalDeduction, weightCounts } from '../referenceData';
import { loadArchetypeCatalog, loadEvidenceMatrix } from '../evidenceData';
import { OBJECTIVES } from '../objectivesData';
import { sharedApi, type Summary } from '@/shared/api/sharedApi';
import { actorLabel, useSharedViewer } from '../governedState';
import type { RouteId } from '../nav';
import { CONTRACTS, MODULES, moduleUrl, type ModuleKey } from '../modules';
import { PageHeader, Stat } from '../ui';

const ACTION_TEXT: Record<string, string> = {
  seed: 'Imported',
  'draft.create': 'Draft created',
  'draft.update': 'Draft updated',
  'draft.delete': 'Draft discarded',
  publish: 'Published',
  retire: 'Retired',
};
const KIND_TEXT: Record<string, string> = { requirement_meta: 'Requirement', archetype: 'Evidence archetype', mapping: 'Mapping', rule: 'Evaluation rule' };

export function SharedOverviewPage({ go }: { go: (r: RouteId) => void }) {
  const [archetypes, setArchetypes] = useState<number | null>(null);
  const [mapped, setMapped] = useState<number | null>(null);
  const viewer = useSharedViewer();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!viewer.signedIn) return;
    let live = true;
    void sharedApi.summary().then((r) => live && r.ok && setSummary(r.data));
    return () => {
      live = false;
    };
  }, [viewer.signedIn]);
  const exportRelease = async () => {
    const r = await sharedApi.exportRelease();
    if (!r.ok) return setExportMsg(r.message);
    const url = URL.createObjectURL(new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `ces-shared-release-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExportMsg('Release file downloaded: the published content, for BHD to merge into ces-shared.');
  };
  useEffect(() => {
    let live = true;
    loadArchetypeCatalog().then((c) => live && setArchetypes(c.archetypes.length), () => live && setArchetypes(-1));
    loadEvidenceMatrix().then((m) => live && setMapped(m.mappings.length), () => live && setMapped(-1));
    return () => {
      live = false;
    };
  }, []);
  const counts = weightCounts();
  const show = (n: number | null) => (n === null ? '…' : n < 0 ? 'n/a' : n);
  return (
    <div className="pg" data-testid="page-shared-overview">
      <PageHeader
        icon="◈"
        title="CES-Shared Overview"
        lede={
          viewer.signedIn
            ? 'Summary of reference data and configuration managed under CES-Shared. Requirements and SPRS weights are locked; evidence, mappings and rules change through drafts that a second administrator publishes.'
            : 'Reference data and contracts every CES module uses. One canonical copy in ces-shared; the portal shows it read-only.'
        }
        actions={
          viewer.canEdit && (
            <button type="button" className="btn btn-secondary" onClick={exportRelease} data-testid="overview-export">
              ⭳ Export release
            </button>
          )
        }
      />
      {exportMsg && <p className="note">{exportMsg}</p>}
      <div className={summary ? 'stats stats-6' : 'stats'}>
        <Stat icon="110" value={REQUIREMENTS.length} label="CMMC requirements" sub={`${FAMILIES.length} families`} />
        <Stat icon="Σ" value={totalDeduction()} label="SPRS points at stake" sub={`${counts[5]}×5 · ${counts[3]}×3 · ${counts[1]}×1 · ${counts[0]}×0`} />
        <Stat icon="▣" value={summary ? summary.items.archetype.published : show(archetypes)} label="Evidence archetypes" sub={summary ? `${summary.items.archetype.draft} draft` : undefined} testId="overview-archetypes" />
        <Stat
          icon="⇄"
          value={summary ? summary.items.mapping.published : show(mapped)}
          label={summary ? 'Requirement mappings' : 'Requirements mapped to evidence'}
          sub={summary ? `${summary.items.mapping.draft} draft` : `of ${REQUIREMENTS.length}`}
          tone="warn"
          testId="overview-mappings"
        />
        {summary && <Stat icon="⚙" value={summary.items.rule.published} label="Evaluation rules" sub={`${summary.items.rule.draft} draft`} testId="overview-rules" />}
        <Stat icon="{ }" value={CONTRACTS.length} label="Published contracts" />
      </div>
      <div className="grid-2">
        {[
          { r: 'shared/requirements' as RouteId, t: '110 Requirements', s: 'NIST SP 800-171 Rev. 2 text, family, level' },
          { r: 'shared/sprs' as RouteId, t: 'SPRS Weight Table', s: `Start ${SPRS_META.starting_score}, floor ${SPRS_META.floor_score}` },
          { r: 'shared/objectives' as RouteId, t: 'Assessment Objectives', s: `${OBJECTIVES.length} NIST SP 800-171A determination statements` },
          { r: 'shared/evidence' as RouteId, t: 'Standard Evidence Catalog', s: 'Acceptable forms and assessor methods' },
          { r: 'shared/mapping' as RouteId, t: 'Requirement-to-Evidence Mapping', s: 'Strength tiers and anti-patterns' },
          { r: 'shared/contracts' as RouteId, t: 'Golden Files', s: 'Contract versions and golden files' },
        ].map((x) => (
          <button key={x.r} type="button" className="link-card" onClick={() => go(x.r)}>
            <span className="stat-icon" aria-hidden="true">→</span>
            <span>
              <strong>{x.t}</strong>
              <small>{x.s}</small>
            </span>
          </button>
        ))}
      </div>
      {summary && summary.recentChanges.length > 0 && (
        <section className="card card-pad" style={{ marginTop: 16 }} aria-label="Recent updates" data-testid="overview-changes">
          <h2 className="sub">Recent Updates</h2>
          <div className="table-wrap">
            <table className="tbl tbl-compact">
            <thead>
              <tr>
                <th scope="col">Date &amp; Time</th>
                <th scope="col">User</th>
                <th scope="col">Activity</th>
                <th scope="col">Item</th>
              </tr>
            </thead>
            <tbody>
              {summary.recentChanges.map((c) => (
                <tr key={c.id}>
                  <td>{new Date(c.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td>{actorLabel(c.actor_user_id, viewer.userId)}</td>
                  <td>{ACTION_TEXT[c.action] ?? c.action}</td>
                  <td>
                    {KIND_TEXT[c.kind] ?? c.kind} · {c.item_key}
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

export function ContractsInfoPage() {
  return (
    <div className="pg" data-testid="page-contracts">
      <PageHeader
        icon="{ }"
        title="Golden Files"
        lede="The data contracts modules exchange. They are code (zod schemas) with tests and semantic versions, not records edited in a screen (PRD SH-FR-01…03)."
      />
      <p className="note" style={{ marginBottom: 14 }}>
        Versions below are those in the ces-mono snapshot of 2026-10-10. Tests and golden files run in CI and on a
        developer machine (<code>npm test -w ces-shared</code>), not in the browser — so this page has no "Run tests"
        or "Upload golden file" button (doc 14 M6, M7).
      </p>
      <section className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th scope="col">Contract</th>
                <th scope="col">Version</th>
                <th scope="col">Produced By</th>
                <th scope="col">Read By</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {CONTRACTS.map((c) => (
                <tr key={c.file}>
                  <td>
                    <strong>{c.name}</strong>
                  </td>
                  <td>
                    <span className="pill" data-tone="info">v{c.version}</span>
                  </td>
                  <td>{c.producer}</td>
                  <td>{c.consumer}</td>
                  <td>
                    <code>ces-shared/src/types/{c.file}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="pg-meta" style={{ marginTop: 12 }}>
        Golden examples: <code>ces-shared/src/data/infra-manifest.example.json</code>; Planner parity goldens:{' '}
        <code>ces-planner/scripts/golden/</code> (Aavya branch MG-04).
      </p>
    </div>
  );
}

export function ModulePage({ module }: { module: ModuleKey }) {
  const m = MODULES[module];
  const [url, setUrl] = useState(() => moduleUrl(module));
  const save = (v: string) => {
    setUrl(v);
    try {
      localStorage.setItem(`ces-module-url-${module}`, v);
    } catch {
      /* storage blocked */
    }
  };
  return (
    <div className="pg" data-testid={`page-module-${module}`}>
      <PageHeader icon={m.name[0]} title={m.name} lede={m.what} />
      <div className="card card-pad">
        <p className="note" data-tone="warn">
          {m.name} is still a separate app with its own sign-in (doc 18 §2). Moving it into this portal with one
          sign-in needs service identities between modules (BHD role review PB-08) — planned, not built.
        </p>
        <label className="form-row" style={{ marginTop: 14, maxWidth: 520 }}>
          Address of {m.name} on this machine
          <input className="input" type="url" value={url} onChange={(e) => save(e.target.value)} data-testid={`module-url-${module}`} />
          <span className="hint">Default http://localhost:{m.port}. Saved in this browser only.</span>
        </label>
        <a className="btn btn-primary" href={url} target="_blank" rel="noopener noreferrer" data-testid={`module-open-${module}`}>
          Open {m.name} in a new tab ↗
        </a>
      </div>
    </div>
  );
}

const NOT_BUILT: Partial<Record<RouteId, { title: string; why: string; needs: string[] }>> = {
  'shared/rules': {
    title: 'Evaluation Rules',
    why: 'CES has no "evaluation rule" object today. Requirements are judged by Stamper read-back verdicts and EvidenceOps determinations, which are code. The mockup\'s rule designer would be a new feature.',
    needs: [
      'BHD to confirm the feature is wanted and who owns the rules',
      'A store and a contract for rules in ces-shared',
      'How a rule changes a determination, and how that is audited',
    ],
  },
  'shared/tests': {
    title: 'Contract Tests',
    why: 'Contract tests run in CI, not in the browser (PRD SH-FR-02, SYS-NFR-08). Decision D-4 (2026-10-25): this screen will show the last CI test report read-only, plus a validator that checks a JSON file against a contract schema. Planned for release S1.6.',
    needs: [
      'A CI job that publishes the contract test report as JSON (BHD CI owner)',
      'Schemas for readiness record, render directive and tenant record (SH-FR-01, not yet in ces-shared)',
    ],
  },
  'shared/registry': {
    title: 'Contract Registry',
    why: 'The list of every versioned contract ces-shared publishes (plan bundle, readiness record, execution results, AdminOps evidence row, render directive, tenant record, approver token claims, manual evidence record — PRD SH-FR-01). Three of these schemas are not published yet.',
    needs: ['The three missing schemas in ces-shared (readiness record, render directive, tenant record)', 'BHD to confirm the registry is read-only in the portal (contracts change in code, SH-FR-03)'],
  },
  'shared/compat': {
    title: 'Version Compatibility',
    why: 'Shows which contract versions each module accepts (minor = additive, major = breaking, PRD SH-FR-03) and flags a consumer that would reject a producer.',
    needs: ['A machine-readable list of accepted versions per module', 'The CI contract-test report (decision D-4, release S1.6)'],
  },
  'shared/interfaces': {
    title: 'Interfaces',
    why: 'The module-to-module hand-offs (IF-MU-ST-01, IF-ST-MU-01, IF-ST-EO-01/02, IF-AO-EO-01, IF-EO-AO-01, IF-EC-EO-01, IF-MU-EO-01/02/03, IF-TN-ALL-01) with their contract, status and last exchange.',
    needs: ['Status per interface from each module (several are still pending in the BHD Excel)', 'BHD to confirm what the screen shows beyond the PRD list'],
  },
  'store/adminops': {
    title: 'AdminOps Evidence',
    why: 'The append-only AdminOps evidence rows (one per outcome: executed, failed, dry run, denied — AO-FR-10) in the shared evidence store. Today they are read in EvidenceOps, which runs as its own server.',
    needs: ['A read API over the shared evidence store for the portal (IF-AO-EO-01)', 'Access rules: customer evidence, not for platform administrators (BHD role review)'],
  },
  'store/tokens': {
    title: 'Approver Token Mints',
    why: 'Every approver token EvidenceOps issued (who, for whom, which tenant, lifetime — EO-FR-17), from its append-only mint log.',
    needs: ['A read API from EvidenceOps (its issuer only answers on the EvidenceOps machine, EO-FR-18)', 'BHD to confirm who may see the mint log'],
  },
  'store/passkeys': {
    title: 'Operator Passkey Events',
    why: 'Operator passkey enrolment and sign-in events (SYS-FR-07, EO-FR-18). The Excel notes these events are not append-only yet (SH-FR-05).',
    needs: ['Append-only storage for passkey events (SH-FR-05)', 'A read API from EvidenceOps'],
  },
  'store/integrity': {
    title: 'Storage Integrity',
    why: 'Re-checks the SHA-256 hash of stored evidence against its ledger entry and shows mismatches (SYS-FR-11, EO-FR-09).',
    needs: ['Database-level append-only guards (SH-FR-05)', 'A hash re-check job and its report'],
  },
  'engagements/tenants': {
    title: 'Tenant Registration',
    why: 'Plan push now checks the ces-tenant registry (MU-FR-16, Step 1). Picking and verifying a tenant per organisation is Step 2 in doc 21 and waits for BHD decisions 1–3.',
    needs: [
      'Decision 1 — bind the Microsoft tenant per party (recommended) or per engagement',
      'Decision 2 — operator proposes from the registry, customer admin proves by consent',
      'Decision 3 — what to do with slugs already claimed',
    ],
  },
};

export function NotBuiltPage({ route }: { route: RouteId }) {
  const info = NOT_BUILT[route];
  if (!info) return null;
  return (
    <div className="pg" data-testid="page-not-built">
      <PageHeader icon="…" title={info.title} lede="Not built yet." />
      <div className="card card-pad">
        <p>{info.why}</p>
        <h2 className="card-title">What It Needs</h2>
        <ul>
          {info.needs.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** S1.9: the top-bar Help page — short, role-aware answers to "how do I …". */
export function HelpPage({ role, go }: { role: string | null; go: (r: RouteId) => void }) {
  const admin = role === 'platform_admin';
  const topics: { q: string; a: string; to?: RouteId; label?: string }[] = [
    {
      q: 'Find a requirement, its SPRS weight and its objectives',
      a: 'Open CES-Shared → 110 Requirements and search by ID, NIST reference or text. Select a row to see its weight, partial credit and objectives.',
      to: 'shared/requirements',
      label: 'Open 110 Requirements',
    },
    ...(admin
      ? [
          {
            q: 'Create, edit or delete a requirement',
            a: 'In 110 Requirements use Import / Update → Create requirement, or the ⋮ menu on a row. Changes are saved as drafts; another platform administrator publishes them. The 110 NIST requirements keep their ID, text, family and SPRS weight; you can add organisation-defined requirements.',
            to: 'shared/requirements' as RouteId,
            label: 'Open 110 Requirements',
          },
          {
            q: 'Import many changes at once',
            a: 'Import / Update → Bulk import (CSV). Download the template first; each row becomes a draft you can review before publishing.',
          },
          {
            q: 'Add a user or reset a password',
            a: 'Platform / Administration → Users. New users get a one-time password and must change it at first sign-in.',
            to: 'platform/users' as RouteId,
            label: 'Open Users',
          },
        ]
      : [
          {
            q: 'See your engagements',
            a: 'Home / Portfolio shows status, milestones and recent activity; Engagements → All Engagements lists them all.',
            to: 'home' as RouteId,
            label: 'Open Home',
          },
        ]),
    {
      q: 'Forgot your password',
      a: 'Sign out, then choose "Forgot password?" on the sign-in page. A link that works once for 30 minutes is sent to your work email.',
    },
    {
      q: 'Why was I signed out?',
      a: 'CES signs you out after 30 minutes without activity. Two minutes before, a message lets you stay signed in.',
    },
    { q: 'Hide or show the navigation panel', a: 'Use the menu button (☰) at the top left.' },
  ];
  return (
    <div className="pg" data-testid="page-help">
      <PageHeader
        icon="?"
        title="Help"
        lede="Quick answers for common tasks. For anything else, contact your platform administrator."
      />
      <div className="help-list">
        {topics.map((t) => (
          <section key={t.q} className="card card-pad">
            <h2 className="card-title">{t.q}</h2>
            <p>{t.a}</p>
            {t.to && (
              <button type="button" className="row-btn" onClick={() => go(t.to!)}>
                {t.label} →
              </button>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
