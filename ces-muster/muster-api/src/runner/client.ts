// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

/**
 * Runner HTTP client — the only thing in the runner that talks to muster-api (ADR-02 pull protocol).
 * One method per endpoint the runner uses. Tokens expire (JWT_EXPIRES_IN, 8h default / 30m in the kit), so
 * the client takes a `getToken` source: on a 401 it asks for a fresh token once and retries the call.
 */

export interface Engagement { id: string; name?: string; status?: string; live_access_enabled?: boolean }
export interface DiscoveryJob { id: string; kind: string; mode: 'sim' | 'live'; tenant_slug: string; label?: string | null }
export interface RemediationRun { id: string; module: 'stamper' | 'adminops'; entry_ids: string[]; op_id: string | null; parameters: Record<string, unknown>; requirement_id: string | null; action_id: string | null }
export interface Capture { ref: string; content: string; encoding: 'utf8' | 'base64'; content_type?: string; entry_id?: string; requirement_ids: string[]; objective_ids?: string[] }
export interface DiscoveryResult { runner: string; outcome: 'succeeded' | 'failed'; error?: string; envelope?: unknown; stats?: Record<string, unknown>; captures: Capture[] }
export interface RemediationStep { step: number; entry_id?: string; op_id?: string; label?: string; outcome: 'ok' | 'failed' | 'skipped' | 'held'; detail?: string; duration_ms?: number }
export interface RemediationResult { runner: string; outcome: 'succeeded' | 'failed'; summary: string; steps: RemediationStep[]; captures: Capture[]; execution_results?: unknown }

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string | undefined, message: string) { super(message); }
}

export interface RunnerClient {
  engagements(): Promise<Engagement[]>;
  discoveryQueue(engagementId: string): Promise<DiscoveryJob[]>;
  claimDiscovery(engagementId: string, jobId: string, runner: string): Promise<void>;
  resultDiscovery(engagementId: string, jobId: string, body: DiscoveryResult): Promise<void>;
  remediationQueue(engagementId: string): Promise<RemediationRun[]>;
  claimRemediation(engagementId: string, runId: string, runner: string): Promise<void>;
  resultRemediation(engagementId: string, runId: string, body: RemediationResult): Promise<void>;
}

type Fetch = typeof fetch;
const TIMEOUT_MS = 60_000; // result bodies can be tens of MB

/** `apiBase` ends in `/api` (e.g. http://localhost:4000/api). Login lives beside it at `/auth/login`. */
export async function login(apiBase: string, email: string, password: string, f: Fetch = fetch): Promise<string> {
  const res = await f(`${apiBase.replace(/\/api$/, '')}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(TIMEOUT_MS) });
  const data = (await res.json().catch(() => ({}))) as { token?: string; must_change_password?: boolean };
  if (!res.ok || !data.token) throw new ApiError(res.status, undefined, `login failed (${res.status})`);
  if (data.must_change_password) throw new ApiError(403, 'MUST_CHANGE_PASSWORD', 'runner account must change its password before it can be used (sign in once in the portal)');
  return data.token;
}

/** `token` is a string (static — a 401 is fatal) or a function that returns a fresh one (re-login on 401). */
export function createClient(apiBase: string, token: string | (() => Promise<string>), f: Fetch = fetch): RunnerClient {
  let current: string | undefined = typeof token === 'string' ? token : undefined;
  const fresh = async () => { if (typeof token === 'string') return token; current = await token(); return current; };
  const once = async <T>(method: 'GET' | 'POST', path: string, bearer: string, body?: unknown): Promise<{ ok: true; data: T } | { ok: false; err: ApiError }> => {
    const res = await f(`${apiBase}${path}`, { method, headers: { authorization: `Bearer ${bearer}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const data = (await res.json().catch(() => ({}))) as T & { code?: string };
    if (!res.ok) return { ok: false, err: new ApiError(res.status, data.code, `${method} ${path} → ${res.status}${data.code ? ` ${data.code}` : ''}`) };
    return { ok: true, data };
  };
  const call = async <T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> => {
    let r = await once<T>(method, path, current ?? (await fresh()), body);
    if (!r.ok && r.err.status === 401 && typeof token !== 'string') r = await once<T>(method, path, await fresh(), body);
    if (!r.ok) throw r.err;
    return r.data;
  };
  const eng = (id: string) => `/engagements/${encodeURIComponent(id)}`;
  return {
    engagements: () => call('GET', '/engagements'),
    discoveryQueue: (e) => call('GET', `${eng(e)}/assessments/runner/queue`),
    claimDiscovery: async (e, j, runner) => { await call('POST', `${eng(e)}/assessments/jobs/${j}/claim`, { runner }); },
    resultDiscovery: async (e, j, body) => { await call('POST', `${eng(e)}/assessments/jobs/${j}/result`, body); },
    remediationQueue: (e) => call('GET', `${eng(e)}/remediation/runner/queue`),
    claimRemediation: async (e, r, runner) => { await call('POST', `${eng(e)}/remediation/runs/${r}/claim`, { runner }); },
    resultRemediation: async (e, r, body) => { await call('POST', `${eng(e)}/remediation/runs/${r}/result`, body); },
  };
}
