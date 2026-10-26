// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// RBAC-01 (SPA): Users page, change password, and the portal shell's role
// gating. Production components; only global fetch is faked.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChangePasswordForm, UsersPage } from '../pages/AdminPages';
import PortalShell from '../PortalShell';
import { MUSTER_JWT_KEY } from '@/shared/api/musterToken';
import { currentAccount } from '@/features/app/account';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function fakeJwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`;
}

const USERS = [
  { id: 'me', email: 'admin@bhd.test', display_name: 'Admin', role: 'platform_admin', tenant_id: 't1', organization: 'BHD', party_id: null, disabled: false, must_change_password: false, last_login_at: null, created_at: '2026-10-01T00:00:00Z' },
  { id: 'u2', email: 'it@acme.test', display_name: null, role: 'sub', tenant_id: 't2', organization: 'Acme', party_id: null, disabled: false, must_change_password: true, last_login_at: null, created_at: '2026-10-02T00:00:00Z' },
];

type Handler = (url: string, init: RequestInit) => { status: number; body: unknown };
let handler: Handler;
const calls: { url: string; method: string; body: unknown }[] = [];

let container: HTMLDivElement;
let root: Root;
const q = <T extends Element = HTMLElement>(id: string) => {
  const el = container.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing ${id}`);
  return el as T;
};
const has = (id: string) => !!container.querySelector(`[data-testid="${id}"]`);
function type(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  calls.length = 0;
  localStorage.setItem(MUSTER_JWT_KEY, fakeJwt({ sub: 'me', role: 'platform_admin', exp: Math.floor(Date.now() / 1000) + 3600 }));
  handler = (url, init) => {
    if (url.endsWith('/users/organizations')) return { status: 200, body: { organizations: [{ id: 't1', name: 'BHD' }] } };
    if (url.endsWith('/users') && (init.method ?? 'GET') === 'GET') return { status: 200, body: { users: USERS } };
    return { status: 404, body: {} };
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined });
      const r = handler(url, init);
      return new Response(JSON.stringify(r.body), { status: r.status });
    })
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('Users page', () => {
  it('lists users with status; opening yourself disables role, reset and disable', async () => {
    await act(async () => root.render(<UsersPage selfId="me" />));
    await flush();
    expect(q('users-total').textContent).toContain('2');
    expect(q('users-table').textContent).toContain('Invited');
    await act(async () => (container.querySelector('.row-btn') as HTMLButtonElement).click());
    expect(q<HTMLSelectElement>('user-role-select').disabled).toBe(true);
    expect(q<HTMLButtonElement>('user-reset').disabled).toBe(true);
    expect(q<HTMLButtonElement>('user-toggle-disabled').disabled).toBe(true);
  });

  it('add user → temporary password shown once, then gone', async () => {
    handler = ((prev) => (url: string, init: RequestInit) => {
      if (url.endsWith('/users') && init.method === 'POST') {
        return { status: 201, body: { user: { ...USERS[1], id: 'u9', email: 'new@acme.test' }, temporary_password: 'Abcde-Fghij-Kmnop-Qrstu' } };
      }
      return prev(url, init);
    })(handler);
    await act(async () => root.render(<UsersPage selfId="me" />));
    await flush();
    await act(async () => q('users-add').click());
    await act(async () => {
      type(q('add-user-email'), 'new@acme.test');
      type(q('add-user-role'), 'prime');
    });
    await act(async () => q<HTMLFormElement>('add-user-drawer').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await flush();
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.body).toEqual({ email: 'new@acme.test', role: 'prime', tenant_id: 't1' });
    expect(q('temp-password-value').textContent).toBe('Abcde-Fghij-Kmnop-Qrstu');
    await act(async () => q('temp-password-done').click());
    expect(has('temp-password-dialog')).toBe(false);
    expect(container.textContent).not.toContain('Abcde-Fghij');
    // Nothing about the password is kept in browser storage.
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('Abcde');
  });

  it('duplicate email is explained', async () => {
    handler = ((prev) => (url: string, init: RequestInit) =>
      url.endsWith('/users') && init.method === 'POST' ? { status: 409, body: { error: 'A user with this email already exists' } } : prev(url, init))(handler);
    await act(async () => root.render(<UsersPage selfId="me" />));
    await flush();
    await act(async () => q('users-add').click());
    await act(async () => type(q('add-user-email'), 'it@acme.test'));
    await act(async () => q<HTMLFormElement>('add-user-drawer').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await flush();
    expect(q('add-user-error').textContent).toMatch(/already exists/);
  });

  it('disable another user sends PATCH {disabled:true}; a 403 is explained', async () => {
    handler = ((prev) => (url: string, init: RequestInit) =>
      init.method === 'PATCH' ? { status: 403, body: { error: 'Forbidden' } } : prev(url, init))(handler);
    await act(async () => root.render(<UsersPage selfId="me" />));
    await flush();
    await act(async () => (container.querySelectorAll('.row-btn')[1] as HTMLButtonElement).click());
    await act(async () => q('user-toggle-disabled').click());
    await flush();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ disabled: true });
    expect(calls.find((c) => c.method === 'PATCH')?.url).toMatch(/\/users\/u2$/);
    expect(q('user-panel-error').textContent).toMatch(/Your role cannot do this/);
  });

  it('a non-admin token gets the 403 message, not a broken page', async () => {
    handler = () => ({ status: 403, body: { error: 'Forbidden' } });
    await act(async () => root.render(<UsersPage selfId="x" />));
    await flush();
    expect(q('users-error').textContent).toMatch(/Your role cannot do this/);
  });
});

