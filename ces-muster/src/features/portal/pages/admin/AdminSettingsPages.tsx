// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// AdminSettingsPages.tsx — Administration (workbook groups Access Management,
// System Health, Settings) and Onboard leftovers (System & Environment
// Registry, Onboarding Checklist, Engagement edit / status). Real data from
// muster-api /api/admin, /systems, /onboard/checklist and /api/engagements.
// Aavya portal theme.

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { PERSON_NAME_HELP, PERSON_NAME_PATTERN } from '../../validators';
import type { RouteId, Viewer } from '../../nav';
import { actionsFor } from '../../lifecycle/rbac';
import { ConfirmDialog, Drawer, RowActions, Toast } from '../../governed';
import { Empty, PageHeader, Stat } from '../../ui';
import { TableSearch } from '../../tableSearch';
import { api, issuesByField } from '@/shared/api/musterApi';
import { engagementLabel, useEngagement } from '../useEngagement';
import { failureText } from '../onboard/onboardApi';
import LifecycleAccessMatrix from '../LifecycleAccessMatrix';

const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—');
const isSignedIn = (v: Viewer): v is { kind: 'signed-in'; role: string } => v.kind === 'signed-in';
const role = (v: Viewer) => (isSignedIn(v) ? v.role : '');
const isOrgAdmin = (v: Viewer) => ['org_admin', 'compliance_manager', 'bhd_operator'].includes(role(v));
const canEditOnboard = (v: Viewer, group: string) => isSignedIn(v) && actionsFor(v.role, 'onboard', group).includes('edit');

export interface Settings { organization: { display_name: string; timezone: string; locale: string; support_contact: string }; system: { monitoring_cadence_hours: number; evidence_currency_days: number; session_idle_minutes: number }; notifications: { alert_min_severity: string; digest: string; recipients: string[] }; security: { password_min_length: number; session_ttl_hours: number; require_mfa_note: string; ip_allowlist: string[] }; retention: { evidence_days: number; audit_days: number; package_days: number }; modules: Record<'onboard' | 'assess' | 'plan' | 'remediate' | 'evidence' | 'monitor' | 'prepare', boolean>; version: number; updated_by: string | null; updated_at: string | null; editable: boolean }
export interface TenantUser { id: string; email: string; display_name: string | null; role: string; last_login_at: string | null; disabled: boolean; created_at: string }
export interface AccessRequest { id: string; requested_by: string; subject_email: string; requested_role: string; engagement_id: string | null; justification: string; status: 'open' | 'approved' | 'rejected' | 'fulfilled'; decided_by: string | null; decided_at: string | null; decision_notes: string | null; created_at: string }
export interface AccessReview { id: string; title: string; snapshot: TenantUser[]; decisions: { user_id: string; decision: 'keep' | 'remove' | 'change_role'; note?: string | null; by: string; at: string }[]; status: 'open' | 'completed'; started_by: string; started_at: string; completed_by: string | null; completed_at: string | null }
export interface SchedulerStatus { enabled: boolean; interval_ms: number; last_tick_at: string | null; ticks: number; note?: string; last_report?: { tenants: number; considered: number; evaluated: number; skipped_fresh: number; failed: { engagement_id: string; error: string }[]; at: string } | null }
export interface Health { service: { status: string; version: string; node: string; uptime_seconds: number; started_at: string }; database: { status: string; latency_ms: number; rls: string }; records: Record<string, number | null>; background_jobs: { scheduler: string | SchedulerStatus; last_monitor_evaluation: { engagement_id: string; name: string | null; at: string | null }[] }; integrations: { id: string; label: string; status: string; note: string }[] }
export interface SystemRecord { id: string; name: string; kind: 'system' | 'environment' | 'infrastructure' | 'cloud_resource'; environment: string | null; hosting: string | null; description: string | null; owner: string | null; handles_cui: boolean; scope_asset_id: string | null; attributes: Record<string, string> | null; updated_at: string }
export interface Checklist { sections: { id: string; label: string; items: { id: string; label: string; ok: boolean; route: RouteId }[] }[]; done: number; total: number; ready: boolean }
export interface EngagementDetail { id: string; name: string | null; reference_id: string | null; engagement_kind: string; cmmc_level: number | null; status: 'planned' | 'in_progress' | 'on_hold' | 'closed'; start_date: string | null; target_date: string | null; live_access_enabled?: boolean; created_at: string }

export const adminApi = {
  settings: () => api.get<Settings>('/admin/settings'),
  saveSettings: (body: Partial<Settings>) => api.put<Settings>('/admin/settings', body),
  users: () => api.get<TenantUser[]>('/admin/access/users'),
  createUser: (body: { email: string; display_name?: string; role: string; access_request_id?: string }) => api.post<{ user: TenantUser; temporary_password: string }>('/admin/access/users', body),
  updateUser: (id: string, body: { role?: string; display_name?: string | null; disabled?: boolean }) => api.patch<TenantUser>(`/admin/access/users/${id}`, body),
  resetPassword: (id: string) => api.post<{ temporary_password: string }>(`/admin/access/users/${id}/reset-password`),
  requests: () => api.get<AccessRequest[]>('/admin/access/requests'),
  request: (body: { subject_email: string; requested_role: string; justification: string }) => api.post<AccessRequest>('/admin/access/requests', body),
  decide: (id: string, decision: string, notes: string) => api.post<AccessRequest & { note?: string }>(`/admin/access/requests/${id}/decide`, { decision, notes }),
  reviews: () => api.get<AccessReview[]>('/admin/access/reviews'),
  startReview: (title: string) => api.post<AccessReview>('/admin/access/reviews', { title }),
  attest: (id: string, user_id: string, decision: string, note?: string) => api.post<AccessReview>(`/admin/access/reviews/${id}/decide`, { user_id, decision, note }),
  completeReview: (id: string) => api.post<AccessReview>(`/admin/access/reviews/${id}/complete`),
  health: () => api.get<Health>('/admin/health'),
  systems: (eid: string) => api.get<SystemRecord[]>(`/engagements/${eid}/systems`),
  createSystem: (eid: string, body: Partial<SystemRecord>) => api.post<SystemRecord>(`/engagements/${eid}/systems`, body),
  updateSystem: (eid: string, id: string, body: Partial<SystemRecord>) => api.patch<SystemRecord>(`/engagements/${eid}/systems/${id}`, body),
  deleteSystem: (eid: string, id: string) => api.delete<void>(`/engagements/${eid}/systems/${id}`),
  checklist: (eid: string) => api.get<Checklist>(`/engagements/${eid}/onboard/checklist`),
  engagement: (eid: string) => api.get<EngagementDetail>(`/engagements/${eid}`),
  updateEngagement: (eid: string, body: Partial<EngagementDetail>) => api.patch<EngagementDetail>(`/engagements/${eid}`, body),
};

function useLoader<T>(load: (() => Promise<{ ok: true; data: T } | { ok: false; status: number; degraded: boolean; error?: string }>) | null, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!load) { setData(null); return; }
    let live = true;
    load().then((r) => { if (!live) return; if (r.ok) { setData(r.data); setError(null); } else setError(failureText(r)); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);
  return { data, error, reload: () => setTick((t) => t + 1) };
}
function EngagementSelect({ eng }: { eng: ReturnType<typeof useEngagement> }) {
  return (
    <label>Engagement{' '}
      <select className="select" value={eng.id} onChange={(e) => eng.setId(e.target.value)} data-testid="admin-engagement">
        {!eng.rows?.length && <option value="">— no engagement —</option>}
        {(eng.rows ?? []).map((e) => <option key={e.id} value={e.id}>{engagementLabel(e)}</option>)}
      </select>
    </label>
  );
}

