// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// idleSignOut.ts — S1.9 (demo feedback 2026-10-27): end the session after 30
// minutes without activity (NIST SP 800-171 3.1.11 session termination).
//
// Activity (pointer, key, scroll, touch) in ANY tab of this app resets the
// clock: the last-activity time is shared through localStorage. Two minutes
// before the end, a warning lets the user stay signed in. Applies whether or
// not "Keep me signed in" was ticked.
//
// Server side: while the user is active, the token is swapped for a fresh one
// every 5 minutes (POST /auth/refresh). With JWT_EXPIRES_IN=30m (deployment kit)
// an idle session's token also stops working at the API after 30 minutes.
import { useEffect, useRef, useState } from 'react';

export const IDLE_LIMIT_MS = 30 * 60 * 1000;
export const IDLE_WARN_MS = 2 * 60 * 1000;
export const REFRESH_EVERY_MS = 5 * 60 * 1000;
const KEY = 'ces-last-activity';
const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

function readLast(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? v : Date.now();
  } catch {
    return Date.now();
  }
}
function writeLast(t: number): void {
  try {
    localStorage.setItem(KEY, String(t));
  } catch {
    /* storage blocked: this tab still tracks its own activity */
  }
}

/** Returns milliseconds left before sign-out (null when not active), and a function to stay signed in. */
export function useIdleSignOut(active: boolean, onTimeout: () => void, now: () => number = () => Date.now(), refresh?: () => Promise<boolean>) {
  const [left, setLeft] = useState<number | null>(null);
  const local = useRef(now());
  const fired = useRef(false);

  useEffect(() => {
    if (!active) {
      setLeft(null);
      return;
    }
    fired.current = false;
    local.current = now();
    let lastRefresh = local.current;
    writeLast(local.current);
    let lastWrite = 0;
    const touch = () => {
      const t = now();
      local.current = t;
      if (t - lastWrite > 5000) {
        lastWrite = t;
        writeLast(t);
      }
    };
    for (const e of EVENTS) window.addEventListener(e, touch, { passive: true });
    const tick = () => {
      const last = Math.max(local.current, readLast());
      const remaining = IDLE_LIMIT_MS - (now() - last);
      if (remaining <= 0) {
        if (!fired.current) {
          fired.current = true;
          setLeft(null);
          onTimeout();
        }
        return;
      }
      setLeft(remaining <= IDLE_WARN_MS ? remaining : null);
      // Sliding session: renew only when there was activity since the last renewal.
      if (refresh && now() - lastRefresh >= REFRESH_EVERY_MS && local.current > lastRefresh) {
        lastRefresh = now();
        void refresh();
      }
    };
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearInterval(id);
      for (const e of EVENTS) window.removeEventListener(e, touch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const stay = () => {
    local.current = now();
    writeLast(local.current);
    setLeft(null);
  };
  return { left, stay };
}
