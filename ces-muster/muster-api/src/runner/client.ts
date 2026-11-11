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
 * One method per endpoint the runner uses; no retries, no state beyond the bearer token.
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

/** `apiBase` ends in `/api` (e.g. http://localhost:4000/api). Login lives beside it at `/auth/login`. */
export async function login(apiBase: string, email: string, password: string, f: Fetch = fetch): Promise<string> {
  const res = await f(`${apiBase.replace(/\/api$/, '')}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const data = (await res.json().catch(() => ({}))) as { token?: string; error?: unknown };
  if (!res.ok || !data.token) throw new ApiError(res.status, undefined, `login failed (${res.status})`);
  return data.token;
}

export function createClient(apiBase: string, token: string, f: Fetch = fetch): RunnerClient {
  const call = async <T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> => {
    const res = await f(`${apiBase}${path}`, { method, headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = (await res.json().catch(() => ({}))) as T & { error?: unknown; code?: string };
    if (!res.ok) throw new ApiError(res.status, data.code, `${method} ${path} → ${res.status}${data.code ? ` ${data.code}` : ''}`);
    return data;
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
