// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

/** Executors the runner binary wires into pollOnce. Both are thin: the discovery engine is the same
 *  runSimDiscovery the API uses in-process on Windows; remediation shells out to whatever BHD's kit provides. */
import { execFile } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { runSimDiscovery } from '../services/simDiscoveryRun.js';
import type { Capture, DiscoveryJob, DiscoveryResult, RemediationResult, RemediationRun } from './client.js';
import type { DiscoveryExecutor, RemediationExecutor } from './poll.js';

const MAX_CAPTURES = 50;            // resultSchema: captures ≤ 50
const MAX_CAPTURE_BYTES = 1.5 * 1024 * 1024; // base64 of this stays under the 2 MB content cap

interface Observation { control_id: string; objective_ids?: string[]; ran_entry_ids?: string[]; raw_capture_ref?: string }

/** Mirrors captureRunEvidence: one capture per distinct raw_capture_ref, file read relative to outDir. */
export function collectCaptures(outDir: string, envelope: unknown, read: (abs: string) => Buffer = readFileSync, size: (abs: string) => number = (p) => statSync(p).size): { captures: Capture[]; missing: number; oversize: number } {
  const observations = ((envelope as { observations?: Observation[] })?.observations ?? []).filter((o) => o.raw_capture_ref);
  const byRef = new Map<string, Observation[]>();
  for (const o of observations) byRef.set(o.raw_capture_ref!, [...(byRef.get(o.raw_capture_ref!) ?? []), o]);
  const root = path.resolve(outDir);
  const captures: Capture[] = []; let missing = 0; let oversize = 0;
  for (const [ref, obs] of byRef) {
    if (captures.length >= MAX_CAPTURES) break;
    const abs = path.resolve(root, ref);
    if (!abs.startsWith(root + path.sep)) { missing += 1; continue; } // path escape → treated as missing
    let bytes: number;
    try { bytes = size(abs); } catch { missing += 1; continue; }
    if (bytes > MAX_CAPTURE_BYTES) { oversize += 1; continue; }
    captures.push({ ref, content: read(abs).toString('base64'), encoding: 'base64', entry_id: obs.flatMap((o) => o.ran_entry_ids ?? [])[0], requirement_ids: [...new Set(obs.map((o) => o.control_id))], objective_ids: [...new Set(obs.flatMap((o) => o.objective_ids ?? []))] });
  }
  return { captures, missing, oversize };
}

export function simDiscoveryExecutor(workRoot: string, run: typeof runSimDiscovery = runSimDiscovery): DiscoveryExecutor {
  return async (job: DiscoveryJob): Promise<Omit<DiscoveryResult, 'runner'>> => {
    if (job.mode !== 'sim') return { outcome: 'failed', error: 'live discovery is not executed by this runner yet', captures: [] };
    const outDir = path.join(workRoot, job.id);
    const outcome = await run({ slug: job.tenant_slug, outDir });
    if (!outcome.ok) return { outcome: 'failed', error: `${outcome.code}: ${outcome.message}`, captures: [] };
    const st = outcome.stats as { ran?: number; failed?: number };
    if (st?.ran && st.failed === st.ran) return { outcome: 'failed', error: `engine_unavailable: all ${st.ran} registry commands failed on ${process.platform}`, stats: st as Record<string, unknown>, captures: [] };
    const { captures, missing, oversize } = collectCaptures(outDir, outcome.envelope);
    return { outcome: 'succeeded', envelope: outcome.envelope, stats: { ...(outcome.stats as Record<string, unknown>), captures_posted: captures.length, captures_missing: missing, captures_oversize: oversize }, captures };
  };
}

/**
 * Remediation seam: `cmd` is run with the queued run as JSON on stdin and must print a JSON result
 * `{ outcome, summary, steps?, captures?, execution_results? }` on stdout (see RemediationResult). The run's
 * `parameters` arrive exactly as the API holds them — never secrets (PB-02); the command resolves tenant
 * credentials on its own box. Set CES_RUNNER_REMEDIATION_CMD to wire BHD's Stamper/AdminOps scripts in.
 */
export function shellRemediationExecutor(cmd: string, args: string[] = [], timeoutMs = 15 * 60 * 1000): RemediationExecutor {
  return (run: RemediationRun, ctx) => new Promise<Omit<RemediationResult, 'runner'>>((resolve) => {
    const child = execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) { resolve({ outcome: 'failed', summary: `remediation command failed: ${err.message}${stderr ? ` — ${String(stderr).slice(0, 1000)}` : ''}`, steps: [], captures: [] }); return; }
      try {
        const out = JSON.parse(String(stdout)) as Partial<RemediationResult>;
        if (out.outcome !== 'succeeded' && out.outcome !== 'failed') throw new Error('outcome must be succeeded|failed');
        resolve({ outcome: out.outcome, summary: String(out.summary ?? '').slice(0, 4000) || `${out.outcome} (no summary)`, steps: out.steps ?? [], captures: out.captures ?? [], execution_results: out.execution_results });
      } catch (e) { resolve({ outcome: 'failed', summary: `remediation command returned unusable output: ${e instanceof Error ? e.message : String(e)}`, steps: [], captures: [] }); }
    });
    child.stdin?.end(JSON.stringify({ run, engagement_id: ctx.engagementId }));
  });
}
