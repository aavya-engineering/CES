// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// musterAuth.ts — FX-MU4: the operator signs in to muster-api so the Plan tab's
// "Send to Stamper" / "Check Stamper progress" carry a real bearer token.
//
// muster-api already owns the identity path: POST /auth/login {email,password}
// → {token} (muster-api/src/routes/auth.ts), bcrypt-checked against the User
// table, minted with JWT_SECRET. This module only calls it and stores the
// returned token under 'muster-jwt' — the key musterApi.ts already sends as
// `Authorization: Bearer`. The password is never stored.
//
// Network-optional (musterApi.ts DW#5): only the Plan tab's explicit sign-in
// click reaches this; the interview path never imports it.
import { getApiBase } from './musterApi';
import { MUSTER_JWT_KEY, clearMusterToken, getMusterToken, isTokenRemembered, saveMusterToken } from './musterToken';

// UI-01: storage moved to musterToken.ts; re-exported so existing imports keep working.
export { MUSTER_JWT_KEY };

/** Login timeout: bcrypt + a DB lookup; generous next to the 3s API default. */
export const SIGN_IN_TIMEOUT_MS = 10_000;

export type SignInOutcome = { ok: true } | { ok: false; status: number; message: string };

/**
 * The auth router is mounted at `/auth`, beside (not under) `/api`. Strip only
 * a trailing `/api` so a prefixed base (e.g. https://host/muster/api) keeps its
 * prefix.
 */
export function getAuthBase(): string {
  return getApiBase().replace(/\/+$/, '').replace(/\/api$/, '');
}

/** True when a token is stored and has not expired (checked locally, no network). */
export function hasMusterToken(): boolean {
  return getMusterToken() !== null;
}

export function signOutOfMuster(): void {
  clearMusterToken();
}

export function signInFailureMessage(status: number): string {
  if (status === 0) return 'muster-api is not reachable (not running, blocked, or timed out)';
  if (status === 401) return 'muster-api did not accept that email and password';
  if (status === 400) return 'enter a valid email and a password';
  // RBAC-01: muster-api answers 403 only for a disabled account (after the right password).
  if (status === 403) return 'this account is disabled — ask your platform administrator';
  if (status === 429) return 'too many failed attempts for this account — wait a few minutes and try again';
  return `muster-api sign-in returned ${status}`;
}

/**
 * `remember` (UI-01 "Keep me signed in"): true keeps the token after the browser
 * closes (until it expires); false keeps it for this tab only. Defaults to true,
 * the FX-MU4 behaviour, for existing callers.
 */
export async function signInToMuster(
  email: string,
  password: string,
  options: { remember?: boolean } = {}
): Promise<SignInOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SIGN_IN_TIMEOUT_MS);
  try {
    const res = await fetch(`${getAuthBase()}/auth/login`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      signOutOfMuster();
      return { ok: false, status: res.status, message: signInFailureMessage(res.status) };
    }
    const json = (await res.json()) as { token?: unknown };
    if (typeof json?.token !== 'string' || json.token.length === 0) {
      signOutOfMuster();
      return { ok: false, status: res.status, message: 'muster-api sign-in returned no token' };
    }
    saveMusterToken(json.token, options.remember ?? true);
    return { ok: true };
  } catch {
    return { ok: false, status: 0, message: signInFailureMessage(0) };
  } finally {
    clearTimeout(timer);
  }
}

/** S1.9: swap the current token for a fresh one while the user is active (sliding
 *  session). Keeps the storage the user chose with "Keep me signed in". */
export async function refreshMusterSession(): Promise<boolean> {
  const token = getMusterToken();
  if (!token) return false;
  try {
    const res = await fetch(`${getAuthBase()}/auth/refresh`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return false;
    const json = (await res.json()) as { token?: string };
    if (!json.token) return false;
    saveMusterToken(json.token, isTokenRemembered());
    return true;
  } catch {
    return false;
  }
}

// S1.9 (decision D3): forgot / reset password. Both answer in plain language;
// the forgot answer never says whether the email has an account.
export async function requestPasswordReset(email: string): Promise<{ ok: boolean; message: string }> {
  return authPost('/auth/forgot-password', { email }, 'If an account exists for this email, a reset link has been sent.');
}

export async function resetPassword(token: string, newPassword: string): Promise<{ ok: boolean; message: string }> {
  return authPost('/auth/reset-password', { token, new_password: newPassword }, 'Your password has been changed. Sign in with your new password.');
}

async function authPost(path: string, body: unknown, okMessage: string): Promise<{ ok: boolean; message: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SIGN_IN_TIMEOUT_MS);
  try {
    const res = await fetch(`${getAuthBase()}${path}`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { message?: string; error?: unknown };
    if (res.ok) return { ok: true, message: typeof json.message === 'string' ? json.message : okMessage };
    return { ok: false, message: typeof json.error === 'string' ? json.error : res.status === 429 ? 'Too many requests. Try again in 15 minutes.' : 'Something went wrong. Try again.' };
  } catch {
    return { ok: false, message: 'CES is not reachable. Check your connection and try again.' };
  } finally {
    clearTimeout(timer);
  }
}
