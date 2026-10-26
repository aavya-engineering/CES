// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// AdminPages.tsx — RBAC-01 (SPA): Platform → Users, Roles & Permissions,
// Audit Log, and Account → Change password. Layout follows the mockups' list +
// side panel pattern. muster-api enforces every rule; these pages only show
// what it answers and never hold a password longer than the form needs.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  adminApi,
  adminFailure,
  authApi,
  type AdminUser,
  type AuditEvent,
  type Organization,
  type PermissionInfo,
  type RoleInfo,
} from '@/shared/api/adminApi';
import { isTokenRemembered, roleLabel, saveMusterToken } from '@/shared/api/musterToken';
import { Empty, PageHeader, Pager, Stat } from '../ui';
import { usePaged } from '../paging';

const ROLE_OPTIONS = ['platform_admin', 'bhd_operator', 'prime', 'sub', 'assessor_read_only'];

function fmt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Shown once after create / reset. The value is dropped when the dialog closes. */
function TemporaryPasswordDialog({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);
  return (
    <>
      <div className="modal-backdrop" />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="tmp-pw-title" data-testid="temp-password-dialog">
        <h2 id="tmp-pw-title" style={{ marginTop: 0 }}>
          Temporary password for {email}
        </h2>
        <p>
          Give it to the user through a separate channel. It is shown <strong>only now</strong>. They must choose a new
          password at their first sign-in.
        </p>
        <div className="secret">
          <span data-testid="temp-password-value">{password}</span>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginLeft: 'auto' }}
            onClick={() => {
              navigator.clipboard?.writeText(password).then(
                () => setCopied(true),
                () => setCopied(false)
              );
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button ref={closeRef} type="button" className="btn btn-primary" onClick={onClose} data-testid="temp-password-done">
            I have passed it on
          </button>
        </div>
      </div>
    </>
  );
}

