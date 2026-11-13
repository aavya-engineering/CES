// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

/**
 * Thin fetch wrapper for the Muster API.
 *
 * Base URL: localStorage 'muster-api-url', else the build-time VITE_MUSTER_API_URL
 *           (DEP-01: '/api' when the portal and API share one host behind a proxy),
 *           else http://localhost:4000/api (developer machine).
 * Auth:     'muster-jwt' (localStorage, or sessionStorage when "Keep me signed in" is off;
 *           see musterToken.ts) sent as Bearer token.
 * Timeout:  3 s via AbortController (override per call with `timeoutMs`).
 *
 * NEVER import or invoke this module in the static interview path — only the
 * adaptive/network-optional features (adaptiveEngine, CoachPanel, ContractsPage)
 * call it. This preserves the DW#5 zero-network-call guarantee for offline sessions.
 */

import { getMusterToken } from './musterToken';

/** One field-level problem from a 422 (muster-api validate(): { path, message }). */
export interface ApiIssue {
  path: string;
  message: string;
}
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; degraded: boolean; error?: string; details?: ApiIssue[] };

/** QA 2026-11-13: field errors of a failed call, keyed by field name (empty when the API sent none). */
export function issuesByField(r: { details?: ApiIssue[] }): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of r.details ?? []) if (i.path && !out[i.path]) out[i.path] = i.message;
  return out;
}

export function getApiBase(): string {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('muster-api-url');
    if (stored) return stored;
  }
  const built = import.meta.env.VITE_MUSTER_API_URL as string | undefined;
  return built && built.trim() ? built.trim() : 'http://localhost:4000/api';
}

// UI-01: read through musterToken.ts (localStorage or sessionStorage, expired
// tokens dropped). Pure storage access — still no network on import (DW#5).
function getJwt(): string | null {
  return getMusterToken();
}

export async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = 3000
): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const jwt = getJwt();
  try {
    const res = await fetch(`${getApiBase()}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    clearTimeout(timer);
    if (!res.ok) {
      let degraded = false;
      let error: string | undefined;
      let details: ApiIssue[] | undefined;
      try {
        const json = (await res.json()) as Record<string, unknown>;
        degraded = json?.degraded === true;
        if (typeof json?.error === 'string') error = json.error;
        // zod .flatten() bodies (contracts) arrive as { error: { fieldErrors } } — fold them into details.
        else if (json?.error && typeof json.error === 'object') {
          const fe = (json.error as { fieldErrors?: Record<string, string[]> }).fieldErrors ?? {};
          details = Object.entries(fe).map(([path, m]) => ({ path, message: m[0] ?? 'Invalid' }));
          error = details.length ? 'Validation failed' : 'Request failed';
        }
        if (Array.isArray(json?.details)) details = json.details as ApiIssue[];
      } catch {
        // non-JSON error body — degraded stays false
      }
      return { ok: false, status: res.status, degraded, ...(error ? { error } : {}), ...(details ? { details } : {}) };
    }
    // QA 2026-11-13: a 204 (delete) has no body — reading it as JSON threw and the
    // caller reported "unreachable" / "Not found" for a delete that had succeeded.
    if (res.status === 204) return { ok: true, data: undefined as T };
    let data: T;
    try {
      data = (await res.json()) as T;
    } catch {
      data = undefined as T; // empty body on a 2xx
    }
    return { ok: true, data };
  } catch {
    clearTimeout(timer);
    return { ok: false, status: 0, degraded: true };
  }
}

export const api = {
  get: <T>(path: string) => apiRequest<T>('GET', path),
  post: <T>(path: string, body?: unknown, timeoutMs?: number) =>
    apiRequest<T>('POST', path, body, timeoutMs),
  put: <T>(path: string, body?: unknown) => apiRequest<T>('PUT', path, body),
  // RBAC-01: user administration edits (PATCH /api/users/:id).
  patch: <T>(path: string, body?: unknown) => apiRequest<T>('PATCH', path, body),
  delete: <T>(path: string) => apiRequest<T>('DELETE', path),
};
