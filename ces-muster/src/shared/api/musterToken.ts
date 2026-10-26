// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// musterToken.ts — UI-01: one place that stores and reads the muster-api token.
//
// "Keep me signed in" ticked   → localStorage  (survives closing the browser,
//                                 until the token's own expiry, JWT_EXPIRES_IN, 8h by default).
// "Keep me signed in" unticked → sessionStorage (gone when the tab closes).
//
// The key stays 'muster-jwt' (FX-MU4), so existing tooling and tests keep
// working. An expired token is removed on read, so the app never shows
// "signed in" with a token the API will refuse.
//
// Pure storage + local decode only: no network. Safe to import anywhere (DW#5).
//
// Known limit (Aavya 360° A4, doc 18 §3.2): a token in web storage can be read
// by any script on the page. The target is an HttpOnly session cookie set by
// the server; that is a muster-api change, TBD with BHD.

export const MUSTER_JWT_KEY = 'muster-jwt';

/** Fired on window when the token is saved or cleared, so the header and the Plan tab stay in step. */
export const MUSTER_AUTH_EVENT = 'muster-auth-changed';

function announce(): void {
  try {
    if (typeof window !== 'undefined' && typeof Event === 'function') {
      window.dispatchEvent(new Event(MUSTER_AUTH_EVENT));
    }
  } catch {
    /* ignore */
  }
}

export interface MusterTokenClaims {
  sub?: string;
  role?: string;
  tenant_id?: string;
  party_id?: string | null;
  exp?: number;
  /** RBAC-01 claims (optional: older tokens lack them). */
  email?: string;
  name?: string | null;
  pwd_change_required?: boolean;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function store(kind: 'local' | 'session'): StorageLike | null {
  try {
    const s = kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
    return s ?? null;
  } catch {
    // Storage can throw (privacy mode, blocked site data).
    return null;
  }
}

/** Reads the token's claims without checking the signature (the API does that). */
export function decodeMusterToken(token: string): MusterTokenClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    // UTF-8 decode, so a display name like "Zoë" survives.
    const binary = typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString('binary');
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    const claims = JSON.parse(json) as unknown;
    return claims && typeof claims === 'object' ? (claims as MusterTokenClaims) : null;
  } catch {
    return null;
  }
}

function isExpired(token: string, nowMs: number): boolean {
  const claims = decodeMusterToken(token);
  // A token we cannot read is left for the API to judge (it answers 401).
  if (!claims || typeof claims.exp !== 'number') return false;
  return claims.exp * 1000 <= nowMs;
}

/** The current token, or null. Removes an expired token as a side effect. */
export function getMusterToken(nowMs = Date.now()): string | null {
  for (const kind of ['local', 'session'] as const) {
    const s = store(kind);
    let token: string | null = null;
    try {
      token = s?.getItem(MUSTER_JWT_KEY) ?? null;
    } catch {
      token = null;
    }
    if (!token) continue;
    if (isExpired(token, nowMs)) {
      try {
        s?.removeItem(MUSTER_JWT_KEY);
      } catch {
        /* ignore */
      }
      continue;
    }
    return token;
  }
  return null;
}

export function saveMusterToken(token: string, remember: boolean): void {
  clearMusterToken();
  const s = store(remember ? 'local' : 'session') ?? store('local');
  s?.setItem(MUSTER_JWT_KEY, token);
  announce();
}

/** True when the current token lives in localStorage ("Keep me signed in"). */
export function isTokenRemembered(): boolean {
  try {
    return !!store('local')?.getItem(MUSTER_JWT_KEY);
  } catch {
    return false;
  }
}

export function clearMusterToken(): void {
  for (const kind of ['local', 'session'] as const) {
    try {
      store(kind)?.removeItem(MUSTER_JWT_KEY);
    } catch {
      /* ignore */
    }
  }
  announce();
}

/** Plain-language role name for the header. Unknown roles are shown as-is. */
export function roleLabel(role: string | undefined): string {
  switch (role) {
    case 'bhd_operator':
      return 'BHD operator';
    case 'prime':
      return 'Prime contractor';
    case 'sub':
      return 'Contractor';
    case 'assessor_read_only':
      return 'Assessor (read-only)';
    case 'platform_admin':
      return 'Platform administrator';
    default:
      return role ?? 'Signed in';
  }
}
