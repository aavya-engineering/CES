// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// UI-01: the sign-in page, the token store behind it, and the header account
// control. Production code throughout; only global fetch is faked.
import { act } from 'react';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SignInPage from '../SignInPage';
import {
  MUSTER_JWT_KEY,
  clearMusterToken,
  decodeMusterToken,
  getMusterToken,
  roleLabel,
  saveMusterToken,
} from '@/shared/api/musterToken';
import { MusterNav } from '@/features/app/App';
import { currentAccount, OFFLINE_CHOICE_KEY } from '@/features/app/account';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A JWT-shaped token (unsigned; the SPA never verifies signatures). */
function fakeJwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.sig`;
}
const inHours = (h: number) => Math.floor(Date.now() / 1000) + h * 3600;

let container: HTMLDivElement;
let root: Root;
const onSignedIn = vi.fn();
const onWorkOffline = vi.fn();

function q<T extends Element = HTMLElement>(testId: string): T {
  const el = container.querySelector(`[data-testid="${testId}"]`);
  if (!el) throw new Error(`missing ${testId}`);
  return el as T;
}

function type(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function render() {
  await act(async () => {
    root.render(<SignInPage onSignedIn={onSignedIn} onWorkOffline={onWorkOffline} />);
  });
}

async function submit() {
  await act(async () => {
    q<HTMLFormElement>('signin-form').dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  onSignedIn.mockReset();
  onWorkOffline.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('UI-01 sign-in page', () => {
  it('signs in with email + password; "Keep me signed in" off keeps the token for this tab only', async () => {
    const token = fakeJwt({ sub: 'u1', role: 'bhd_operator', exp: inHours(8) });
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ token }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    await render();

    await act(async () => {
      type(q('signin-email'), ' operator@muster.test ');
      type(q('signin-password'), 'pw-123');
    });
    await submit();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/auth\/login$/);
    expect(JSON.parse(String(init.body))).toEqual({ email: 'operator@muster.test', password: 'pw-123' });
    expect(onSignedIn).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(MUSTER_JWT_KEY)).toBe(token);
    expect(localStorage.getItem(MUSTER_JWT_KEY)).toBeNull();
    // The password is never stored anywhere.
    const stored = [...Object.values(localStorage), ...Object.values(sessionStorage)].join('|');
    expect(stored).not.toContain('pw-123');
  });

  it('"Keep me signed in" on keeps the token in localStorage', async () => {
    const token = fakeJwt({ sub: 'u1', role: 'sub', exp: inHours(8) });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ token }), { status: 200 })));
    await render();
    await act(async () => {
      type(q('signin-email'), 'a@b.test');
      type(q('signin-password'), 'pw');
      q<HTMLInputElement>('signin-remember').click();
    });
    await submit();
    expect(localStorage.getItem(MUSTER_JWT_KEY)).toBe(token);
    expect(sessionStorage.getItem(MUSTER_JWT_KEY)).toBeNull();
  });

  it('wrong credentials: one generic message, announced, password cleared, no token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    await render();
    await act(async () => {
      type(q('signin-email'), 'a@b.test');
      type(q('signin-password'), 'bad');
    });
    await submit();
    const err = q('signin-error');
    expect(err.getAttribute('role')).toBe('alert');
    expect(err.textContent).toMatch(/did not accept that email and password/);
    expect(q<HTMLInputElement>('signin-password').value).toBe('');
    expect(q('signin-email').getAttribute('aria-invalid')).toBe('true');
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(getMusterToken()).toBeNull();
  });

  it('too many attempts (429) is explained', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429 })));
    await render();
    await act(async () => {
      type(q('signin-email'), 'a@b.test');
      type(q('signin-password'), 'bad');
    });
    await submit();
    expect(q('signin-error').textContent).toMatch(/too many failed attempts/i);
  });

  it('API not reachable is explained', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await render();
    await act(async () => {
      type(q('signin-email'), 'a@b.test');
      type(q('signin-password'), 'pw');
    });
    await submit();
    expect(q('signin-error').textContent).toMatch(/not reachable/);
  });

  it('empty fields are caught before any network call', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await render();
    await submit();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(q('signin-error').textContent).toMatch(/Enter your email address and password/);
  });

  it('show/hide password toggles the field type and its pressed state', async () => {
    await render();
    const pw = q<HTMLInputElement>('signin-password');
    expect(pw.type).toBe('password');
    await act(async () => q('signin-reveal').click());
    expect(pw.type).toBe('text');
    expect(q('signin-reveal').getAttribute('aria-pressed')).toBe('true');
  });

  it('SSO, Microsoft and Forgot password say plainly that they are not available yet', async () => {
    await render();
    expect(q('signin-microsoft').getAttribute('aria-disabled')).toBe('true');
    await act(async () => q('signin-microsoft').click());
    expect(q('signin-microsoft-note').textContent).toMatch(/not available yet/);
    await act(async () => q('signin-forgot').click());
    expect(q('signin-reset-help').textContent).toMatch(/no self-service password reset/);
    expect(q('signin-reset-help').textContent).toMatch(/no email is sent/);
    await act(async () => q('signin-back').click());
    await act(async () => q('signin-method-sso').click());
    expect(q('signin-sso-panel').textContent).toMatch(/not set up for CES yet/);
    expect(q('signin-method-sso').getAttribute('aria-selected')).toBe('true');
  });

  it('"Work offline" makes no network call and hands control back', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await render();
    await act(async () => q('signin-work-offline').click());
    expect(onWorkOffline).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows the authorized-use notice', async () => {
    await render();
    expect(q('signin-notice').textContent).toMatch(/Authorized Use Only/);
  });

  it('rendering the page makes no network call (DW#5)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await render();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('UI-01 token store', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('an expired token is dropped on read', () => {
    localStorage.setItem(MUSTER_JWT_KEY, fakeJwt({ exp: inHours(-1) }));
    expect(getMusterToken()).toBeNull();
    expect(localStorage.getItem(MUSTER_JWT_KEY)).toBeNull();
  });

  it('a token that is not a JWT is left for the API to judge', () => {
    localStorage.setItem(MUSTER_JWT_KEY, 'opaque');
    expect(getMusterToken()).toBe('opaque');
  });

  it('saving replaces a token held in the other store; clearing removes both', () => {
    saveMusterToken('one', true);
    saveMusterToken('two', false);
    expect(localStorage.getItem(MUSTER_JWT_KEY)).toBeNull();
    expect(sessionStorage.getItem(MUSTER_JWT_KEY)).toBe('two');
    localStorage.setItem(MUSTER_JWT_KEY, 'three');
    clearMusterToken();
    expect(localStorage.getItem(MUSTER_JWT_KEY)).toBeNull();
    expect(sessionStorage.getItem(MUSTER_JWT_KEY)).toBeNull();
  });

  it('decodes base64url claims', () => {
    expect(decodeMusterToken(fakeJwt({ role: 'prime', exp: 5 }))).toEqual({ role: 'prime', exp: 5 });
    expect(decodeMusterToken('a.b')).toBeNull();
  });

  it('role labels', () => {
    expect(roleLabel('bhd_operator')).toBe('BHD operator');
    expect(roleLabel('assessor_read_only')).toBe('Assessor (read-only)');
    expect(roleLabel('something_new')).toBe('something_new');
  });
});

describe('UI-01 app gate and header', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('no token and no offline choice → signed-out (sign-in page)', () => {
    expect(currentAccount()).toEqual({ kind: 'signed-out' });
  });

  it('"Work offline" choice for this tab → offline', () => {
    sessionStorage.setItem(OFFLINE_CHOICE_KEY, '1');
    expect(currentAccount()).toEqual({ kind: 'offline' });
  });

  it('a live token wins and carries the role label', () => {
    sessionStorage.setItem(OFFLINE_CHOICE_KEY, '1');
    localStorage.setItem(MUSTER_JWT_KEY, fakeJwt({ role: 'bhd_operator', exp: inHours(1) }));
    expect(currentAccount()).toMatchObject({ kind: 'signed-in', role: 'BHD operator', roleId: 'bhd_operator' });
  });

  it('header shows the role and Sign out when signed in, Sign in when offline, nothing when not given', () => {
    const signedIn = renderToStaticMarkup(
      React.createElement(MusterNav, {
        kind: 'individual_contractor',
        onNavigate: () => {},
        account: { kind: 'signed-in', role: 'BHD operator', roleId: 'bhd_operator', name: null, email: null, sub: null },
      })
    );
    expect(signedIn).toContain('Signed in · BHD operator');
    expect(signedIn).toContain('data-testid="header-signout"');

    const offline = renderToStaticMarkup(
      React.createElement(MusterNav, {
        kind: 'individual_contractor',
        onNavigate: () => {},
        account: { kind: 'offline' },
      })
    );
    expect(offline).toContain('Working offline');
    expect(offline).toContain('data-testid="header-signin"');

    const bare = renderToStaticMarkup(
      React.createElement(MusterNav, { kind: 'individual_contractor', onNavigate: () => {} })
    );
    expect(bare).not.toContain('header-account');
  });
});
