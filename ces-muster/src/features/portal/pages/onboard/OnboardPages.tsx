// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// OnboardPages.tsx — Sprint 3 slice "Onboard" (navigation workbook groups
// Organization Management, Tenant Management, Compliance Scope). Real data from
// muster-api only; the Aavya portal theme (PageHeader / Stat / Drawer / tables).
// Write controls follow the lifecycle RBAC matrix (rbac.ts) — the API enforces
// the same rule (prime | bhd_operator, platform roles by inheritance).

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { Viewer } from '../../nav';
import { actionsFor } from '../../lifecycle/rbac';
import { ConfirmDialog, Drawer, RowActions, Toast } from '../../governed';
import { Empty, PageHeader, Stat } from '../../ui';
import {
  CONTRACT_CLAUSES,
  SCOPE_CATEGORIES,
  SCOPE_CATEGORY_LABEL,
  failureText,
  onboardApi,
  type ConnectionTest,
  type CustomerTenant,
  type CustomerTenantInput,
  type EngagementRow,
  type Organization,
  type OrganizationInput,
  type ScopeAsset,
  type ScopeAssetInput,
  type ScopeBoundary,
  type ScopeCategory,
} from './onboardApi';

const canEdit = (viewer: Viewer, group: string) => viewer.kind === 'signed-in' && actionsFor(viewer.role, 'onboard', group).includes('edit');
const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

