// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

/**
 * One poll pass over both runner lanes (ADR-02). Pure orchestration: the API client and the two executors
 * are injected, so this file is tested without a server, a simulator or PowerShell.
 *
 *   for each engagement the runner identity can see:
 *     discovery:   GET …/assessments/runner/queue → POST claim → execute → POST result
 *     remediation: GET …/remediation/runner/queue → POST claim → execute → POST result
 *
 * Invariants: a claimed job always gets a result (executor throw → failed; result POST rejected → a minimal
 * failed result is posted instead); a lost claim race (409) is skipped; one engagement's error does not stop
 * the others; live discovery jobs are never claimed (the runner has no consent grants — see ADR-02 follow-up).
 */
import { ApiError, type DiscoveryJob, type DiscoveryResult, type RemediationResult, type RemediationRun, type RunnerClient } from './client.js';

export type DiscoveryExecutor = (job: DiscoveryJob, ctx: { engagementId: string }) => Promise<Omit<DiscoveryResult, 'runner'>>;
export type RemediationExecutor = (run: RemediationRun, ctx: { engagementId: string }) => Promise<Omit<RemediationResult, 'runner'>>;

export interface PollOptions {
  runner: string;
  discovery: DiscoveryExecutor;
  /** Absent → remediation lane is not polled (runs stay queued). */
  remediation?: RemediationExecutor;
  log?: (line: string) => void;
}

interface Lane { seen: number; done: number; failed: number; skipped: number }
export interface PollSummary { engagements: number; errors: number; discovery: Lane; remediation: Lane }

const lostRace = (e: unknown) => e instanceof ApiError && e.status === 409;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 4000);

export async function pollOnce(api: RunnerClient, opts: PollOptions): Promise<PollSummary> {
  const log = opts.log ?? (() => {});
  const s: PollSummary = { engagements: 0, errors: 0, discovery: { seen: 0, done: 0, failed: 0, skipped: 0 }, remediation: { seen: 0, done: 0, failed: 0, skipped: 0 } };
  const engagements = await api.engagements();
  s.engagements = engagements.length;
  for (const e of engagements) {
    try { await discoveryLane(api, opts, e.id, s.discovery, log); }
    catch (err) { s.errors += 1; log(`engagement ${e.id} discovery lane: ${msg(err)}`); }
    if (!opts.remediation) continue;
    try { await remediationLane(api, opts, e.id, s.remediation, log); }
    catch (err) { s.errors += 1; log(`engagement ${e.id} remediation lane: ${msg(err)}`); }
  }
  return s;
}

/** Post the result; if the API rejects it (413/422/network), post a minimal failed result so the job is closed. */
async function post<T>(send: (body: T) => Promise<void>, body: T, fallback: (reason: string) => T, log: (l: string) => void, what: string): Promise<T> {
  try { await send(body); return body; }
  catch (err) {
    if (lostRace(err)) return body; // already recorded — nothing to do
    const fb = fallback(`result rejected by API: ${msg(err).slice(0, 500)}`);
    log(`${what}: result rejected (${msg(err)}); posting failed result instead`);
    try { await send(fb); } catch (err2) { if (!lostRace(err2)) throw err2; }
    return fb;
  }
}

async function discoveryLane(api: RunnerClient, opts: PollOptions, engagementId: string, s: Lane, log: (l: string) => void) {
  for (const job of await api.discoveryQueue(engagementId)) {
    s.seen += 1;
    if (job.mode === 'live') { s.skipped += 1; log(`discovery ${job.id}: live job left queued (no live executor on the runner)`); continue; }
    try { await api.claimDiscovery(engagementId, job.id, opts.runner); }
    catch (err) { if (lostRace(err)) { s.skipped += 1; log(`discovery ${job.id}: claim refused (${(err as ApiError).code ?? 409})`); continue; } throw err; }
    let body: DiscoveryResult;
    try { body = { runner: opts.runner, ...(await opts.discovery(job, { engagementId })) }; }
    catch (err) { body = { runner: opts.runner, outcome: 'failed', error: msg(err), captures: [] }; }
    body = await post((b) => api.resultDiscovery(engagementId, job.id, b), body, (error) => ({ runner: opts.runner, outcome: 'failed', error, stats: body.stats, captures: [] }), log, `discovery ${job.id}`);
    if (body.outcome === 'succeeded') s.done += 1; else s.failed += 1;
    log(`discovery ${job.id} (${job.mode} · ${job.tenant_slug}): ${body.outcome}${body.error ? ` — ${body.error}` : ''}`);
  }
}

async function remediationLane(api: RunnerClient, opts: PollOptions, engagementId: string, s: Lane, log: (l: string) => void) {
  for (const run of await api.remediationQueue(engagementId)) {
    s.seen += 1;
    try { await api.claimRemediation(engagementId, run.id, opts.runner); }
    catch (err) { if (lostRace(err)) { s.skipped += 1; log(`remediation ${run.id}: claim refused (${(err as ApiError).code ?? 409})`); continue; } throw err; }
    let body: RemediationResult;
    try { body = { runner: opts.runner, ...(await opts.remediation!(run, { engagementId })) }; }
    catch (err) { body = { runner: opts.runner, outcome: 'failed', summary: `executor error: ${msg(err)}`, steps: [], captures: [] }; }
    body = await post((b) => api.resultRemediation(engagementId, run.id, b), body, (summary) => ({ runner: opts.runner, outcome: 'failed', summary, steps: [], captures: [] }), log, `remediation ${run.id}`);
    if (body.outcome === 'succeeded') s.done += 1; else s.failed += 1;
    log(`remediation ${run.id} (${run.module}): ${body.outcome} — ${body.summary}`);
  }
}