// ====================================================================== settings
type SettingsTab = 'organization' | 'system' | 'notifications' | 'security' | 'retention' | 'modules';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CIDR_RE = /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/;
const MODULE_LABEL: Record<keyof Settings['modules'], string> = { onboard: 'Onboard', assess: 'Assess', plan: 'Plan', remediate: 'Remediate', evidence: 'Collect Evidence', monitor: 'Monitor', prepare: 'Prepare for Assessment' };
const inRange = (n: number, lo: number, hi: number, what: string) => (!Number.isInteger(n) || n < lo || n > hi ? `${what} must be a whole number from ${lo} to ${hi}.` : '');
/** QA 2026-11-13: the same limits muster-api enforces (settingsSchema), checked before Save so the
 * problem is shown under its field instead of a bare "Validation failed". */
function checkSettings(tab: SettingsTab, d: Settings): Record<string, string> {
  const e: Record<string, string> = {};
  const put = (k: string, msg: string) => { if (msg) e[k] = msg; };
  if (tab === 'organization') {
    if (d.organization.display_name.length > 200) put('display_name', 'At most 200 characters.');
    if (d.organization.support_contact && !EMAIL_RE.test(d.organization.support_contact)) put('support_contact', 'Enter an e-mail address, e.g. support@company.com');
    if (d.organization.timezone && !/^[A-Za-z_]+\/[A-Za-z_+\-0-9]+$|^UTC$/.test(d.organization.timezone)) put('timezone', 'Use an IANA name such as America/New_York or UTC.');
    if (d.organization.locale && !/^[a-z]{2}(-[A-Z]{2})?$/.test(d.organization.locale)) put('locale', 'Use a language tag such as en-US.');
  }
  if (tab === 'system') {
    put('monitoring_cadence_hours', inRange(d.system.monitoring_cadence_hours, 1, 168, 'Monitoring cadence'));
    put('evidence_currency_days', inRange(d.system.evidence_currency_days, 30, 1095, 'Evidence currency'));
    put('session_idle_minutes', inRange(d.system.session_idle_minutes, 5, 480, 'Session idle timeout'));
  }
  if (tab === 'notifications') {
    const bad = d.notifications.recipients.filter((r) => !EMAIL_RE.test(r));
    if (bad.length) put('recipients', `Not an e-mail address: ${bad.slice(0, 3).join(', ')}${bad.length > 3 ? '…' : ''}`);
    else if (d.notifications.recipients.length > 20) put('recipients', 'At most 20 recipients.');
    else if (d.notifications.recipients.length === 0 && d.notifications.digest !== 'off') put('recipients', 'Add at least one recipient, or set the digest to Off.');
  }
  if (tab === 'security') {
    put('password_min_length', inRange(d.security.password_min_length, 8, 64, 'Minimum password length'));
    put('session_ttl_hours', inRange(d.security.session_ttl_hours, 1, 72, 'Session lifetime'));
    if (d.security.require_mfa_note.length > 500) put('require_mfa_note', 'At most 500 characters.');
    const badIp = d.security.ip_allowlist.filter((x) => !CIDR_RE.test(x) || x.split('/')[0].split('.').some((o) => Number(o) > 255));
    if (badIp.length) put('ip_allowlist', `Not an IPv4 address or CIDR: ${badIp.slice(0, 3).join(', ')}`);
    else if (d.security.ip_allowlist.length > 50) put('ip_allowlist', 'At most 50 entries.');
  }
  if (tab === 'retention') {
    put('evidence_days', inRange(d.retention.evidence_days, 365, 3650, 'Evidence retention'));
    put('audit_days', inRange(d.retention.audit_days, 365, 3650, 'Audit retention'));
    put('package_days', inRange(d.retention.package_days, 365, 3650, 'Package retention'));
    if (!e.audit_days && !e.evidence_days && d.retention.audit_days < d.retention.evidence_days) put('audit_days', 'Audit records should be kept at least as long as the evidence they describe.');
  }
  return e;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function SettingsPage({ viewer, section }: { viewer: Viewer; section?: SettingsTab }) {
  const s = useLoader<Settings>(() => adminApi.settings(), []);
  const users = useLoader<TenantUser[]>(() => adminApi.users(), []);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [tab, setTab] = useState<SettingsTab>(section ?? 'organization');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [confirmHide, setConfirmHide] = useState<string[] | null>(null);
  useEffect(() => { if (s.data) setDraft(s.data); }, [s.data]);
  // QA 2026-11-13: the sidebar's Settings sub-items and the page tabs are the same six sections — keep them in step.
  useEffect(() => { if (section) setTab(section); }, [section]);
  useEffect(() => { setFe({}); setErr(null); }, [tab]);
  const editable = !!s.data?.editable && isOrgAdmin(viewer);
  const set = <K extends keyof Settings>(k: K, patch: Partial<Settings[K]>) => {
    setDraft((d) => (d ? { ...d, [k]: { ...(d[k] as object), ...patch } } : d));
    const changed = Object.keys(patch);
    if (changed.some((c) => fe[c])) setFe((p) => { const n = { ...p }; for (const c of changed) delete n[c]; return n; });
  };
  const d = draft;
  const dirty = !!d && !!s.data && !same(d[tab], s.data[tab]);
  const changedBy = (id: string | null) => { if (!id) return ''; const u = users.data?.find((x) => x.id === id); return u ? u.display_name ?? u.email : `user ${id.slice(0, 8)}…`; };
  const doSave = async () => {
    if (!draft) return;
    setBusy(true); setErr(null);
    const r = await adminApi.saveSettings({ [tab]: draft[tab] } as Partial<Settings>);
    setBusy(false);
    if (r.ok) {
      const label = TABS.find(([k]) => k === tab)?.[1] ?? tab;
      setToast(`${label} settings saved — now version ${r.data.version}. Applies to everyone in the organisation${tab === 'modules' ? ' at their next sign-in or page reload' : ''}.`);
      s.reload();
    } else { setFe(issuesByField(r)); setErr(failureText(r)); }
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft || !s.data) return;
    if (!dirty) { setErr('Nothing has changed on this tab.'); return; }
    const problems = checkSettings(tab, draft);
    setFe(problems);
    if (Object.keys(problems).length) { setErr('Fix the highlighted fields.'); return; }
    if (tab === 'modules') {
      // Hiding a section affects every user — ask first.
      const hiding = (Object.keys(MODULE_LABEL) as (keyof Settings['modules'])[]).filter((k) => s.data!.modules?.[k] !== false && draft.modules?.[k] === false).map((k) => MODULE_LABEL[k]);
      if (hiding.length) { setConfirmHide(hiding); return; }
    }
    await doSave();
  };
  const TABS: [SettingsTab, string][] = [['organization', 'Organisation'], ['system', 'System'], ['notifications', 'Notifications'], ['security', 'Security'], ['retention', 'Retention'], ['modules', 'Modules']];
  const Err = ({ k }: { k: string }) => (fe[k] ? <span className="field-error" role="alert" data-testid={`settings-error-${k}`}>{fe[k]}</span> : null);
  const inv = (k: string) => (fe[k] ? { 'aria-invalid': true as const } : {});
  const tabLabel = TABS.find(([k]) => k === tab)?.[1] ?? tab;
  return (
    <div className="pg" data-testid="page-admin-settings">
      <PageHeader icon="platform" title="Settings" lede="The organisation's own configuration of CES: identity, monitoring cadence, who gets alerted, session and password policy, how long evidence, audit records and packages are kept, and which lifecycle sections are shown. Every change is versioned and audited." />
      {/* QA 2026-11-13: say who may change these and that a change reaches every user. */}
      <p className="note" data-tone={editable ? 'warn' : 'info'} data-testid="settings-scope-note">
        {editable
          ? 'These settings apply to every user of this organisation as soon as they are saved. You can change them because your role is organisation administrator, compliance manager or BHD; every save is recorded in the audit log with your name.'
          : 'Read-only for your role. The organisation administrator, the compliance manager or BHD change these settings; every change applies to every user and is recorded in the audit log.'}
      </p>
      {(s.error || err) && <p className="note" data-tone="bad" role="alert">{s.error ?? err}</p>}
      {d && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div role="tablist" aria-label="Settings sections" className="tabs">
              {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} aria-controls={`settings-panel-${k}`} onClick={() => setTab(k)} data-testid={`settings-tab-${k}`}>{l}{dirty && tab === k ? ' •' : ''}</button>)}
            </div>
          </div>
          <form className="card card-pad" onSubmit={save} noValidate id={`settings-panel-${tab}`} role="tabpanel" aria-labelledby={`settings-tab-${tab}`} data-testid={`settings-${tab}`}>
            <fieldset disabled={!editable} style={{ border: 0, padding: 0, minWidth: 0 }}>
              {tab === 'organization' && <div className="form-grid-2">
                <label className="form-row">Display name<input className="input" value={d.organization.display_name} onChange={(e) => set('organization', { display_name: e.target.value })} maxLength={200} {...inv('display_name')} /><Err k="display_name" /><span className="hint">Shown in the header and on exported packages.</span></label>
                <label className="form-row">Support contact<input className="input" type="email" value={d.organization.support_contact} onChange={(e) => set('organization', { support_contact: e.target.value })} placeholder="support@company.com" {...inv('support_contact')} /><Err k="support_contact" /></label>
                <label className="form-row">Timezone<input className="input" value={d.organization.timezone} onChange={(e) => set('organization', { timezone: e.target.value })} placeholder="America/New_York" {...inv('timezone')} /><Err k="timezone" /><span className="hint">IANA name; used for dates in reports and notifications.</span></label>
                <label className="form-row">Locale<input className="input" value={d.organization.locale} onChange={(e) => set('organization', { locale: e.target.value })} placeholder="en-US" {...inv('locale')} /><Err k="locale" /></label>
              </div>}
              {tab === 'system' && <div className="form-grid-2">
                <label className="form-row">Monitoring cadence (hours, 1–168)<input className="input" type="number" min={1} max={168} value={d.system.monitoring_cadence_hours} onChange={(e) => set('system', { monitoring_cadence_hours: Number(e.target.value) })} {...inv('monitoring_cadence_hours')} /><Err k="monitoring_cadence_hours" /><span className="hint">The built-in scheduler (when enabled on the server) evaluates each active engagement at this cadence; otherwise an external cron calls POST /monitor/evaluate. See System health › Background jobs.</span></label>
                <label className="form-row">Evidence currency (days, 30–1095)<input className="input" type="number" min={30} max={1095} value={d.system.evidence_currency_days} onChange={(e) => set('system', { evidence_currency_days: Number(e.target.value) })} {...inv('evidence_currency_days')} /><Err k="evidence_currency_days" /><span className="hint">Evidence older than this is flagged as stale in Monitor.</span></label>
                <label className="form-row">Session idle timeout (minutes, 5–480)<input className="input" type="number" min={5} max={480} value={d.system.session_idle_minutes} onChange={(e) => set('system', { session_idle_minutes: Number(e.target.value) })} {...inv('session_idle_minutes')} /><Err k="session_idle_minutes" /><span className="hint">Users are signed out after this much inactivity.</span></label>
              </div>}
              {tab === 'notifications' && <div className="form-grid-2">
                <label className="form-row">Alert from severity<select className="select" value={d.notifications.alert_min_severity} onChange={(e) => set('notifications', { alert_min_severity: e.target.value })}>{['critical', 'high', 'medium', 'low', 'info'].map((x) => <option key={x} value={x}>{x}</option>)}</select><span className="hint">Findings at this severity and above are sent to the recipients.</span></label>
                <label className="form-row">Digest<select className="select" value={d.notifications.digest} onChange={(e) => set('notifications', { digest: e.target.value })}><option value="off">Off</option><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
                <label className="form-row">Recipients (e-mail addresses, comma-separated, up to 20)<input className="input" value={d.notifications.recipients.join(', ')} onChange={(e) => set('notifications', { recipients: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} placeholder="ciso@company.com, it@company.com" {...inv('recipients')} /><Err k="recipients" /><span className="hint">{d.notifications.recipients.length} recipient{d.notifications.recipients.length === 1 ? '' : 's'}. Required unless the digest is Off.</span></label>
              </div>}
              {tab === 'security' && <div className="form-grid-2">
                <label className="form-row">Minimum password length (8–64)<input className="input" type="number" min={8} max={64} value={d.security.password_min_length} onChange={(e) => set('security', { password_min_length: Number(e.target.value) })} {...inv('password_min_length')} /><Err k="password_min_length" /><span className="hint">Applies to new and changed passwords; NIST 800-171 IA.L2-3.5.7 asks for complexity when new passwords are created.</span></label>
                <label className="form-row">Session lifetime (hours, 1–72)<input className="input" type="number" min={1} max={72} value={d.security.session_ttl_hours} onChange={(e) => set('security', { session_ttl_hours: Number(e.target.value) })} {...inv('session_ttl_hours')} /><Err k="session_ttl_hours" /><span className="hint">A sign-in token expires after this long regardless of activity.</span></label>
                <label className="form-row">IP allow-list (IPv4 or CIDR, comma-separated, up to 50)<input className="input" value={d.security.ip_allowlist.join(', ')} onChange={(e) => set('security', { ip_allowlist: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} placeholder="203.0.113.0/24" {...inv('ip_allowlist')} /><Err k="ip_allowlist" /><span className="hint">Empty means sign-in from anywhere. Make sure your own address is included before saving a list.</span></label>
                <label className="form-row">MFA statement (up to 500 characters)<textarea className="input" rows={3} maxLength={500} value={d.security.require_mfa_note} onChange={(e) => set('security', { require_mfa_note: e.target.value })} {...inv('require_mfa_note')} /><Err k="require_mfa_note" /><span className="hint">{d.security.require_mfa_note.length}/500 — how MFA is enforced for this organisation; quoted in the SSP.</span></label>
              </div>}
              {tab === 'modules' && <div data-testid="settings-modules">
                <p className="note" data-tone="warn" style={{ marginTop: 0 }}>Unticking a section hides it from <strong>every user of this organisation</strong> (all roles) at their next sign-in or page reload — for a phased roll-out or a demo. Hidden is not disallowed: the API keeps enforcing the role matrix, and Administration cannot be hidden. You will be asked to confirm before anything is hidden.</p>
                <div className="form-grid-2" data-testid="settings-modules-grid">
                  {(Object.keys(MODULE_LABEL) as (keyof Settings['modules'])[]).map((k) => (
                    <label key={k} className="check"><input type="checkbox" checked={d.modules?.[k] !== false} disabled={!editable} onChange={(e) => set('modules', { [k]: e.target.checked } as Partial<Settings['modules']>)} data-testid={`module-${k}`} /> {MODULE_LABEL[k]}{s.data?.modules?.[k] === false && <span className="hint" style={{ marginLeft: 6 }}>(currently hidden)</span>}</label>
                  ))}
                </div>
              </div>}
              {tab === 'retention' && <div className="form-grid-2">
                <label className="form-row">Evidence (days, 365–3650)<input className="input" type="number" min={365} max={3650} value={d.retention.evidence_days} onChange={(e) => set('retention', { evidence_days: Number(e.target.value) })} {...inv('evidence_days')} /><Err k="evidence_days" /></label>
                <label className="form-row">Audit records (days, 365–3650)<input className="input" type="number" min={365} max={3650} value={d.retention.audit_days} onChange={(e) => set('retention', { audit_days: Number(e.target.value) })} {...inv('audit_days')} /><Err k="audit_days" /></label>
                <label className="form-row">Evidence packages (days, 365–3650)<input className="input" type="number" min={365} max={3650} value={d.retention.package_days} onChange={(e) => set('retention', { package_days: Number(e.target.value) })} {...inv('package_days')} /><Err k="package_days" /><span className="hint">DFARS 252.204-7012 expects assessment records to be kept for the contract period plus the retention your contracts specify; the default is 7 years (2555 days).</span></label>
              </div>}
            </fieldset>
            {editable && (
              <div className="toolbar" style={{ marginTop: 12, alignItems: 'center' }}>
                <button type="submit" className="btn btn-primary" disabled={busy || !dirty} title={dirty ? `Save the ${tabLabel} tab for the whole organisation` : 'Nothing has changed on this tab'} data-testid="settings-save">{busy ? 'Saving…' : `Save ${tabLabel}`}</button>
                {dirty && <button type="button" className="btn btn-secondary" onClick={() => { setDraft((x) => (x && s.data ? { ...x, [tab]: s.data[tab] } : x)); setFe({}); setErr(null); }} data-testid="settings-discard">Discard changes</button>}
                <span className="hint">{dirty ? 'Unsaved changes on this tab.' : 'No unsaved changes.'}</span>
              </div>
            )}
            {/* QA 2026-11-13: a labelled footer instead of "v45 · <uuid> · date". One version covers all six tabs. */}
            <p className="hint" style={{ marginTop: 14, marginBottom: 0 }} data-testid="settings-version">
              Settings version {d.version} (one version number for all tabs; each save adds one).
              {d.updated_at ? ` Last changed ${fmt(d.updated_at)}${d.updated_by ? ` by ${changedBy(d.updated_by)}` : ''}.` : ' Not changed yet — these are the defaults.'}
            </p>
          </form>
        </>
      )}
      {confirmHide && (
        <ConfirmDialog title="Hide sections for everyone?" confirmLabel={`Hide ${confirmHide.length === 1 ? confirmHide[0] : `${confirmHide.length} sections`}`} busy={busy} onConfirm={async () => { setConfirmHide(null); await doSave(); }} onCancel={() => setConfirmHide(null)}>
          <p><strong>{confirmHide.join(', ')}</strong> will disappear from the sidebar for every user of this organisation at their next sign-in or page reload. Work already done there is kept, and the API still enforces the role matrix. You can show the section again here at any time.</p>
        </ConfirmDialog>
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

// ====================================================================== access management
export function AccessManagementPage({ viewer }: { viewer: Viewer }) {
  const users = useLoader<TenantUser[]>(() => adminApi.users(), []);
  const requests = useLoader<AccessRequest[]>(() => adminApi.requests(), []);
  const reviews = useLoader<AccessReview[]>(() => adminApi.reviews(), []);
  const [tab, setTab] = useState<'policies' | 'requests' | 'reviews' | 'users'>('requests');
  const [newUser, setNewUser] = useState<{ email: string; display_name: string; role: string; access_request_id?: string } | null>(null);
  const [tempPw, setTempPw] = useState<{ email: string; password: string } | null>(null);
  const [confirmUser, setConfirmUser] = useState<{ u: TenantUser; action: 'disable' | 'enable' | 'reset' } | null>(null);
  const [roleEdit, setRoleEdit] = useState<{ u: TenantUser; role: string } | null>(null);
  const manager = ['org_admin', 'bhd_operator'].includes(role(viewer));
  const GRANTABLE = ['org_admin', 'compliance_manager', 'it_security_admin', 'evidence_reviewer', 'senior_approver', 'assessor_read_only'];
  const createUser = async (e: FormEvent) => { e.preventDefault(); if (!newUser) return; const r = await adminApi.createUser({ email: newUser.email, display_name: newUser.display_name || undefined, role: newUser.role, access_request_id: newUser.access_request_id }); if (r.ok) { setTempPw({ email: r.data.user.email, password: r.data.temporary_password }); setNewUser(null); users.reload(); requests.reload(); } else setErr(failureText(r)); };
  const saveRole = async () => { if (!roleEdit) return; const r = await adminApi.updateUser(roleEdit.u.id, { role: roleEdit.role }); if (r.ok) { setToast(`${roleEdit.u.email} is now ${roleEdit.role}.`); setRoleEdit(null); users.reload(); } else setErr(failureText(r)); };
  const runUserAction = async () => { if (!confirmUser) return; const { u, action } = confirmUser; const r = action === 'reset' ? await adminApi.resetPassword(u.id) : await adminApi.updateUser(u.id, { disabled: action === 'disable' }); if (r.ok) { if (action === 'reset') setTempPw({ email: u.email, password: (r.data as { temporary_password: string }).temporary_password }); else setToast(`${u.email} ${action}d.`); setConfirmUser(null); users.reload(); } else setErr(failureText(r)); };
  const [subject, setSubject] = useState('');
  const [reqRole, setReqRole] = useState('evidence_reviewer');
  const [just, setJust] = useState('');
  const [deciding, setDeciding] = useState<AccessRequest | null>(null);
  const [decision, setDecision] = useState('approved');
  const [notes, setNotes] = useState('');
  const [reviewTitle, setReviewTitle] = useState('');
  const [openReview, setOpenReview] = useState<AccessReview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const admin = isOrgAdmin(viewer);
  // Raising a request needs "edit" on Administration › Access Management (matrix: org_admin, platform_admin); BHD operator views only.
  const canRequest = isSignedIn(viewer) && actionsFor(viewer.role, 'admin').includes('edit');
  const mySub = viewer.kind === 'signed-in' ? viewer.sub ?? '' : '';
  // QA sweep 2026-11-13: show people, not user ids, in the requests table.
  const who = (id: string | null) => { if (!id) return '—'; const u = users.data?.find((x) => x.id === id); return u ? u.display_name ?? u.email : `user ${id.slice(0, 8)}…`; };
  const ask = async (e: FormEvent) => { e.preventDefault(); const r = await adminApi.request({ subject_email: subject, requested_role: reqRole, justification: just }); if (r.ok) { setToast('Access request logged.'); setSubject(''); setJust(''); requests.reload(); } else setErr(failureText(r)); };
  const decide = async () => { if (!deciding) return; const r = await adminApi.decide(deciding.id, decision, notes); if (r.ok) { setToast(r.data.note ?? `Request ${decision}.`); setDeciding(null); setNotes(''); requests.reload(); } else setErr(failureText(r)); };
  const start = async (e: FormEvent) => { e.preventDefault(); const r = await adminApi.startReview(reviewTitle); if (r.ok) { setToast('Access review started.'); setReviewTitle(''); setOpenReview(r.data); reviews.reload(); } else setErr(failureText(r)); };
  const attest = async (u: TenantUser, d: string) => { if (!openReview) return; const r = await adminApi.attest(openReview.id, u.id, d); if (r.ok) setOpenReview(r.data); else setErr(failureText(r)); };
  const complete = async () => { if (!openReview) return; const r = await adminApi.completeReview(openReview.id); if (r.ok) { setToast('Access review completed — keep it as evidence for the periodic access review.'); setOpenReview(null); reviews.reload(); } else setErr(failureText(r)); };
  const ROLE_OPTIONS = ['org_admin', 'compliance_manager', 'it_security_admin', 'evidence_reviewer', 'senior_approver', 'assessor_read_only', 'bhd_operator'];
  return (
    <div className="pg" data-testid="page-admin-access">
      <PageHeader icon="roles" title="Access management" lede="Who may do what: the role matrix the platform enforces, requests for new or changed access decided by a second person, and periodic access reviews where every account is attested by someone other than its owner — the evidence assessors ask for under AC.L2-3.1.1 / 3.1.2." />
      {(users.error || requests.error || reviews.error || err) && <p className="note" data-tone="bad" role="alert">{users.error ?? requests.error ?? reviews.error ?? err}</p>}
      <div className="toolbar" role="tablist">{([['requests', 'Access requests'], ['users', 'Users'], ['reviews', 'Access reviews'], ['policies', 'RBAC policies']] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={tab === k} className={`btn ${tab === k ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(k)} data-testid={`access-tab-${k}`}>{l}</button>)}</div>
      {tab === 'policies' && <section className="card card-pad"><LifecycleAccessMatrix /></section>}
      {tab === 'requests' && (
        <>
          <form className="card card-pad" onSubmit={ask} data-testid="access-request-form">
            <h2 className="card-title">Request access</h2>
            {/* QA 2026-11-13: a role that may only view Administration cannot fill the form in at all — it is disabled with the reason, not left usable. */}
            {!canRequest && <p className="note" data-tone="info" data-testid="access-request-readonly">Your role ({role(viewer)}) can view access requests but not raise them. Ask an organisation administrator to request access on your behalf.</p>}
            <fieldset disabled={!canRequest} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
              <div className="form-grid-2">
                <label className="form-row">For (e-mail) <span className="req-mark">*</span><input className="input" type="email" value={subject} onChange={(e) => setSubject(e.target.value)} required /></label>
                <label className="form-row">Role <span className="req-mark">*</span><select className="select" value={reqRole} onChange={(e) => setReqRole(e.target.value)}>{ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
              </div>
              <label className="form-row">Justification <span className="req-mark">*</span><input className="input" value={just} onChange={(e) => setJust(e.target.value)} required minLength={10} /><span className="hint">{just.length < 10 ? `At least 10 characters (${10 - just.length} more)` : 'Why this person needs the role'}</span></label>
              <button type="submit" className="btn btn-primary" disabled={!canRequest || !subject || just.length < 10} title={!canRequest ? 'Your role cannot raise access requests' : undefined}>Submit request</button>
            </fieldset>
            <p className="hint" style={{ marginTop: 8 }}>A second person (organisation administrator or BHD) decides. Once approved, the organisation administrator creates the account or changes the role under the Users tab; the request is then marked fulfilled automatically.</p>
          </form>
          {requests.data && requests.data.length === 0 && <Empty>No access request.</Empty>}
          <TableSearch target='[data-testid="access-requests"]' />
          {requests.data && requests.data.length > 0 && <div className="table-wrap"><table className="tbl" data-testid="access-requests"><thead><tr><th scope="col">For</th><th scope="col">Role</th><th scope="col">Justification</th><th scope="col">Requested</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{requests.data.map((q) => <tr key={q.id}><td><strong>{q.subject_email}</strong></td><td>{q.requested_role}</td><td className="hint" style={{ maxWidth: 320 }}>{q.justification}</td><td className="hint" title={q.requested_by}>{who(q.requested_by)}<br />{fmt(q.created_at)}</td><td><span className="pill" data-tone={q.status === 'open' ? 'warn' : q.status === 'rejected' ? 'bad' : 'good'}>{q.status}</span>{q.decided_by && <div className="hint" title={q.decided_by}>{who(q.decided_by)}: {q.decision_notes}</div>}</td><td>{admin && q.status === 'open' && <button type="button" className="row-btn" onClick={() => { setDeciding(q); setDecision('approved'); }}>Decide</button>}{manager && q.status === 'approved' && GRANTABLE.includes(q.requested_role) && <button type="button" className="row-btn" onClick={() => { setTab('users'); setNewUser({ email: q.subject_email, display_name: '', role: q.requested_role, access_request_id: q.id }); }}>Create account</button>}{admin && q.status === 'approved' && !GRANTABLE.includes(q.requested_role) && <button type="button" className="row-btn" onClick={() => { setDeciding(q); setDecision('fulfilled'); }}>Mark fulfilled</button>}</td></tr>)}</tbody></table></div>}
        </>
      )}
      {tab === 'users' && (
        <>
          <div className="toolbar"><span className="hint grow">Accounts of this organisation. Platform and BHD accounts are managed by a platform administrator and are not listed as editable here.</span>{manager && <button type="button" className="btn btn-primary" onClick={() => setNewUser({ email: '', display_name: '', role: 'evidence_reviewer' })} data-testid="user-add">Add user</button>}</div>
          {users.data && users.data.length === 0 && <Empty>No account yet.</Empty>}
          {users.data && users.data.length > 0 && <div className="table-wrap"><table className="tbl" data-testid="org-users"><thead><tr><th scope="col">User</th><th scope="col">Role</th><th scope="col">Last sign-in</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{users.data.map((u) => { const editable = manager && GRANTABLE.includes(u.role); return (
            <tr key={u.id}><td><strong>{u.display_name ?? u.email}</strong>{u.display_name && <div className="hint">{u.email}</div>}</td><td><code>{u.role}</code></td><td className="hint">{u.last_login_at ? fmt(u.last_login_at) : 'never'}</td><td><span className="pill" data-tone={u.disabled ? 'bad' : 'good'}>{u.disabled ? 'disabled' : 'active'}</span></td>
            <td>{editable && <RowActions label={`Actions for ${u.email}`} actions={[
              { label: 'Change role', onSelect: () => setRoleEdit({ u, role: u.role }) },
              { label: 'Reset password', onSelect: () => setConfirmUser({ u, action: 'reset' }) },
              { label: u.disabled ? 'Enable' : 'Disable', onSelect: () => setConfirmUser({ u, action: u.disabled ? 'enable' : 'disable' }), tone: u.disabled ? undefined : 'danger' },
            ]} />}</td></tr>); })}</tbody></table></div>}
          {newUser && (
            <Drawer title={newUser.access_request_id ? 'Create the approved account' : 'Add a user'} onClose={() => setNewUser(null)} footer={<><button type="button" className="btn btn-secondary" onClick={() => setNewUser(null)}>Cancel</button><button type="submit" form="org-user-form" className="btn btn-primary" disabled={!newUser.email}>Create</button></>}>
              <form id="org-user-form" onSubmit={createUser} className="form-grid-2" data-testid="org-user-form">
                <label className="form-row">E-mail *<input className="input" type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} required readOnly={!!newUser.access_request_id} /></label>
                <label className="form-row">Role *<select className="select" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })} disabled={!!newUser.access_request_id}>{GRANTABLE.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
                <label className="form-row">Display name<input className="input" pattern={PERSON_NAME_PATTERN} title={PERSON_NAME_HELP} maxLength={200} value={newUser.display_name} onChange={(e) => setNewUser({ ...newUser, display_name: e.target.value })} /></label>
                <p className="hint">A one-time password is shown once after creation; the person must change it at first sign-in. {newUser.access_request_id ? 'E-mail and role come from the approved request and cannot be changed here.' : 'Platform administrator and BHD operator roles cannot be granted here.'}</p>
              </form>
            </Drawer>
          )}
          {roleEdit && (
            <ConfirmDialog title={`Change role — ${roleEdit.u.email}`} confirmLabel="Change role" onConfirm={() => void saveRole()} onCancel={() => setRoleEdit(null)}>
              <label className="form-row">New role<select className="select" value={roleEdit.role} onChange={(e) => setRoleEdit({ ...roleEdit, role: e.target.value })}>{GRANTABLE.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
              <p className="hint">Takes effect at the person's next sign-in. The change is audited; the last enabled organisation administrator cannot be demoted.</p>
            </ConfirmDialog>
          )}
          {confirmUser && (
            <ConfirmDialog title={confirmUser.action === 'reset' ? `Reset password — ${confirmUser.u.email}` : `${confirmUser.action === 'disable' ? 'Disable' : 'Enable'} ${confirmUser.u.email}`} confirmLabel={confirmUser.action === 'reset' ? 'Reset password' : confirmUser.action === 'disable' ? 'Disable account' : 'Enable account'} onConfirm={() => void runUserAction()} onCancel={() => setConfirmUser(null)}>
              <p>{confirmUser.action === 'reset' ? 'A new one-time password will be shown once; the person must change it at first sign-in.' : confirmUser.action === 'disable' ? 'The person can no longer sign in. Their records and audit history stay.' : 'The person can sign in again with their existing password.'}</p>
            </ConfirmDialog>
          )}
          {tempPw && (
            <ConfirmDialog title={`One-time password for ${tempPw.email}`} confirmLabel="I have passed it on" onConfirm={() => setTempPw(null)} onCancel={() => setTempPw(null)}>
              <p>Shown once — it is not stored anywhere readable. Share it over a channel you trust; the person must change it at first sign-in.</p>
              <p><code data-testid="temp-password" style={{ fontSize: 18, userSelect: 'all' }}>{tempPw.password}</code></p>
            </ConfirmDialog>
          )}
        </>
      )}
      {tab === 'reviews' && (
        <>
          {admin && <form className="card card-pad" onSubmit={start} data-testid="review-form"><h2 className="card-title">Start an access review</h2><div className="toolbar"><input className="input grow" value={reviewTitle} onChange={(e) => setReviewTitle(e.target.value)} placeholder="Q4 2026 access review" required minLength={3} /><button type="submit" className="btn btn-primary" disabled={reviewTitle.length < 3} title={reviewTitle.length < 3 ? "Give the review a title (at least 3 characters)" : undefined} data-testid="review-start">Start ({users.data?.length ?? '…'} accounts)</button></div></form>}
          {reviews.data && reviews.data.length === 0 && <Empty>No access review yet.</Empty>}
          <TableSearch target='[data-testid="access-reviews"]' />
          {reviews.data && reviews.data.length > 0 && <div className="table-wrap"><table className="tbl" data-testid="access-reviews"><thead><tr><th scope="col">Review</th><th scope="col" className="num">Accounts</th><th scope="col" className="num">Attested</th><th scope="col">Status</th><th scope="col">Started</th><th scope="col"><span className="sr-only">Open</span></th></tr></thead><tbody>{reviews.data.map((rv) => <tr key={rv.id}><td><strong>{rv.title}</strong></td><td className="num">{rv.snapshot.length}</td><td className="num">{rv.decisions.length}</td><td><span className="pill" data-tone={rv.status === 'completed' ? 'good' : 'warn'}>{rv.status}</span></td><td className="hint">{rv.started_by} · {fmt(rv.started_at)}{rv.completed_at && <><br />completed {fmt(rv.completed_at)}</>}</td><td><button type="button" className="row-btn" onClick={() => setOpenReview(rv)}>Open</button></td></tr>)}</tbody></table></div>}
        </>
      )}
      {deciding && <ConfirmDialog title={`Decide: ${deciding.subject_email} → ${deciding.requested_role}`} confirmLabel="Record decision" onConfirm={decide} onCancel={() => setDeciding(null)} error={err}><label className="form-row">Decision<select className="select" value={decision} onChange={(e) => setDecision(e.target.value)}><option value="approved">Approve</option><option value="rejected">Reject</option><option value="fulfilled">Mark fulfilled (role set by platform admin)</option></select></label><label className="form-row">Notes *<textarea maxLength={2000} className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label></ConfirmDialog>}
      {openReview && (
        <Drawer title={openReview.title} subtitle={`${openReview.status} · started by ${openReview.started_by} on ${fmt(openReview.started_at)}`} onClose={() => setOpenReview(null)} testId="review-drawer" wide footer={<>{admin && openReview.status === 'open' && <button type="button" className="btn btn-primary" onClick={complete} data-testid="review-complete">Complete review</button>} <button type="button" className="btn btn-secondary" onClick={() => setOpenReview(null)}>Close</button></>}>
          <p className="hint">Attest every account except your own: keep, remove, or change role. Removals and role changes are then carried out under Users by a platform administrator.</p>
          <div className="table-wrap"><table className="tbl" data-testid="review-table"><thead><tr><th scope="col">Account</th><th scope="col">Role</th><th scope="col">Last sign-in</th><th scope="col">Decision</th><th scope="col"><span className="sr-only">Attest</span></th></tr></thead><tbody>{openReview.snapshot.map((u) => { const d = openReview.decisions.find((x) => x.user_id === u.id); const self = u.id === mySub; return (<tr key={u.id}><td><strong>{u.email}</strong>{u.display_name && <div className="hint">{u.display_name}</div>}{u.disabled && <span className="pill" data-tone="bad">disabled</span>}</td><td>{u.role}</td><td className="hint">{fmt(u.last_login_at)}</td><td>{d ? <span className="pill" data-tone={d.decision === 'keep' ? 'good' : d.decision === 'remove' ? 'bad' : 'warn'}>{d.decision.replace('_', ' ')}</span> : <span className="hint">pending</span>}</td><td style={{ whiteSpace: 'nowrap' }}>{admin && openReview.status === 'open' && !self && <RowActions label={`Attest ${u.email}`} actions={[{ label: 'Keep', onSelect: () => attest(u, 'keep') }, { label: 'Change role', onSelect: () => attest(u, 'change_role') }, { label: 'Remove', tone: 'danger', onSelect: () => attest(u, 'remove') }]} />}</td></tr>); })}</tbody></table></div>
        </Drawer>
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

// ====================================================================== system health
function SchedulerCard({ s }: { s: SchedulerStatus }) {
  const r = s.last_report;
  return (
    <div data-testid="scheduler-status">
      <p className="note" data-tone={s.enabled ? 'good' : 'warn'}>{s.enabled ? `Monitoring scheduler running — ticks every ${Math.round(s.interval_ms / 60000)} min, honouring each tenant's cadence.` : 'Monitoring scheduler is built in but not enabled on this server (MONITOR_SCHEDULER=1). "Evaluate now" and an external cron still work.'}</p>
      {r && <p className="hint">Last tick {fmt(r.at)}: {r.considered} active engagement{r.considered === 1 ? '' : 's'} considered, {r.evaluated} evaluated, {r.skipped_fresh} still fresh{r.failed.length ? `, ${r.failed.length} failed` : ''}.</p>}
    </div>
  );
}

export function SystemHealthPage() {
  const h = useLoader<Health>(() => adminApi.health(), []);
  const d = h.data;
  const up = (s: number) => `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return (
    <div className="pg" data-testid="page-admin-health">
      <PageHeader icon="integrity" title="System health" lede="Service, database, record counts, background jobs and integrations — what is wired, what is not yet, and when monitoring last ran for each engagement." actions={<button type="button" className="btn btn-secondary" onClick={h.reload}>Refresh</button>} />
      {h.error && <p className="note" data-tone="bad" role="alert">{h.error}</p>}
      {d && (
        <>
          <div className="stats">
            <Stat icon="integrity" value={d.service.status} label="Service" tone={d.service.status === 'ok' ? 'good' : 'bad'} sub={`v${d.service.version} · ${d.service.node} · up ${up(d.service.uptime_seconds)}`} testId="health-service" />
            <Stat icon="registry" value={d.database.status} label="Database" tone={d.database.status === 'ok' ? 'good' : 'bad'} sub={`${d.database.latency_ms} ms · ${d.database.rls}`} />
            <Stat icon="catalog" value={d.records.evidence_items ?? '—'} label="Evidence items" sub={`${d.records.assessment_runs ?? 0} runs · ${d.records.plan_actions ?? 0} actions · ${d.records.remediation_runs ?? 0} remediation runs`} />
            <Stat icon="bell" value={d.records.monitor_findings ?? '—'} label="Findings" sub={`${d.records.evidence_packages ?? 0} packages`} />
          </div>
          <div className="form-grid-2">
            <section className="card card-pad"><h2 className="card-title">Integrations</h2><ul className="checklist" data-testid="health-integrations">{d.integrations.map((i) => <li key={i.id}><span className="pill" data-tone={i.status === 'ok' || i.status === 'configured' ? 'good' : i.status === 'console' ? 'info' : 'warn'}>{i.status.replace('_', ' ')}</span> <span>{i.label}<div className="hint">{i.note}</div></span></li>)}</ul></section>
            <section className="card card-pad"><h2 className="card-title">Background jobs</h2>{typeof d.background_jobs.scheduler === 'string' ? <p className="note" data-tone="info">{d.background_jobs.scheduler}</p> : <SchedulerCard s={d.background_jobs.scheduler} />}<table className="tbl"><thead><tr><th scope="col">Engagement</th><th scope="col">Last monitoring evaluation</th></tr></thead><tbody>{d.background_jobs.last_monitor_evaluation.map((e) => <tr key={e.engagement_id}><td>{e.name ?? e.engagement_id.slice(0, 8)}</td><td className="hint">{e.at ? fmt(e.at) : 'never'}</td></tr>)}</tbody></table></section>
          </div>
          <section className="card card-pad"><h2 className="card-title">Records (this tenant)</h2><table className="tbl"><tbody>{Object.entries(d.records).map(([k, v]) => <tr key={k}><td>{k.replace(/_/g, ' ')}</td><td className="num">{v ?? '—'}</td></tr>)}</tbody></table></section>
        </>
      )}
    </div>
  );
}

// ====================================================================== Onboard › systems registry
const KIND_LABEL: Record<SystemRecord['kind'], string> = { system: 'System', environment: 'Environment', infrastructure: 'Infrastructure', cloud_resource: 'Cloud resource' };
export function SystemsRegistryPage({ viewer }: { viewer: Viewer }) {
  const eng = useEngagement();
  const list = useLoader<SystemRecord[]>(eng.id ? () => adminApi.systems(eng.id) : null, [eng.id]);
  const [editing, setEditing] = useState<SystemRecord | null | 'new'>(null);
  const [deleting, setDeleting] = useState<SystemRecord | null>(null);
  const [kind, setKind] = useState<SystemRecord['kind'] | 'all'>('all');
  const [f, setF] = useState<Partial<SystemRecord>>({});
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const editor = canEditOnboard(viewer, 'system-environment-registry');
  const rows = useMemo(() => (list.data ?? []).filter((s) => kind === 'all' || s.kind === kind), [list.data, kind]);
  useEffect(() => { if (editing && editing !== 'new') setF(editing); else setF({ kind: 'system', environment: 'production', hosting: 'gcc_high', handles_cui: false }); }, [editing]);
  const save = async (e: FormEvent) => { e.preventDefault(); const body = { name: f.name, kind: f.kind, environment: f.environment || null, hosting: f.hosting || null, description: f.description || null, owner: f.owner || null, handles_cui: !!f.handles_cui }; const r = editing && editing !== 'new' ? await adminApi.updateSystem(eng.id, editing.id, body) : await adminApi.createSystem(eng.id, body); if (r.ok) { setToast('Saved.'); setEditing(null); list.reload(); } else setErr(failureText(r)); };
  const del = async () => { if (!deleting) return; const r = await adminApi.deleteSystem(eng.id, deleting.id); if (r.ok) { setToast('Deleted.'); setDeleting(null); list.reload(); } else setErr(failureText(r)); };
  return (
    <div className="pg" data-testid="page-onboard-systems">
      <PageHeader icon="registry" title="System & environment registry" lede="The systems, environments, infrastructure and cloud resources the SSP describes — where CUI lives and who owns each. Link records to scope assets so the boundary and the inventory stay consistent." actions={<>{editor && eng.id && <button type="button" className="btn btn-primary" onClick={() => setEditing('new')} data-testid="system-add">Register</button>} <EngagementSelect eng={eng} /></>} />
      {(eng.error || list.error || err) && <p className="note" data-tone="bad" role="alert">{eng.error ?? list.error ?? err}</p>}
      {list.data && (
        <div className="stats">
          <Stat icon="registry" value={list.data.length} label="Records" />
          <Stat icon="situation" value={list.data.filter((s) => s.handles_cui).length} label="Handle CUI" tone="bad" />
          <Stat icon="tenants" value={list.data.filter((s) => s.hosting === 'gcc_high').length} label="In GCC High" tone="good" />
          <Stat icon="interfaces" value={list.data.filter((s) => s.hosting === 'on_premises').length} label="On-premises" />
        </div>
      )}
      <div className="toolbar"><label>Kind <select className="select" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="all">All</option>{(Object.keys(KIND_LABEL) as SystemRecord['kind'][]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label></div>
      {list.data && rows.length === 0 && <Empty>No record yet.</Empty>}
      <TableSearch target='[data-testid="systems-table"]' />
      {rows.length > 0 && <div className="table-wrap"><table className="tbl" data-testid="systems-table"><thead><tr><th scope="col">Name</th><th scope="col">Kind</th><th scope="col">Environment</th><th scope="col">Hosting</th><th scope="col">Owner</th><th scope="col">CUI</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{rows.map((s) => <tr key={s.id}><td><strong>{s.name}</strong>{s.description && <div className="hint">{s.description}</div>}</td><td>{KIND_LABEL[s.kind]}</td><td className="hint">{s.environment ?? '—'}</td><td className="hint">{s.hosting?.replace('_', ' ') ?? '—'}</td><td>{s.owner ?? '—'}</td><td>{s.handles_cui ? <span className="pill" data-tone="bad">CUI</span> : '—'}</td><td>{!editor && <button type="button" className="row-btn" onClick={() => setEditing(s)}>View</button>}{editor && <RowActions label={`Actions for ${s.name}`} actions={[{ label: 'Edit', onSelect: () => setEditing(s) }, { label: 'Delete', tone: 'danger', onSelect: () => setDeleting(s) }]} />}</td></tr>)}</tbody></table></div>}
      {editing && (
        <Drawer title={editing === 'new' ? 'Register system' : editor ? `Edit ${editing.name}` : `System — ${editing.name}`} onClose={() => setEditing(null)} testId="system-drawer" footer={<><button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>{editor ? 'Cancel' : 'Close'}</button>{editor && <button type="submit" form="system-form" className="btn btn-primary" data-testid="system-submit">Save</button>}</>}>
          <form id="system-form" onSubmit={save}>
            <fieldset disabled={!editor} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            {!editor && <p className="note" data-tone="info" data-testid="form-readonly">Read-only — your role can view this but not change it.</p>}
            <label className="form-row">Name *<input className="input" maxLength={200} value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} required /></label>
            <div className="form-grid-2">
              <label className="form-row">Kind<select className="select" value={f.kind ?? 'system'} onChange={(e) => setF({ ...f, kind: e.target.value as SystemRecord['kind'] })}>{(Object.keys(KIND_LABEL) as SystemRecord['kind'][]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
              <label className="form-row">Environment<select className="select" value={f.environment ?? ''} onChange={(e) => setF({ ...f, environment: e.target.value || null })}><option value="">—</option><option value="production">Production</option><option value="test">Test</option><option value="development">Development</option></select></label>
              <label className="form-row">Hosting<select className="select" value={f.hosting ?? ''} onChange={(e) => setF({ ...f, hosting: e.target.value || null })}><option value="">—</option><option value="gcc_high">GCC High</option><option value="azure_government">Azure Government</option><option value="on_premises">On-premises</option><option value="saas">SaaS</option><option value="other">Other</option></select></label>
              <label className="form-row">Owner<input className="input" pattern={PERSON_NAME_PATTERN} title={PERSON_NAME_HELP} maxLength={200} value={f.owner ?? ''} onChange={(e) => setF({ ...f, owner: e.target.value })} /></label>
            </div>
            <label style={{ fontWeight: 400 }}><input type="checkbox" checked={!!f.handles_cui} onChange={(e) => setF({ ...f, handles_cui: e.target.checked })} /> Stores, processes or transmits CUI</label>
            <label className="form-row">Description<textarea maxLength={4000} className="input" rows={3} value={f.description ?? ''} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          </fieldset>
          </form>
        </Drawer>
      )}
      {deleting && <ConfirmDialog title="Delete record" confirmLabel="Delete" onConfirm={del} onCancel={() => setDeleting(null)} error={err}><p><strong>{deleting.name}</strong> will be removed from the registry.</p></ConfirmDialog>}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}

// ====================================================================== Onboard › checklist + engagement details
export function OnboardingChecklistPage({ viewer, go }: { viewer: Viewer; go: (r: RouteId) => void }) {
  const eng = useEngagement();
  const c = useLoader<Checklist>(eng.id ? () => adminApi.checklist(eng.id) : null, [eng.id]);
  const detail = useLoader<EngagementDetail>(eng.id ? () => adminApi.engagement(eng.id) : null, [eng.id]);
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState<Partial<EngagementDetail>>({});
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const editor = canEditOnboard(viewer, 'engagement-management');
  useEffect(() => { if (detail.data) setF({ name: detail.data.name, reference_id: detail.data.reference_id, cmmc_level: detail.data.cmmc_level, status: detail.data.status, start_date: detail.data.start_date?.slice(0, 10) ?? null, target_date: detail.data.target_date?.slice(0, 10) ?? null }); }, [detail.data]);
  const save = async (e: FormEvent) => { e.preventDefault(); const r = await adminApi.updateEngagement(eng.id, { name: f.name || null, reference_id: f.reference_id || null, cmmc_level: f.cmmc_level ?? null, status: f.status, start_date: f.start_date || null, target_date: f.target_date || null }); if (r.ok) { setToast('Engagement updated.'); setEdit(false); detail.reload(); c.reload(); } else setErr(failureText(r)); };
  const d = c.data;
  return (
    <div className="pg" data-testid="page-onboard-checklist">
      <PageHeader icon="engagements" title="Onboarding checklist" lede="Organisation, tenant and engagement readiness before the assessment work starts — each item opens the screen that completes it. Engagement details and status are edited here." actions={<>{editor && detail.data && <button type="button" className="btn btn-secondary" onClick={() => setEdit(true)} data-testid="engagement-edit">Edit engagement</button>} <EngagementSelect eng={eng} /></>} />
      {(eng.error || c.error || err) && <p className="note" data-tone="bad" role="alert">{eng.error ?? c.error ?? err}</p>}
      {detail.data && <div className="stats"><Stat icon="engagements" value={detail.data.name ?? '—'} label="Engagement" sub={`${detail.data.reference_id ?? 'no reference'} · L${detail.data.cmmc_level ?? '?'} · ${detail.data.engagement_kind.replace('_', ' ')}`} /><Stat icon="plan" value={detail.data.status.replace('_', ' ')} label="Status" tone={detail.data.status === 'in_progress' ? 'good' : detail.data.status === 'on_hold' ? 'warn' : undefined} sub={`${fmtDate(detail.data.start_date)} → ${fmtDate(detail.data.target_date)}`} />{d && <Stat icon="readiness" value={`${d.done}/${d.total}`} label="Onboarding items done" tone={d.ready ? 'good' : 'warn'} testId="onboard-done" />}</div>}
      {d && d.sections.map((s) => (
        <section key={s.id} className="card card-pad" data-testid={`checklist-${s.id}`}>
          <h2 className="card-title">{s.label} <span className="hint">{s.items.filter((i) => i.ok).length}/{s.items.length}</span></h2>
          <ul className="checklist">{s.items.map((i) => <li key={i.id}><span className="pill" data-tone={i.ok ? 'good' : 'bad'}>{i.ok ? 'OK' : 'TO DO'}</span> <span>{i.label} {!i.ok && <button type="button" className="row-btn" onClick={() => go(i.route)}>Open</button>}</span></li>)}</ul>
        </section>
      ))}
      {edit && detail.data && (
        <Drawer title="Edit engagement" subtitle={detail.data.id} onClose={() => setEdit(false)} testId="engagement-drawer" footer={<><button type="button" className="btn btn-secondary" onClick={() => setEdit(false)}>Cancel</button><button type="submit" form="eng-form" className="btn btn-primary" data-testid="engagement-save">Save</button></>}>
          <form id="eng-form" onSubmit={save}>
            <label className="form-row">Name<input className="input" maxLength={200} value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
            <div className="form-grid-2">
              <label className="form-row">Reference<input className="input" maxLength={60} value={f.reference_id ?? ''} onChange={(e) => setF({ ...f, reference_id: e.target.value })} /></label>
              <label className="form-row">CMMC level<select className="select" value={f.cmmc_level ?? ''} onChange={(e) => setF({ ...f, cmmc_level: e.target.value ? Number(e.target.value) : null })}><option value="">—</option><option value="1">Level 1</option><option value="2">Level 2</option></select></label>
              <label className="form-row">Status<select className="select" value={f.status ?? 'planned'} onChange={(e) => setF({ ...f, status: e.target.value as EngagementDetail['status'] })} data-testid="engagement-status"><option value="planned">Planned</option><option value="in_progress">In progress</option><option value="on_hold">On hold</option><option value="closed">Closed</option></select></label>
              <span />
              <label className="form-row">Start<input className="input" type="date" value={f.start_date ?? ''} onChange={(e) => setF({ ...f, start_date: e.target.value || null })} /></label>
              <label className="form-row">Target<input className="input" type="date" value={f.target_date ?? ''} onChange={(e) => setF({ ...f, target_date: e.target.value || null })} /></label>
            </div>
            <p className="hint">Engagements are closed, not deleted — their records stay for retention and the audit trail.</p>
          </form>
        </Drawer>
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