function useList<T>(load: () => Promise<{ ok: true; data: T } | { ok: false; status: number; degraded: boolean; error?: string }>, deps: unknown[] = []) {
  const [rows, setRows] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setRows(null);
    load().then((r) => {
      if (!live) return;
      if (r.ok) setRows(r.data);
      else setError(failureText(r));
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);
  return { rows, error, reload: () => setTick((t) => t + 1) };
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="form-row">
      {label}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

// ====================================================================== organisations
const EMPTY_ORG: OrganizationInput = { legal_name: '', dba_name: '', uei: '', cage: '', website: '', address: '', primary_contact_name: '', primary_contact_email: '', contract_clauses: [], status: 'active', notes: '' };

function OrganizationForm({ initial, onSaved, onClose }: { initial: Organization | null; onSaved: (msg: string) => void; onClose: () => void }) {
  const [f, setF] = useState<OrganizationInput>(initial ? { ...EMPTY_ORG, ...initial } : EMPTY_ORG);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof OrganizationInput>(k: K, v: OrganizationInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { ...f, uei: f.uei || null, cage: f.cage || null, website: f.website || null, primary_contact_email: f.primary_contact_email || null };
    const r = initial ? await onboardApi.organizations.update(initial.id, body) : await onboardApi.organizations.create(body);
    setBusy(false);
    if (r.ok) onSaved(initial ? `${r.data.legal_name} updated.` : `${r.data.legal_name} created.`);
    else setError(failureText(r));
  };
  return (
    <Drawer
      title={initial ? 'Edit organisation' : 'Create organisation'}
      subtitle="Legal identity the engagement, tenants and SSP will reference."
      onClose={onClose}
      testId="org-drawer"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="org-form" className="btn btn-primary" disabled={busy} data-testid="org-submit">{busy ? 'Saving…' : initial ? 'Save changes' : 'Create organisation'}</button>
        </>
      }
    >
      <form id="org-form" onSubmit={submit}>
        {error && <p className="form-error" role="alert">{error}</p>}
        <Field label="Legal name *"><input className="input" value={f.legal_name} onChange={(e) => set('legal_name', e.target.value)} required minLength={2} data-testid="org-legal-name" /></Field>
        <Field label="Doing business as"><input className="input" value={f.dba_name ?? ''} onChange={(e) => set('dba_name', e.target.value)} /></Field>
        <div className="form-grid-2">
          <Field label="UEI" hint="12 characters (SAM.gov)"><input className="input" value={f.uei ?? ''} onChange={(e) => set('uei', e.target.value.toUpperCase())} maxLength={12} /></Field>
          <Field label="CAGE" hint="5 characters"><input className="input" value={f.cage ?? ''} onChange={(e) => set('cage', e.target.value.toUpperCase())} maxLength={5} /></Field>
        </div>
        <Field label="Website"><input className="input" type="url" value={f.website ?? ''} onChange={(e) => set('website', e.target.value)} placeholder="https://" /></Field>
        <Field label="Address"><textarea className="input" rows={2} value={f.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field>
        <div className="form-grid-2">
          <Field label="Primary contact"><input className="input" value={f.primary_contact_name ?? ''} onChange={(e) => set('primary_contact_name', e.target.value)} /></Field>
          <Field label="Contact email"><input className="input" type="email" value={f.primary_contact_email ?? ''} onChange={(e) => set('primary_contact_email', e.target.value)} /></Field>
        </div>
        <fieldset className="form-row" style={{ border: 0, padding: 0 }}>
          <legend style={{ marginBottom: 6 }}>Contract clauses that apply</legend>
          {CONTRACT_CLAUSES.map((c) => (
            <label key={c} style={{ fontWeight: 400, display: 'block' }}>
              <input type="checkbox" checked={f.contract_clauses.includes(c)} onChange={(e) => set('contract_clauses', e.target.checked ? [...f.contract_clauses, c] : f.contract_clauses.filter((x) => x !== c))} /> {c}
            </label>
          ))}
        </fieldset>
        <Field label="Status">
          <select className="select" value={f.status} onChange={(e) => set('status', e.target.value as 'active' | 'inactive')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
        <Field label="Notes"><textarea className="input" rows={3} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
      </form>
    </Drawer>
  );
}

export function OrganizationsPage({ viewer }: { viewer: Viewer }) {
  const { rows, error, reload } = useList(onboardApi.organizations.list);
  const [editing, setEditing] = useState<Organization | null | 'new'>(null);
  const [deleting, setDeleting] = useState<Organization | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const writable = canEdit(viewer, 'organization-management');
  const shown = useMemo(() => (rows ?? []).filter((o) => !q || `${o.legal_name} ${o.dba_name ?? ''} ${o.uei ?? ''} ${o.cage ?? ''}`.toLowerCase().includes(q.toLowerCase())), [rows, q]);
  const saved = (msg: string) => { setEditing(null); setToast(msg); reload(); };
  const doDelete = async () => {
    if (!deleting) return;
    const r = await onboardApi.organizations.remove(deleting.id);
    if (r.ok) { setToast(`${deleting.legal_name} deleted.`); setDeleting(null); reload(); } else setDeleteError(failureText(r));
  };
  return (
    <div className="pg" data-testid="page-onboard-organizations">
      <PageHeader
        icon="engagements"
        title="Organisations"
        lede="The defence contractors being onboarded: legal identity, SAM.gov identifiers and the DFARS / FAR clauses that bring them under CMMC."
        actions={writable && <button type="button" className="btn btn-primary" onClick={() => setEditing('new')} data-testid="org-create">Create organisation</button>}
      />
      <div className="stats">
        <Stat icon="engagements" value={rows?.length ?? '—'} label="Organisations" />
        <Stat icon="tenants" value={rows ? rows.filter((o) => o.status === 'active').length : '—'} label="Active" tone="good" />
        <Stat icon="contracts" value={rows ? rows.filter((o) => o.contract_clauses.includes('DFARS 252.204-7021')).length : '—'} label="With 7021 (CMMC) clause" />
      </div>
      <div className="toolbar">
        <label className="grow">
          <span className="sr-only">Search</span>
          <input className="input" placeholder="Search name, UEI, CAGE" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {rows && shown.length === 0 && <Empty>{rows.length === 0 ? 'No organisation yet.' : 'Nothing matches.'}{writable && rows.length === 0 && <> <button type="button" className="row-btn" onClick={() => setEditing('new')}>Create the first one</button></>}</Empty>}
      {shown.length > 0 && (
        <div className="table-wrap">
          <table className="tbl" data-testid="org-table">
            <thead>
              <tr><th scope="col">Organisation</th><th scope="col">UEI / CAGE</th><th scope="col">Clauses</th><th scope="col">Contact</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {shown.map((o) => (
                <tr key={o.id}>
                  <td><strong>{o.legal_name}</strong>{o.dba_name && <div className="hint">dba {o.dba_name}</div>}</td>
                  <td>{o.uei ?? '—'} / {o.cage ?? '—'}</td>
                  <td>{o.contract_clauses.length ? o.contract_clauses.map((c) => <span key={c} className="pill" style={{ marginRight: 4 }}>{c.replace('DFARS 252.204-', '').replace('FAR 52.204-', 'FAR ')}</span>) : '—'}</td>
                  <td>{o.primary_contact_name ?? '—'}{o.primary_contact_email && <div className="hint">{o.primary_contact_email}</div>}</td>
                  <td><span className="pill" data-tone={o.status === 'active' ? 'good' : undefined}>{o.status}</span></td>
                  <td>
                    {writable && (
                      <RowActions label={`Actions for ${o.legal_name}`} actions={[
                        { label: 'Edit', onSelect: () => setEditing(o) },
                        { label: 'Delete', tone: 'danger', onSelect: () => { setDeleteError(null); setDeleting(o); } },
                      ]} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <OrganizationForm initial={editing === 'new' ? null : editing} onSaved={saved} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog title="Delete organisation" confirmLabel="Delete" error={deleteError} onConfirm={doDelete} onCancel={() => setDeleting(null)}>
          <p><strong>{deleting.legal_name}</strong> will be removed. Tenant registrations that still reference it block the delete.</p>
        </ConfirmDialog>
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

// ====================================================================== customer tenants
const EMPTY_TENANT: CustomerTenantInput = { organization_id: null, display_name: '', entra_tenant_id: '', primary_domain: '', cloud: 'gcc_high', app_registration_id: '', certificate_thumbprint: '', status: 'registered', notes: '' };
const TENANT_STATUS_TONE: Record<CustomerTenant['status'], 'good' | 'warn' | 'bad' | undefined> = { registered: undefined, consented: 'warn', live_enabled: 'good', disabled: 'bad' };

function TenantForm({ initial, organizations, onSaved, onClose }: { initial: CustomerTenant | null; organizations: Organization[]; onSaved: (m: string) => void; onClose: () => void }) {
  const [f, setF] = useState<CustomerTenantInput>(initial ? { ...EMPTY_TENANT, ...initial } : EMPTY_TENANT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof CustomerTenantInput>(k: K, v: CustomerTenantInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = { ...f, organization_id: f.organization_id || null, entra_tenant_id: f.entra_tenant_id || null, primary_domain: f.primary_domain || null, app_registration_id: f.app_registration_id || null, certificate_thumbprint: f.certificate_thumbprint || null };
    const r = initial ? await onboardApi.tenants.update(initial.id, body) : await onboardApi.tenants.create(body);
    setBusy(false);
    if (r.ok) onSaved(initial ? `${r.data.display_name} updated.` : `${r.data.display_name} registered.`);
    else setError(failureText(r));
  };
  return (
    <Drawer
      title={initial ? 'Edit tenant registration' : 'Register tenant'}
      subtitle="The customer's Microsoft 365 GCC High tenant that Muster, Stamper and AdminOps will read from. Certificates stay on the BHD runner — only the thumbprint is recorded here."
      onClose={onClose}
      testId="tenant-drawer"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" form="tenant-form" className="btn btn-primary" disabled={busy} data-testid="tenant-submit">{busy ? 'Saving…' : initial ? 'Save changes' : 'Register tenant'}</button>
        </>
      }
    >
      <form id="tenant-form" onSubmit={submit}>
        {error && <p className="form-error" role="alert">{error}</p>}
        <Field label="Display name *"><input className="input" value={f.display_name} onChange={(e) => set('display_name', e.target.value)} required minLength={2} data-testid="tenant-name" /></Field>
        <Field label="Organisation">
          <select className="select" value={f.organization_id ?? ''} onChange={(e) => set('organization_id', e.target.value || null)}>
            <option value="">— none —</option>
            {organizations.map((o) => <option key={o.id} value={o.id}>{o.legal_name}</option>)}
          </select>
        </Field>
        <div className="form-grid-2">
          <Field label="Entra tenant id" hint="GUID from the Entra admin centre"><input className="input" value={f.entra_tenant_id ?? ''} onChange={(e) => set('entra_tenant_id', e.target.value.trim())} /></Field>
          <Field label="Primary domain"><input className="input" value={f.primary_domain ?? ''} onChange={(e) => set('primary_domain', e.target.value.trim())} placeholder="contoso.onmicrosoft.us" /></Field>
        </div>
        <Field label="Cloud" hint="Only GCC High is implemented by the engine today.">
          <select className="select" value={f.cloud} onChange={(e) => set('cloud', e.target.value as CustomerTenantInput['cloud'])}>
            <option value="gcc_high">GCC High</option>
            <option value="gcc">GCC</option>
            <option value="commercial">Commercial</option>
          </select>
        </Field>
        <div className="form-grid-2">
          <Field label="App registration id"><input className="input" value={f.app_registration_id ?? ''} onChange={(e) => set('app_registration_id', e.target.value.trim())} /></Field>
          <Field label="Certificate thumbprint" hint="SHA-1, 40 hex characters"><input className="input" value={f.certificate_thumbprint ?? ''} onChange={(e) => set('certificate_thumbprint', e.target.value.trim().toUpperCase())} maxLength={40} /></Field>
        </div>
        <Field label="Status" hint="Live access itself is granted per engagement (Live gate), not here.">
          <select className="select" value={f.status} onChange={(e) => set('status', e.target.value as CustomerTenantInput['status'])}>
            <option value="registered">Registered</option>
            <option value="consented">Consented</option>
            <option value="live_enabled">Live enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </Field>
        <Field label="Notes"><textarea className="input" rows={3} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
      </form>
    </Drawer>
  );
}

function ConnectionPanel({ tenant, onClose }: { tenant: CustomerTenant; onClose: () => void }) {
  const [result, setResult] = useState<ConnectionTest | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    onboardApi.tenants.testConnection(tenant.id).then((r) => (r.ok ? setResult(r.data) : setError(failureText(r))));
  }, [tenant.id]);
  return (
    <Drawer title={`Connection status — ${tenant.display_name}`} subtitle="Prerequisite check only. Nothing is read from the tenant until the runner integration lands (Sprint 5)." onClose={onClose} testId="tenant-connection" footer={<button type="button" className="btn btn-primary" onClick={onClose}>Done</button>}>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!result && !error && <p className="hint">Checking…</p>}
      {result && (
        <>
          <p><span className="pill" data-tone={result.connection_status === 'prerequisites_complete' ? 'good' : 'warn'}>{result.connection_status === 'prerequisites_complete' ? 'Prerequisites complete' : 'Prerequisites missing'}</span></p>
          <ul className="checklist" data-testid="connection-checks">
            {result.checks.map((c) => (
              <li key={c.id}><span className="pill" data-tone={c.ok ? 'good' : 'bad'}>{c.ok ? 'OK' : 'Missing'}</span> {c.label}{c.note && <div className="hint">{c.note}</div>}</li>
            ))}
          </ul>
        </>
      )}
    </Drawer>
  );
}

export function CustomerTenantsPage({ viewer }: { viewer: Viewer }) {
  const tenants = useList(onboardApi.tenants.list);
  const orgs = useList(onboardApi.organizations.list);
  const [editing, setEditing] = useState<CustomerTenant | null | 'new'>(null);
  const [testing, setTesting] = useState<CustomerTenant | null>(null);
  const [deleting, setDeleting] = useState<CustomerTenant | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const writable = canEdit(viewer, 'tenant-management');
  const orgName = (id: string | null) => (orgs.rows ?? []).find((o) => o.id === id)?.legal_name ?? '—';
  const rows = tenants.rows ?? [];
  const doDelete = async () => {
    if (!deleting) return;
    const r = await onboardApi.tenants.remove(deleting.id);
    if (r.ok) { setToast(`${deleting.display_name} removed.`); setDeleting(null); tenants.reload(); } else setDeleteError(failureText(r));
  };
  return (
    <div className="pg" data-testid="page-onboard-tenants">
      <PageHeader
        icon="tenants"
        title="Customer tenants"
        lede="Microsoft 365 GCC High tenant registrations. Registration records the identifiers; consent and live access are separate, logged acts."
        actions={writable && <button type="button" className="btn btn-primary" onClick={() => setEditing('new')} data-testid="tenant-register">Register tenant</button>}
      />
      <div className="stats">
        <Stat icon="tenants" value={tenants.rows ? rows.length : '—'} label="Registered" />
        <Stat icon="discovery" value={tenants.rows ? rows.filter((t) => t.status === 'live_enabled').length : '—'} label="Live enabled" tone="good" />
        <Stat icon="integrity" value={tenants.rows ? rows.filter((t) => t.connection_status === 'prerequisites_complete').length : '—'} label="Prerequisites complete" />
      </div>
      {tenants.error && <p className="form-error" role="alert">{tenants.error}</p>}
      {tenants.rows && rows.length === 0 && <Empty>No tenant registered yet.</Empty>}
      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="tbl" data-testid="tenant-table">
            <thead><tr><th scope="col">Tenant</th><th scope="col">Organisation</th><th scope="col">Cloud</th><th scope="col">Status</th><th scope="col">Connection</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.display_name}</strong>{t.primary_domain && <div className="hint">{t.primary_domain}</div>}</td>
                  <td>{orgName(t.organization_id)}</td>
                  <td>{t.cloud === 'gcc_high' ? 'GCC High' : t.cloud === 'gcc' ? 'GCC' : 'Commercial'}</td>
                  <td><span className="pill" data-tone={TENANT_STATUS_TONE[t.status]}>{t.status.replace('_', ' ')}</span></td>
                  <td>{t.connection_status ? <><span className="pill" data-tone={t.connection_status === 'prerequisites_complete' ? 'good' : 'warn'}>{t.connection_status === 'prerequisites_complete' ? 'ready' : 'incomplete'}</span><div className="hint">{fmt(t.connection_tested_at)}</div></> : <span className="hint">not tested</span>}</td>
                  <td>
                    <RowActions label={`Actions for ${t.display_name}`} actions={[
                      { label: 'Test connection', onSelect: () => setTesting(t), disabledReason: writable ? undefined : 'Your role cannot run checks' },
                      { label: 'Edit', onSelect: () => setEditing(t), disabledReason: writable ? undefined : 'Your role cannot edit' },
                      { label: 'Remove', tone: 'danger', onSelect: () => { setDeleteError(null); setDeleting(t); }, disabledReason: !writable ? 'Your role cannot remove' : t.status === 'live_enabled' ? 'Disable live access first' : undefined },
                    ]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <TenantForm initial={editing === 'new' ? null : editing} organizations={orgs.rows ?? []} onSaved={(m) => { setEditing(null); setToast(m); tenants.reload(); }} onClose={() => setEditing(null)} />}
      {testing && <ConnectionPanel tenant={testing} onClose={() => { setTesting(null); tenants.reload(); }} />}
      {deleting && (
        <ConfirmDialog title="Remove tenant registration" confirmLabel="Remove" error={deleteError} onConfirm={doDelete} onCancel={() => setDeleting(null)}>
          <p><strong>{deleting.display_name}</strong> will be removed from the registry. Nothing is changed in the customer's tenant.</p>
        </ConfirmDialog>
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

// ====================================================================== compliance scope
const SCOPE_ENG_KEY = 'ces.onboard.scope.engagement';
const EMPTY_ASSET: ScopeAssetInput = { name: '', asset_type: '', category: 'cui', location: '', owner: '', external_provider: false, notes: '' };
const CATEGORY_TONE: Record<ScopeCategory, 'good' | 'warn' | 'bad' | 'muster' | undefined> = { cui: 'bad', security_protection: 'warn', contractor_risk_managed: undefined, specialized: 'muster', out_of_scope: 'good' };

function AssetForm({ eid, initial, onSaved, onClose }: { eid: string; initial: ScopeAsset | null; onSaved: (m: string) => void; onClose: () => void }) {
  const [f, setF] = useState<ScopeAssetInput>(initial ? { ...EMPTY_ASSET, ...initial } : EMPTY_ASSET);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ScopeAssetInput>(k: K, v: ScopeAssetInput[K]) => setF((p) => ({ ...p, [k]: v }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const body = { ...f, location: f.location || null, owner: f.owner || null, notes: f.notes || null };
    const r = initial ? await onboardApi.scope.updateAsset(eid, initial.id, body) : await onboardApi.scope.addAsset(eid, body);
    setBusy(false);
    if (r.ok) onSaved(initial ? `${r.data.name} updated.` : `${r.data.name} added.`);
    else setError(failureText(r));
  };
  return (
    <Drawer title={initial ? 'Edit asset' : 'Add asset'} subtitle="Categorise per the CMMC Level 2 Scoping Guide. The category decides which requirements the asset is assessed against." onClose={onClose} testId="asset-drawer"
      footer={<><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button type="submit" form="asset-form" className="btn btn-primary" disabled={busy} data-testid="asset-submit">{busy ? 'Saving…' : initial ? 'Save' : 'Add asset'}</button></>}>
      <form id="asset-form" onSubmit={submit}>
        {error && <p className="form-error" role="alert">{error}</p>}
        <Field label="Name *"><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} required data-testid="asset-name" /></Field>
        <div className="form-grid-2">
          <Field label="Asset type *" hint="e.g. file server, laptop, SharePoint site, MFA service"><input className="input" value={f.asset_type} onChange={(e) => set('asset_type', e.target.value)} required /></Field>
          <Field label="Category *">
            <select className="select" value={f.category} onChange={(e) => set('category', e.target.value as ScopeCategory)} data-testid="asset-category">
              {SCOPE_CATEGORIES.map((c) => <option key={c} value={c}>{SCOPE_CATEGORY_LABEL[c]}</option>)}
            </select>
          </Field>
        </div>
        <div className="form-grid-2">
          <Field label="Location"><input className="input" value={f.location ?? ''} onChange={(e) => set('location', e.target.value)} placeholder="GCC High / on-prem / ESP" /></Field>
          <Field label="Owner"><input className="input" value={f.owner ?? ''} onChange={(e) => set('owner', e.target.value)} /></Field>
        </div>
        <label className="form-row" style={{ fontWeight: 400 }}><input type="checkbox" checked={f.external_provider} onChange={(e) => set('external_provider', e.target.checked)} /> Operated by an external service provider (ESP / CSP)</label>
        <Field label="Notes"><textarea className="input" rows={2} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
      </form>
    </Drawer>
  );
}

export function ScopePage({ viewer }: { viewer: Viewer }) {
  const engagements = useList(onboardApi.engagements);
  const [eid, setEid] = useState<string>(() => { try { return localStorage.getItem(SCOPE_ENG_KEY) ?? ''; } catch { return ''; } });
  useEffect(() => {
    if (!eid && engagements.rows?.length) setEid(engagements.rows[0].id);
  }, [engagements.rows, eid]);
  useEffect(() => { try { if (eid) localStorage.setItem(SCOPE_ENG_KEY, eid); } catch { /* per-viewer convenience only */ } }, [eid]);

  const assets = useList(useCallback(() => (eid ? onboardApi.scope.assets(eid) : Promise.resolve({ ok: true as const, data: [] as ScopeAsset[] })), [eid]), [eid]);
  const boundaries = useList(useCallback(() => (eid ? onboardApi.scope.boundaries(eid) : Promise.resolve({ ok: true as const, data: [] as ScopeBoundary[] })), [eid]), [eid]);
  const [editing, setEditing] = useState<ScopeAsset | null | 'new'>(null);
  const [deleting, setDeleting] = useState<ScopeAsset | null>(null);
  const [confirming, setConfirming] = useState<ScopeBoundary | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [narrative, setNarrative] = useState('');
  const [filter, setFilter] = useState<ScopeCategory | 'all'>('all');
  const [toast, setToast] = useState<string | null>(null);
  const writable = canEdit(viewer, 'compliance-scope');
  const approver = viewer.kind === 'signed-in' && actionsFor(viewer.role, 'onboard', 'compliance-scope').some((a) => a === 'approve' || a === 'edit');

  const rows = assets.rows ?? [];
  const byCat = (c: ScopeCategory) => rows.filter((a) => a.category === c).length;
  const shown = filter === 'all' ? rows : rows.filter((a) => a.category === filter);
  const confirmed = (boundaries.rows ?? []).find((b) => b.status === 'confirmed') ?? null;
  const draft = (boundaries.rows ?? []).find((b) => b.status === 'draft') ?? null;
  const reloadAll = () => { assets.reload(); boundaries.reload(); };

  const doDelete = async () => {
    if (!deleting) return;
    const r = await onboardApi.scope.removeAsset(eid, deleting.id);
    if (r.ok) { setToast(`${deleting.name} removed.`); setDeleting(null); assets.reload(); } else setActionError(failureText(r));
  };
  const createDraft = async () => {
    const r = await onboardApi.scope.draftBoundary(eid, { narrative: narrative || null });
    if (r.ok) { setToast(`Boundary v${r.data.version} drafted.`); setNarrative(''); boundaries.reload(); } else setActionError(failureText(r));
  };
  const doConfirm = async () => {
    if (!confirming) return;
    const r = await onboardApi.scope.confirmBoundary(eid, confirming.id);
    if (r.ok) { setToast(`Boundary v${r.data.version} confirmed.`); setConfirming(null); reloadAll(); } else setActionError(failureText(r));
  };
  const engLabel = (e: EngagementRow) => e.name || e.reference_id || `${e.engagement_kind} · ${e.id.slice(0, 8)}`;

  return (
    <div className="pg" data-testid="page-onboard-scope">
      <PageHeader
        icon="situation"
        title="Compliance scope"
        lede="Which systems, people and providers handle CUI — and the boundary the SSP, the assessment and the evidence collection are measured against. A boundary is confirmed by a person, never by the engine."
        actions={writable && eid && <button type="button" className="btn btn-primary" onClick={() => setEditing('new')} data-testid="asset-add">Add asset</button>}
      />
      <div className="toolbar">
        <label>
          Engagement{' '}
          <select className="select" value={eid} onChange={(e) => setEid(e.target.value)} data-testid="scope-engagement">
            {!engagements.rows?.length && <option value="">— no engagement —</option>}
            {(engagements.rows ?? []).map((e) => <option key={e.id} value={e.id}>{engLabel(e)}</option>)}
          </select>
        </label>
        <label>
          Category{' '}
          <select className="select" value={filter} onChange={(e) => setFilter(e.target.value as ScopeCategory | 'all')}>
            <option value="all">All</option>
            {SCOPE_CATEGORIES.map((c) => <option key={c} value={c}>{SCOPE_CATEGORY_LABEL[c]}</option>)}
          </select>
        </label>
      </div>
      {(engagements.error || assets.error || boundaries.error || actionError) && <p className="form-error" role="alert">{engagements.error ?? assets.error ?? boundaries.error ?? actionError}</p>}
      <div className="stats">
        <Stat icon="situation" value={assets.rows ? byCat('cui') : '—'} label="CUI assets" tone="bad" />
        <Stat icon="integrity" value={assets.rows ? byCat('security_protection') : '—'} label="Security protection" tone="warn" />
        <Stat icon="registry" value={assets.rows ? byCat('contractor_risk_managed') + byCat('specialized') : '—'} label="CRMA + specialized" />
        <Stat icon="golden" value={confirmed ? `v${confirmed.version}` : 'none'} label="Confirmed boundary" tone={confirmed ? 'good' : undefined} sub={confirmed ? `${confirmed.asset_count} assets · ${fmt(confirmed.confirmed_at)}` : 'Draft and confirm below'} />
      </div>

      {!eid && engagements.rows && <Empty>Create an engagement first (Onboard › Engagement Management).</Empty>}
      {eid && assets.rows && shown.length === 0 && <Empty>{rows.length === 0 ? 'No asset recorded for this engagement yet.' : 'No asset in this category.'}</Empty>}
      {shown.length > 0 && (
        <div className="table-wrap">
          <table className="tbl" data-testid="asset-table">
            <thead><tr><th scope="col">Asset</th><th scope="col">Type</th><th scope="col">Category</th><th scope="col">Location</th><th scope="col">Owner</th><th scope="col">ESP</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.name}</strong></td>
                  <td>{a.asset_type}</td>
                  <td><span className="pill" data-tone={CATEGORY_TONE[a.category]}>{SCOPE_CATEGORY_LABEL[a.category]}</span></td>
                  <td>{a.location ?? '—'}</td>
                  <td>{a.owner ?? '—'}</td>
                  <td>{a.external_provider ? 'Yes' : '—'}</td>
                  <td>{writable && <RowActions label={`Actions for ${a.name}`} actions={[{ label: 'Edit', onSelect: () => setEditing(a) }, { label: 'Remove', tone: 'danger', onSelect: () => { setActionError(null); setDeleting(a); } }]} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {eid && (
        <section className="card card-pad" data-testid="boundary-card">
          <h2 className="card-title">CUI boundary</h2>
          <p className="hint">Each confirmation creates a new version; the previous one is kept as history (assessor evidence for CA.L2-3.12.4 / SSP scope).</p>
          {writable && !draft && (
            <div className="form-grid-2" style={{ alignItems: 'end' }}>
              <Field label="Boundary narrative (optional)"><textarea className="input" rows={2} value={narrative} onChange={(e) => setNarrative(e.target.value)} placeholder="Where CUI enters, lives and leaves; what sits outside." /></Field>
              <div><button type="button" className="btn btn-secondary" onClick={createDraft} disabled={rows.length === 0} data-testid="boundary-draft">Draft v{((boundaries.rows ?? [])[0]?.version ?? 0) + 1} from {rows.length} assets</button></div>
            </div>
          )}
          {boundaries.rows && boundaries.rows.length === 0 && <Empty>No boundary version yet.</Empty>}
          {boundaries.rows && boundaries.rows.length > 0 && (
            <div className="table-wrap">
              <table className="tbl" data-testid="boundary-table">
                <thead><tr><th scope="col">Version</th><th scope="col">Status</th><th scope="col">Assets</th><th scope="col">Narrative</th><th scope="col">Confirmed</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {boundaries.rows.map((b) => (
                    <tr key={b.id}>
                      <td><strong>v{b.version}</strong></td>
                      <td><span className="pill" data-tone={b.status === 'confirmed' ? 'good' : b.status === 'draft' ? 'info' : undefined}>{b.status}</span></td>
                      <td className="num">{b.asset_count}</td>
                      <td>{b.narrative ?? '—'}</td>
                      <td>{b.confirmed_by ? <>{b.confirmed_by}<div className="hint">{fmt(b.confirmed_at)}</div></> : '—'}</td>
                      <td>{b.status === 'draft' && approver && <button type="button" className="btn btn-primary" onClick={() => { setActionError(null); setConfirming(b); }} data-testid={`boundary-confirm-${b.version}`}>Confirm</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {editing && eid && <AssetForm eid={eid} initial={editing === 'new' ? null : editing} onSaved={(m) => { setEditing(null); setToast(m); assets.reload(); }} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog title="Remove asset" confirmLabel="Remove" error={actionError} onConfirm={doDelete} onCancel={() => setDeleting(null)}>
          <p><strong>{deleting.name}</strong> leaves the scope inventory. Confirmed boundary versions keep their recorded asset count.</p>
        </ConfirmDialog>
      )}
      {confirming && (
        <ConfirmDialog title={`Confirm boundary v${confirming.version}`} confirmLabel="Confirm boundary" error={actionError} onConfirm={doConfirm} onCancel={() => setConfirming(null)}>
          <p>You are recording, as <strong>{viewer.kind === 'signed-in' ? viewer.role : 'you'}</strong>, that the {rows.length} categorised assets and this narrative are the CUI boundary for this engagement. {confirmed ? `v${confirmed.version} becomes superseded.` : ''} This is logged in the audit trail.</p>
        </ConfirmDialog>
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
