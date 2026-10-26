// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// account.ts — UI-01/UI-02: who is using the app (local checks only, no
// network — DW#5) and the portal's URL hash. Split out of App.tsx so App only
// exports components (react-refresh lint rule).
import { decodeMusterToken, getMusterToken, roleLabel } from '@/shared/api/musterToken';
import { isRouteId, type MusterView, type RouteId } from '@/features/portal/nav';

// UI-01: who is using the app. 'signed-out' shows the sign-in page.
// 'offline' = the user chose "Work offline" (kept for this tab only).
// UI-02 / RBAC-01: 'must-change' = signed in with a temporary password; only
// the change-password screen is shown until a new password is set.
export type Account =
  | { kind: 'signed-in'; role: string; roleId: string; name: string | null; email: string | null; sub: string | null }
  | { kind: 'must-change'; email: string | null }
  | { kind: 'offline' }
  | { kind: 'signed-out' };

export const OFFLINE_CHOICE_KEY = 'muster-work-offline';

export function readOfflineChoice(): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(OFFLINE_CHOICE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeOfflineChoice(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(OFFLINE_CHOICE_KEY, '1');
    else sessionStorage.removeItem(OFFLINE_CHOICE_KEY);
  } catch {
    /* storage blocked: the choice lasts until reload */
  }
}

/** UI-02: '#/shared/requirements' → route; '#/muster/discovery' → route + view. */
export function parseHash(hash: string = typeof window !== 'undefined' ? window.location.hash : ''): {
  route: RouteId | null;
  view: MusterView | null;
} {
  const path = hash.replace(/^#\/?/, '');
  if (path.startsWith('muster')) {
    const v = path.split('/')[1] ?? '';
    const views: MusterView[] = ['assessment', 'discovery', 'readiness', 'plan', 'contracts', 'quick-session', 'help', 'rollup', 'result'];
    return { route: 'muster', view: (views as string[]).includes(v) ? (v as MusterView) : null };
  }
  return { route: isRouteId(path) ? path : null, view: null };
}

/** Local check only (token present and not expired) — no network, DW#5. */
export function currentAccount(): Account {
  const token = getMusterToken();
  if (token) {
    const c = decodeMusterToken(token);
    if (c?.pwd_change_required) return { kind: 'must-change', email: c.email ?? null };
    return {
      kind: 'signed-in',
      role: roleLabel(c?.role),
      roleId: c?.role ?? '',
      name: c?.name ?? null,
      email: c?.email ?? null,
      sub: c?.sub ?? null,
    };
  }
  return readOfflineChoice() ? { kind: 'offline' } : { kind: 'signed-out' };
}

