// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// HomeAndEngagements.tsx — UI-02: Home / Portfolio and All Engagements
// (mockups 2, 14). Only real data:
//   - "On this device": engagements, organisations and interviews in this
//     browser's Muster database (offline-first, IndexedDB).
//   - "On muster-api": GET /api/engagements, when signed in with a role that
//     may read engagements.
// The mockup's portfolio charts (on track / at risk / overdue, milestones,
// CMMC level distribution) need engagement status and dates that CES does not
// record yet, so they are not drawn.
import { useEffect, useState } from 'react';
import { api } from '@/shared/api/musterApi';
import type { MusterView, RouteId, Viewer } from '../nav';
import { Empty, PageHeader, Stat } from '../ui';
import { REQUIREMENTS } from '../referenceData';
import { loadLocalEngagements, type LocalEngagementRow } from '../localEngagements';

const KIND_LABEL: Record<string, string> = {
  individual_contractor: 'Single contractor',
  prime_and_subs: 'Prime + subcontractors',
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function useLocal() {
  const [rows, setRows] = useState<LocalEngagementRow[] | null>(null);
  useEffect(() => {
    let live = true;
    loadLocalEngagements().then((r) => live && setRows(r), () => live && setRows([]));
    return () => {
      live = false;
    };
  }, []);
  return rows;
}

function LocalTable({ rows, openMuster }: { rows: LocalEngagementRow[]; openMuster: (v: MusterView) => void }) {
  if (rows.length === 0) {
    return (
      <Empty>
        No engagement on this device yet.{' '}
        <button type="button" className="row-btn" onClick={() => openMuster('assessment')}>
          Start one in Muster
        </button>
      </Empty>
    );
  }
  return (
    <div className="table-wrap">
      <table className="tbl" data-testid="local-engagements">
        <thead>
          <tr>
            <th scope="col">Organisation</th>
            <th scope="col">Type</th>
            <th scope="col">Started</th>
            <th scope="col">Interview</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <strong>{r.organizations.join(', ') || 'Unnamed'}</strong>
              </td>
              <td>{KIND_LABEL[r.kind] ?? r.kind}</td>
              <td>{fmtDate(r.created_at)}</td>
              <td>
                {r.complete > 0 && <span className="pill" data-tone="good">{r.complete} complete</span>}{' '}
                {r.inProgress > 0 && <span className="pill" data-tone="info">{r.inProgress} in progress</span>}
                {r.complete === 0 && r.inProgress === 0 && <span className="pill">Not started</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HomePage({
  viewer,
  name,
  go,
  openMuster,
}: {
  viewer: Viewer;
  name: string | null;
  go: (r: RouteId) => void;
  openMuster: (v: MusterView) => void;
}) {
  const rows = useLocal();
  const inProgress = rows?.reduce((n, r) => n + r.inProgress, 0) ?? 0;
  const complete = rows?.reduce((n, r) => n + r.complete, 0) ?? 0;
  return (
    <div className="pg" data-testid="page-home">
      <PageHeader
        icon="⌂"
        title={name ? `Welcome, ${name}` : 'Home'}
        lede={
          viewer.kind === 'offline'
            ? 'Working offline: everything below is on this device.'
            : 'Your engagements and the CES modules. Counts are from this device unless marked otherwise.'
        }
        actions={
          <button type="button" className="btn btn-primary" onClick={() => openMuster('assessment')} data-testid="home-continue">
            {inProgress > 0 ? 'Continue interview →' : 'Start an assessment →'}
          </button>
        }
      />
      <div className="stats">
        <Stat icon="▤" value={rows ? rows.length : '…'} label="Engagements on this device" testId="home-stat-engagements" />
        <Stat icon="⏵" value={rows ? inProgress : '…'} label="Interviews in progress" tone="warn" />
        <Stat icon="✓" value={rows ? complete : '…'} label="Interviews complete" tone="good" />
        <Stat icon="110" value={REQUIREMENTS.length} label="Requirements in scope" sub="CMMC Level 2" tone="muster" />
      </div>
      <div className="grid-2">
        <section className="card">
          <div className="card-pad" style={{ paddingBottom: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 className="card-title">Recent engagements</h2>
            <button type="button" className="row-btn" onClick={() => go('engagements/all')}>
              View all
            </button>
          </div>
          {rows ? <LocalTable rows={rows.slice(0, 5)} openMuster={openMuster} /> : <Empty>Loading…</Empty>}
        </section>
        <section className="card card-pad">
          <h2 className="card-title">Modules</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {[
              { mod: 'muster', t: 'Muster', s: 'Assess & plan', on: () => openMuster('assessment') },
              { mod: 'stamper', t: 'Stamper', s: 'Configure & verify', on: () => go('module/stamper') },
              { mod: 'adminops', t: 'AdminOps', s: 'Govern changes', on: () => go('module/adminops') },
              { mod: 'evidenceops', t: 'EvidenceOps', s: 'Prove & maintain', on: () => go('module/evidenceops') },
            ].map((m) => (
              <button key={m.t} type="button" className="link-card" onClick={m.on} data-testid={`home-module-${m.mod}`}>
                <span className="portal-icon" data-mod={m.mod} aria-hidden="true">
                  {m.t[0]}
                </span>
                <span>
                  <strong>{m.t}</strong>
                  <small>{m.s}</small>
                </span>
                <span aria-hidden="true" style={{ marginLeft: 'auto' }}>
                  →
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

interface ServerEngagement {
  id: string;
  engagement_kind: string;
  created_at: string;
}

export function EngagementsPage({ viewer, openMuster }: { viewer: Viewer; openMuster: (v: MusterView) => void }) {
  const rows = useLocal();
  const canRead = viewer.kind === 'signed-in' && ['prime', 'bhd_operator', 'assessor_read_only'].includes(viewer.role);
  const [server, setServer] = useState<{ state: 'idle' | 'loading' | 'error' | 'ready'; rows: ServerEngagement[]; message?: string }>({ state: 'idle', rows: [] });
  useEffect(() => {
    if (!canRead) return;
    let live = true;
    setServer({ state: 'loading', rows: [] });
    api.get<ServerEngagement[] | { engagements: ServerEngagement[] }>('/engagements').then((r) => {
      if (!live) return;
      if (!r.ok) setServer({ state: 'error', rows: [], message: r.status === 0 ? 'muster-api is not reachable' : `muster-api returned ${r.status}` });
      else setServer({ state: 'ready', rows: Array.isArray(r.data) ? r.data : r.data.engagements ?? [] });
    });
    return () => {
      live = false;
    };
  }, [canRead]);

  return (
    <div className="pg" data-testid="page-engagements">
      <PageHeader
        icon="▤"
        title="All engagements"
        lede="Compliance engagements: the organisations being assessed and where each interview stands."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => openMuster('assessment')} data-testid="engagements-create">
            + Create engagement
          </button>
        }
      />
      <section className="card" style={{ marginBottom: 16 }}>
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <h2 className="card-title">On this device</h2>
        </div>
        {rows ? <LocalTable rows={rows} openMuster={openMuster} /> : <Empty>Loading…</Empty>}
      </section>
      <section className="card">
        <div className="card-pad">
          <h2 className="card-title">On muster-api</h2>
          {!canRead && (
            <p className="pg-meta">
              {viewer.kind === 'offline' ? 'Sign in to see engagements stored on muster-api.' : 'Your role does not read server engagements.'}
            </p>
          )}
          {server.state === 'loading' && <p className="pg-meta">Loading…</p>}
          {server.state === 'error' && <p className="note" data-tone="warn">{server.message}</p>}
          {server.state === 'ready' && server.rows.length === 0 && <p className="pg-meta">No engagements for your organisation on muster-api.</p>}
        </div>
        {server.state === 'ready' && server.rows.length > 0 && (
          <div className="table-wrap">
            <table className="tbl" data-testid="server-engagements">
              <thead>
                <tr>
                  <th scope="col">Engagement ID</th>
                  <th scope="col">Type</th>
                  <th scope="col">Created</th>
                </tr>
              </thead>
              <tbody>
                {server.rows.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <code>{e.id}</code>
                    </td>
                    <td>{KIND_LABEL[e.engagement_kind] ?? e.engagement_kind}</td>
                    <td>{fmtDate(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
