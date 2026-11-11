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
 * A claim that loses the race (409 JOB_NOT_QUEUED / RUN_NOT_QUEUED) is skipped silently. An executor that
 * throws becomes a `failed` result so the job never stays `running` forever. Nothing is retried here; the next
 * pass sees whatever is still queued.
 */
import { ApiError, type DiscoveryJob, type DiscoveryResult, type RemediationResult, type RemediationRun, type RunnerClient } from './client.js';

export type DiscoveryExecutor = (job: DiscoveryJob, ctx: { engagementId: string }) => Promise<Omit<DiscoveryResult, 'runner'>>;
export type RemediationExecutor = (run: RemediationRun, ctx: { engagementId: string }) => Promise<Omit<RemediationResult, 'runner'>>;

export interface PollOptions {
  runner: string;
  discovery: DiscoveryExecutor;
  /** Absent → remediation lane is not polled (runs stay queued). */
  remediation?: RemediationExecutor;
  /** Live-mode discovery jobs need the consent grants the API resolved at request time; the runner does not
   *  receive them yet, so live jobs are left queued unless an executor opts in. */
  allowLive?: boolean;
  log?: (line: string) => void;
}

export interface PollSummary { engagements: number; discovery: { seen: number; done: number; failed: number; skipped: number }; remediation: { seen: number; done: number; failed: number; skipped: number } }

const lostRace = (e: unknown) => e instanceof ApiError && e.status === 409;

export async function pollOnce(api: RunnerClient, opts: PollOptions): Promise<PollSummary> {
  const log = opts.log ?? (() => {});
  const s: PollSummary = { engagements: 0, discovery: { seen: 0, done: 0, failed: 0, skipped: 0 }, remediation: { seen: 0, done: 0, failed: 0, skipped: 0 } };
  const engagements = await api.engagements();
  s.engagements = engagements.length;
  for (const e of engagements) {
    const jobs = await api.discoveryQueue(e.id);
    for (const job of jobs) {
      s.discovery.seen += 1;
      if (job.mode === 'live' && !opts.allowLive) { s.discovery.skipped += 1; log(`discovery ${job.id}: live job left queued (runner has no consent grants)`); continue; }
      try { await api.claimDiscovery(e.id, job.id, opts.runner); }
      catch (err) { if (lostRace(err)) { s.discovery.skipped += 1; continue; } throw err; }
      let body: DiscoveryResult;
      try { body = { runner: opts.runner, ...(await opts.discovery(job, { engagementId: e.id })) }; }
      catch (err) { body = { runner: opts.runner, outcome: 'failed', error: msg(err), captures: [] }; }
      await api.resultDiscovery(e.id, job.id, body);
      if (body.outcome === 'succeeded') s.discovery.done += 1; else s.discovery.failed += 1;
      log(`discovery ${job.id} (${job.mode} · ${job.tenant_slug}): ${body.outcome}${body.error ? ` — ${body.error}` : ''}`);
    }
    if (!opts.remediation) continue;
    const runs = await api.remediationQueue(e.id);
    for (const run of runs) {
      s.remediation.seen += 1;
      try { await api.claimRemediation(e.id, run.id, opts.runner); }
      catch (err) { if (lostRace(err)) { s.remediation.skipped += 1; continue; } throw err; }
      let body: RemediationResult;
      try { body = { runner: opts.runner, ...(await opts.remediation(run, { engagementId: e.id })) }; }
      catch (err) { body = { runner: opts.runner, outcome: 'failed', summary: `executor error: ${msg(err)}`, steps: [], captures: [] }; }
      await api.resultRemediation(e.id, run.id, body);
      if (body.outcome === 'succeeded') s.remediation.done += 1; else s.remediation.failed += 1;
      log(`remediation ${run.id} (${run.module}): ${body.outcome} — ${body.summary}`);
    }
  }
  return s;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 4000);