describe('Change password', () => {
  it('checks length and match before calling the API; success stores the new token where the old one was', async () => {
    sessionStorage.setItem(MUSTER_JWT_KEY, localStorage.getItem(MUSTER_JWT_KEY)!);
    localStorage.removeItem(MUSTER_JWT_KEY);
    const newToken = fakeJwt({ sub: 'me', role: 'sub', exp: Math.floor(Date.now() / 1000) + 3600 });
    handler = (url) => (url.endsWith('/auth/change-password') ? { status: 200, body: { token: newToken } } : { status: 404, body: {} });
    const onDone = vi.fn();
    await act(async () => root.render(<ChangePasswordForm required email="it@acme.test" onDone={onDone} />));
    const submit = () => act(async () => q<HTMLFormElement>('change-password-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));

    await act(async () => { type(q('cp-current'), 'temp'); type(q('cp-new'), 'short'); type(q('cp-confirm'), 'short'); });
    await submit();
    expect(q('cp-error').textContent).toMatch(/at least 12/);
    await act(async () => { type(q('cp-new'), 'a long new password'); type(q('cp-confirm'), 'a different one!!'); });
    await submit();
    expect(q('cp-error').textContent).toMatch(/do not match/);
    expect(calls).toHaveLength(0);

    await act(async () => { type(q('cp-current'), 'temp'); type(q('cp-new'), 'a long new password'); type(q('cp-confirm'), 'a long new password'); });
    await submit();
    await flush();
    expect(calls[0].body).toEqual({ current_password: 'temp', new_password: 'a long new password' });
    expect(onDone).toHaveBeenCalled();
    expect(sessionStorage.getItem(MUSTER_JWT_KEY)).toBe(newToken);
    expect(localStorage.getItem(MUSTER_JWT_KEY)).toBeNull();
  });

  it('a temporary-password token puts the app in must-change state', () => {
    localStorage.setItem(MUSTER_JWT_KEY, fakeJwt({ sub: 'me', role: 'sub', email: 'it@acme.test', pwd_change_required: true, exp: Math.floor(Date.now() / 1000) + 600 }));
    expect(currentAccount()).toEqual({ kind: 'must-change', email: 'it@acme.test' });
  });
});

describe('Portal shell', () => {
  it('platform admin sees Users and Audit, not Muster; clicking an item navigates', async () => {
    const onGo = vi.fn();
    await act(async () =>
      root.render(
        <PortalShell viewer={{ kind: 'signed-in', role: 'platform_admin' }} user={{ name: 'Admin', email: 'a@b.test', roleLabel: 'Platform administrator' }} route="platform/users" musterView="assessment" onGo={onGo} onSignOut={() => {}} onSignIn={() => {}} themeToggle={null}>
          <p>content</p>
        </PortalShell>
      )
    );
    expect(has('nav-platform-users')).toBe(true);
    expect(has('nav-platform-audit')).toBe(true);
    expect(has('nav-muster-situation')).toBe(false);
    expect(q('nav-platform-users').getAttribute('aria-current')).toBe('page');
    await act(async () => q('nav-shared-requirements').click());
    expect(onGo).toHaveBeenCalledWith('shared/requirements', undefined);
  });

  it('account menu: change password and sign out', async () => {
    const onGo = vi.fn();
    const onSignOut = vi.fn();
    await act(async () =>
      root.render(
        <PortalShell viewer={{ kind: 'signed-in', role: 'bhd_operator' }} user={{ name: 'Sunny Kumrawat', email: 's@b.test', roleLabel: 'BHD operator' }} route="home" musterView="assessment" onGo={onGo} onSignOut={onSignOut} onSignIn={() => {}} themeToggle={null}>
          <p>content</p>
        </PortalShell>
      )
    );
    expect(q('header-account').textContent).toContain('SK');
    expect(q('header-account').textContent).toContain('BHD operator');
    await act(async () => q('header-account').click());
    await act(async () => q('menu-change-password').click());
    expect(onGo).toHaveBeenCalledWith('account/password', undefined);
    await act(async () => q('header-account').click());
    await act(async () => q('header-signout').click());
    expect(onSignOut).toHaveBeenCalled();
  });
});