function AddUserDrawer({
  organizations,
  onClose,
  onCreated,
}: {
  organizations: Organization[];
  onClose: () => void;
  onCreated: (u: AdminUser, temp: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('sub');
  const [orgMode, setOrgMode] = useState<'existing' | 'new'>(organizations.length ? 'existing' : 'new');
  const [orgId, setOrgId] = useState(organizations[0]?.id ?? '');
  const [orgName, setOrgName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) return setError('Enter an email address.');
    if (orgMode === 'existing' && !orgId) return setError('Choose an organisation.');
    if (orgMode === 'new' && !orgName.trim()) return setError('Enter the new organisation name.');
    setBusy(true);
    const r = await adminApi.createUser({
      email: email.trim(),
      role,
      ...(name.trim() ? { display_name: name.trim() } : {}),
      ...(orgMode === 'existing' ? { tenant_id: orgId } : { organization_name: orgName.trim() }),
    });
    setBusy(false);
    if (!r.ok) return setError(r.status === 409 ? 'A user with this email already exists.' : adminFailure(r));
    onCreated(r.data.user, r.data.temporary_password);
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <form className="drawer" role="dialog" aria-modal="true" aria-labelledby="add-user-title" onSubmit={submit} data-testid="add-user-drawer">
        <div className="drawer-head">
          <h2 id="add-user-title">Add user</h2>
          <button type="button" className="icon-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="drawer-body">
          <label className="form-row">
            Email address *
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" data-testid="add-user-email" required />
          </label>
          <label className="form-row">
            Display name
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} data-testid="add-user-name" />
          </label>
          <label className="form-row">
            Role *
            <select className="select" value={role} onChange={(e) => setRole(e.target.value)} data-testid="add-user-role">
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
            {role === 'platform_admin' && <span className="hint">Manages users only. Cannot see any customer data.</span>}
          </label>
          <fieldset className="form-row" style={{ border: 0, padding: 0 }}>
            <legend style={{ marginBottom: 6 }}>Organisation *</legend>
            <label style={{ fontWeight: 400 }}>
              <input type="radio" name="org-mode" checked={orgMode === 'existing'} onChange={() => setOrgMode('existing')} disabled={!organizations.length} /> Existing
            </label>
            {orgMode === 'existing' && (
              <select className="select" value={orgId} onChange={(e) => setOrgId(e.target.value)} data-testid="add-user-org">
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
            <label style={{ fontWeight: 400 }}>
              <input type="radio" name="org-mode" checked={orgMode === 'new'} onChange={() => setOrgMode('new')} data-testid="add-user-org-new" /> New organisation
            </label>
            {orgMode === 'new' && (
              <input className="input" placeholder="Organisation name" value={orgName} onChange={(e) => setOrgName(e.target.value)} data-testid="add-user-org-name" />
            )}
            <span className="hint">The customer organisation the user belongs to (Muster organisation), not a Microsoft tenant.</span>
          </fieldset>
          {error && (
            <p className="note" data-tone="bad" role="alert" data-testid="add-user-error">
              {error}
            </p>
          )}
        </div>
        <div className="drawer-foot">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="add-user-submit">
            {busy ? 'Creating…' : 'Create user'}
          </button>
        </div>
      </form>
    </>
  );
}

function UserPanel({
  user,
  selfId,
  onClose,
  onChanged,
  onTemp,
}: {
  user: AdminUser;
  selfId: string | undefined;
  onClose: () => void;
  onChanged: (u: AdminUser) => void;
  onTemp: (email: string, temp: string) => void;
}) {
  const [role, setRole] = useState(user.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const self = user.id === selfId;
  useEffect(() => {
    setRole(user.role);
    setError('');
  }, [user]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const update = (body: { role?: string; disabled?: boolean }) =>
    run(async () => {
      const r = await adminApi.updateUser(user.id, body);
      if (!r.ok) setError(adminFailure(r));
      else onChanged(r.data.user);
    });
  const reset = () =>
    run(async () => {
      const r = await adminApi.resetPassword(user.id);
      if (!r.ok) setError(adminFailure(r));
      else onTemp(user.email, r.data.temporary_password);
    });

  return (
    <aside className="card card-pad detail" aria-label="User details" data-testid="user-panel">
      <div className="detail-head">
        <div>
          <span className="pill" data-tone={user.disabled ? 'bad' : 'good'}>
            {user.disabled ? 'Disabled' : 'Active'}
          </span>
          <h2>{user.display_name ?? user.email}</h2>
          <div className="pg-meta">{user.email}</div>
        </div>
        <button type="button" className="icon-x" onClick={onClose} aria-label="Close details">
          ×
        </button>
      </div>
      <dl className="kv">
        <dt>Organisation</dt>
        <dd>{user.organization ?? '—'}</dd>
        <dt>Last sign-in</dt>
        <dd>{fmt(user.last_login_at)}</dd>
        <dt>Created</dt>
        <dd>{fmt(user.created_at)}</dd>
        <dt>Password</dt>
        <dd>{user.must_change_password ? 'Temporary — must change at next sign-in' : 'Set by the user'}</dd>
      </dl>
      <label className="form-row" style={{ marginTop: 16 }}>
        Role
        <select className="select" value={role} onChange={(e) => setRole(e.target.value)} disabled={self || busy} data-testid="user-role-select">
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
            </option>
          ))}
        </select>
        {self && <span className="hint">You cannot change your own role.</span>}
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="btn btn-primary" disabled={self || busy || role === user.role} onClick={() => update({ role })} data-testid="user-save-role">
          Save role
        </button>
        <button type="button" className="btn btn-secondary" disabled={self || busy} onClick={reset} data-testid="user-reset">
          Reset password
        </button>
        <button
          type="button"
          className={user.disabled ? 'btn btn-secondary' : 'btn btn-destructive'}
          disabled={self || busy}
          onClick={() => update({ disabled: !user.disabled })}
          data-testid="user-toggle-disabled"
        >
          {user.disabled ? 'Enable' : 'Disable'}
        </button>
      </div>
      {error && (
        <p className="note" data-tone="bad" role="alert" style={{ marginTop: 12 }} data-testid="user-panel-error">
          {error}
        </p>
      )}
    </aside>
  );
}

export function UsersPage({ selfId }: { selfId: string | undefined }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [adding, setAdding] = useState(false);
  const [temp, setTemp] = useState<{ email: string; password: string } | null>(null);

  const load = useCallback(async () => {
    const [u, o] = await Promise.all([adminApi.listUsers(), adminApi.listOrganizations()]);
    if (!u.ok) {
      setError(adminFailure(u));
      setUsers([]);
      return;
    }
    setError('');
    setUsers(u.data.users);
    if (o.ok) setOrgs(o.data.organizations);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (users ?? []).filter(
      (u) =>
        (!roleFilter || u.role === roleFilter) &&
        (!status || (status === 'disabled' ? u.disabled : !u.disabled)) &&
        (!n || u.email.toLowerCase().includes(n) || (u.display_name ?? '').toLowerCase().includes(n) || (u.organization ?? '').toLowerCase().includes(n))
    );
  }, [users, q, roleFilter, status]);
  const paged = usePaged(filtered, 10);
  const all = users ?? [];

  const replace = (u: AdminUser) => {
    setUsers((prev) => (prev ?? []).map((x) => (x.id === u.id ? u : x)));
    setSelected(u);
  };

  return (
    <div className="pg" data-testid="page-users">
      <PageHeader
        icon="👤"
        title="Users"
        lede="Create users, set their role, disable access and reset passwords. Every change is recorded in the audit log."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setAdding(true)} data-testid="users-add">
            + Add user
          </button>
        }
      />
      <div className="stats">
        <Stat icon="Σ" value={users ? all.length : '…'} label="Users" testId="users-total" />
        <Stat icon="✓" value={users ? all.filter((u) => !u.disabled).length : '…'} label="Active" tone="good" />
        <Stat icon="⏸" value={users ? all.filter((u) => u.disabled).length : '…'} label="Disabled" tone="bad" />
        <Stat icon="⚿" value={users ? all.filter((u) => u.must_change_password).length : '…'} label="Waiting to set a password" tone="warn" />
      </div>
      {error && (
        <p className="note" data-tone="bad" role="alert" style={{ marginBottom: 14 }} data-testid="users-error">
          {error}
        </p>
      )}
      <div className="card toolbar" role="search">
        <label className="grow">
          Search
          <input className="input" type="search" placeholder="Name, email or organisation" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label>
          Role
          <select className="select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">All roles</option>
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
      </div>
      <div className={selected ? 'split' : undefined}>
        <section className="card" aria-label="Users">
          <div className="table-wrap">
            <table className="tbl" data-testid="users-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Organisation</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last sign-in</th>
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((u) => (
                  <tr key={u.id} aria-selected={selected?.id === u.id}>
                    <td>
                      <button type="button" className="row-btn" onClick={() => setSelected(u)}>
                        {u.display_name ?? u.email}
                      </button>
                      {u.display_name && <div className="pg-meta">{u.email}</div>}
                    </td>
                    <td>{u.organization ?? '—'}</td>
                    <td>
                      <span className="pill" data-tone={u.role === 'platform_admin' ? 'info' : undefined}>
                        {roleLabel(u.role)}
                      </span>
                    </td>
                    <td>
                      <span className="pill" data-tone={u.disabled ? 'bad' : u.must_change_password ? 'warn' : 'good'}>
                        {u.disabled ? 'Disabled' : u.must_change_password ? 'Invited' : 'Active'}
                      </span>
                    </td>
                    <td>{fmt(u.last_login_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {users === null && <Empty>Loading users…</Empty>}
          {users !== null && filtered.length === 0 && <Empty>No user matches.</Empty>}
          <Pager {...paged} noun="users" />
        </section>
        {selected && (
          <UserPanel
            user={selected}
            selfId={selfId}
            onClose={() => setSelected(null)}
            onChanged={replace}
            onTemp={(email, password) => {
              setTemp({ email, password });
              void load();
            }}
          />
        )}
      </div>
      {adding && (
        <AddUserDrawer
          organizations={orgs}
          onClose={() => setAdding(false)}
          onCreated={(u, password) => {
            setAdding(false);
            setTemp({ email: u.email, password });
            void load();
          }}
        />
      )}
      {temp && <TemporaryPasswordDialog email={temp.email} password={temp.password} onClose={() => setTemp(null)} />}
    </div>
  );
}

export function RolesPage() {
  const [data, setData] = useState<{ roles: RoleInfo[]; permissions: PermissionInfo[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void authApi.roles().then((r) => (r.ok ? setData(r.data) : setError(adminFailure(r))));
  }, []);
  const groups = useMemo(() => {
    const m = new Map<string, PermissionInfo[]>();
    for (const p of data?.permissions ?? []) m.set(p.group, [...(m.get(p.group) ?? []), p]);
    return [...m.entries()];
  }, [data]);
  return (
    <div className="pg" data-testid="page-roles">
      <PageHeader
        icon="⚖"
        title="Roles & permissions"
        lede="What each role may do. This list is served by muster-api and checked by a test against the routes that enforce it."
      />
      {error && <p className="note" data-tone="bad" role="alert">{error}</p>}
      {!data && !error && <Empty>Loading…</Empty>}
      {data && (
        <>
          <div className="grid-2" style={{ marginBottom: 16 }}>
            {data.roles.map((r) => (
              <div key={r.id} className="card card-pad">
                <h2 className="card-title" style={{ marginBottom: 4 }}>
                  {r.label}
                </h2>
                <code className="pg-meta">{r.id}</code>
                <p style={{ marginBottom: 0 }}>{r.description}</p>
              </div>
            ))}
          </div>
          <section className="card">
            <div className="table-wrap">
              <table className="tbl" data-testid="roles-matrix">
                <thead>
                  <tr>
                    <th scope="col">Permission</th>
                    {data.roles.map((r) => (
                      <th key={r.id} scope="col" style={{ textAlign: 'center' }}>
                        {r.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map(([group, perms]) => (
                    <FragmentRows key={group} group={group} perms={perms} roles={data.roles} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function FragmentRows({ group, perms, roles }: { group: string; perms: PermissionInfo[]; roles: RoleInfo[] }) {
  return (
    <>
      <tr>
        <th scope="rowgroup" colSpan={roles.length + 1} style={{ position: 'static' }}>
          {group}
        </th>
      </tr>
      {perms.map((p) => (
        <tr key={p.id}>
          <td>{p.label}</td>
          {roles.map((r) => {
            const yes = p.roles.includes(r.id);
            return (
              <td key={r.id} style={{ textAlign: 'center' }}>
                <span className="pill" data-tone={yes ? 'good' : undefined} aria-label={yes ? 'Allowed' : 'Not allowed'}>
                  {yes ? '✓' : '—'}
                </span>
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

const ACTION_LABEL: Record<string, string> = {
  'auth.login': 'Signed in',
  'auth.login_failed': 'Sign-in failed',
  'auth.login_refused_disabled': 'Sign-in refused (disabled)',
  'user.created': 'User created',
  'organization.created': 'Organisation created',
  'user.role_changed': 'Role changed',
  'user.disabled': 'User disabled',
  'user.enabled': 'User enabled',
  'user.renamed': 'User renamed',
  'user.password_reset': 'Password reset by admin',
  'user.password_changed': 'Password changed',
};

export function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setEvents(null);
    void adminApi.auditEvents(500).then((r) => (r.ok ? setEvents(r.data.events) : (setError(adminFailure(r)), setEvents([]))));
  }, []);
  useEffect(load, [load]);
  const paged = usePaged(events ?? [], 20);
  return (
    <div className="pg" data-testid="page-audit">
      <PageHeader
        icon="≣"
        title="Audit log"
        lede="Sign-ins and every user, role and password change. Append-only: the database refuses edits and deletions."
        actions={
          <button type="button" className="btn btn-secondary" onClick={load}>
            Refresh
          </button>
        }
      />
      {error && <p className="note" data-tone="bad" role="alert">{error}</p>}
      <section className="card">
        <div className="table-wrap">
          <table className="tbl" data-testid="audit-table">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Event</th>
                <th scope="col">By (role)</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {paged.slice.map((e) => (
                <tr key={e.id}>
                  <td>{fmt(e.at)}</td>
                  <td>
                    <span className="pill" data-tone={e.action.includes('failed') || e.action.includes('refused') || e.action === 'user.disabled' ? 'bad' : undefined}>
                      {ACTION_LABEL[e.action] ?? e.action}
                    </span>
                  </td>
                  <td>{e.actor_role ? roleLabel(e.actor_role) : '—'}</td>
                  <td>
                    <code className="pg-meta">{e.detail ? JSON.stringify(e.detail) : ''}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {events === null && <Empty>Loading…</Empty>}
        {events !== null && events.length === 0 && !error && <Empty>No events yet.</Empty>}
        <Pager {...paged} noun="events" />
      </section>
    </div>
  );
}

/** Change password: voluntary (Account menu) or required after a temporary password. */
export function ChangePasswordForm({ required, email, onDone }: { required: boolean; email?: string; onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (next.length < 12) return setError('Use at least 12 characters.');
    if (next !== confirm) return setError('The two new passwords do not match.');
    setBusy(true);
    const r = await authApi.changePassword(current, next);
    setBusy(false);
    setCurrent('');
    setNext('');
    setConfirm('');
    if (!r.ok) return setError(r.status === 0 ? 'muster-api is not reachable.' : r.error ?? `muster-api returned ${r.status}.`);
    saveMusterToken(r.data.token, isTokenRemembered());
    setDone(true);
    onDone();
  };

  return (
    <form className="signin-form" onSubmit={submit} noValidate data-testid="change-password-form">
      {required && (
        <p className="note" style={{ marginBottom: 14 }}>
          {email ? `${email}: ` : ''}you signed in with a temporary password. Choose your own password to continue.
        </p>
      )}
      <label htmlFor="cp-current">Current password</label>
      <input id="cp-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} data-testid="cp-current" />
      <label htmlFor="cp-new">New password</label>
      <input id="cp-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} aria-describedby="cp-rule" data-testid="cp-new" />
      <label htmlFor="cp-confirm">Confirm new password</label>
      <input id="cp-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} data-testid="cp-confirm" />
      <p id="cp-rule" className="signin-caption" style={{ marginTop: -8, marginBottom: 12 }}>
        At least 12 characters, different from the current one, and not containing your email name.
      </p>
      {error && (
        <p className="signin-error" role="alert" data-testid="cp-error">
          {error}
        </p>
      )}
      {done && !required && (
        <p className="note" role="status" data-testid="cp-done">
          Password changed.
        </p>
      )}
      <button type="submit" className="btn btn-primary signin-submit" disabled={busy} data-testid="cp-submit">
        {busy ? 'Saving…' : 'Change password'}
      </button>
    </form>
  );
}

export function ChangePasswordPage() {
  return (
    <div className="pg" data-testid="page-change-password">
      <PageHeader icon="⚿" title="Change password" />
      <div className="card card-pad" style={{ maxWidth: 520 }}>
        <ChangePasswordForm required={false} onDone={() => undefined} />
      </div>
    </div>
  );
}
