// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// loginAttempts.ts — UI-01: limit repeated failed sign-ins on POST /auth/login.
//
// NIST SP 800-171 3.1.8 ("Limit unsuccessful logon attempts"). Before UI-01 the
// route accepted unlimited guesses.
//
// Rule: after MAX_FAILURES failed attempts for one account (email, case-folded)
// inside WINDOW_MS, further attempts for that account are refused with 429 until
// the window has passed since the first failure. A second, looser counter per
// client address stops one client spraying many accounts. A successful sign-in
// clears the account counter.
//
// Limits (documented, not hidden):
//  - In memory, per muster-api process. A restart clears it; several API
//    instances do not share it. A shared store is needed for multi-instance
//    hosting (TBD with BHD, see docs/sign-in.md).
//  - The account lock is temporary (window-based), so an attacker can delay a
//    real user for at most one window. Permanent lock / admin unlock needs user
//    management, which Muster does not have yet.

export const MAX_FAILURES_PER_ACCOUNT = Number(process.env.MUSTER_LOGIN_MAX_FAILURES ?? 5);
export const MAX_FAILURES_PER_CLIENT = Number(process.env.MUSTER_LOGIN_MAX_FAILURES_PER_CLIENT ?? 20);
export const WINDOW_MS = Number(process.env.MUSTER_LOGIN_WINDOW_MS ?? 15 * 60 * 1000);

interface Counter {
  failures: number;
  firstAt: number;
}

const byAccount = new Map<string, Counter>();
const byClient = new Map<string, Counter>();

function key(email: string): string {
  return email.trim().toLowerCase();
}

function live(map: Map<string, Counter>, k: string, now: number): Counter | undefined {
  const c = map.get(k);
  if (!c) return undefined;
  if (now - c.firstAt >= WINDOW_MS) {
    map.delete(k);
    return undefined;
  }
  return c;
}

/** Seconds until the caller may try again, or 0 when the attempt may proceed. */
export function retryAfterSeconds(email: string, client: string, now = Date.now()): number {
  const a = live(byAccount, key(email), now);
  const c = live(byClient, client, now);
  let waitMs = 0;
  if (a && a.failures >= MAX_FAILURES_PER_ACCOUNT) waitMs = Math.max(waitMs, a.firstAt + WINDOW_MS - now);
  if (c && c.failures >= MAX_FAILURES_PER_CLIENT) waitMs = Math.max(waitMs, c.firstAt + WINDOW_MS - now);
  return waitMs > 0 ? Math.ceil(waitMs / 1000) : 0;
}

function bump(map: Map<string, Counter>, k: string, now: number): void {
  const c = live(map, k, now);
  if (c) c.failures += 1;
  else map.set(k, { failures: 1, firstAt: now });
}

export function recordFailure(email: string, client: string, now = Date.now()): void {
  bump(byAccount, key(email), now);
  bump(byClient, client, now);
}

export function recordSuccess(email: string): void {
  byAccount.delete(key(email));
}

/** Tests only. */
export function resetLoginAttempts(): void {
  byAccount.clear();
  byClient.clear();
}
