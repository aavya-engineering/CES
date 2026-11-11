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
import { readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { runSimDiscovery } from '../services/simDiscoveryRun.js';
import type { Capture, DiscoveryJob, DiscoveryResult, RemediationResult, RemediationRun, RemediationStep } from './client.js';
import type { DiscoveryExecutor, RemediationExecutor } from './poll.js';

export const MAX_CAPTURES = 50;                      // resultSchema: captures ≤ 50
export const MAX_CAPTURE_BYTES = 1.5 * 1024 * 1024;  // base64 of this (2,097,152 chars) is exactly the 2 MB content cap
export const MAX_RESULT_BYTES = 100 * 1024 * 1024;   // keep the result body under the API's JSON limit (140 MB on this path)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Observation { control_id: string; objective_ids?: string[]; ran_entry_ids?: string[]; raw_capture_ref?: string }

/**
 * Mirrors captureRunEvidence: one capture per distinct raw_capture_ref, file read relative to outDir.
 * Differences from the in-process path, by design of the wire format: only the first ran_entry_id travels
 * (result schema has one `entry_id`), and files over the per-capture cap or past the 50-capture cut are
 * counted (`oversize`, `cut`) rather than stored by hash — the envelope still carries the observation.
 */
export function collectCaptures(outDir: string, envelope: unknown, read: (abs: string) => Buffer = readFileSync, size: (abs: string) => number = (p) => statSync(p).size): { captures: Capture[]; missing: number; oversize: number; cut: number } {
  const observations = ((envelope as { observations?: Observation[] })?.observations ?? []).filter((o) => o.raw_capture_ref);
  const byRef = new Map<string, Observation[]>();
  for (const o of observations) byRef.set(o.raw_capture_ref!, [...(byRef.get(o.raw_capture_ref!) ?? []), o]);
  const root = path.resolve(outDir);
  const captures: Capture[] = []; let missing = 0; let oversize = 0; let cut = 0; let total = 0;
  for (const [ref, obs] of byRef) {
    const abs = path.resolve(root, ref);
    if (!abs.startsWith(root + path.sep)) { missing += 1; continue; } // path escape → treated as missing
    let bytes: number;
    try { bytes = size(abs); } catch { missing += 1; continue; }
    if (bytes > MAX_CAPTURE_BYTES) { oversize += 1; continue; }
    if (captures.length >= MAX_CAPTURES || total + bytes > MAX_RESULT_BYTES) { cut += 1; continue; }
    total += bytes;
    captures.push({ ref, content: read(abs).toString('base64'), encoding: 'base64', entry_id: obs.flatMap((o) => o.ran_entry_ids ?? [])[0], requirement_ids: [...new Set(obs.map((o) => o.control_id))], objective_ids: [...new Set(obs.flatMap((o) => o.objective_ids ?? []))] });
  }
  return { captures, missing, oversize, cut };
}

export function simDiscoveryExecutor(workRoot: string, run: typeof runSimDiscovery = runSimDiscovery, cleanup: (dir: string) => void = (d) => rmSync(d, { recursive: true, force: true })): DiscoveryExecutor {
  return async (job: DiscoveryJob): Promise<Omit<DiscoveryResult, 'runner'>> => {
    if (job.mode !== 'sim') return { outcome: 'failed', error: 'live discovery is not executed by this runner yet', captures: [] };
    if (!UUID.test(job.id)) return { outcome: 'failed', error: 'job id is not a UUID', captures: [] };
    const outDir = path.join(workRoot, job.id);
    try {
      const outcome = await run({ slug: job.tenant_slug, outDir });
      if (!outcome.ok) return { outcome: 'failed', error: `${outcome.code}: ${outcome.message}`, captures: [] };
      const st = outcome.stats as { ran?: number; failed?: number };
      if (st?.ran && st.failed === st.ran) return { outcome: 'failed', error: `engine_unavailable: all ${st.ran} registry commands failed on ${process.platform}`, stats: st as Record<string, unknown>, captures: [] };
      const { captures, missing, oversize, cut } = collectCaptures(outDir, outcome.envelope);
      return { outcome: 'succeeded', envelope: outcome.envelope, stats: { ...(outcome.stats as Record<string, unknown>), captures_posted: captures.length, captures_missing: missing, captures_oversize: oversize, captures_cut: cut }, captures };
    } finally { try { cleanup(outDir); } catch { /* best effort; the work root is a temp dir */ } }
  };
}

/** Clamp a command's JSON output to what the API's resultSchema accepts, so a sloppy kit never 422s the run. */
export function sanitizeRemediationOutput(raw: unknown): Omit<RemediationResult, 'runner'> {
  const out = (raw ?? {}) as Partial<RemediationResult>;
  if (out.outcome !== 'succeeded' && out.outcome !== 'failed') throw new Error('outcome must be succeeded|failed');
  const steps: RemediationStep[] = (Array.isArray(out.steps) ? out.steps : []).slice(0, 500).map((s, i) => ({
    step: Number.isInteger(s?.step) && (s.step as number) >= 1 ? (s.step as number) : i + 1,
    entry_id: typeof s?.entry_id === 'string' ? s.entry_id.slice(0, 200) : undefined,
    op_id: typeof s?.op_id === 'string' ? s.op_id.slice(0, 200) : undefined,
    label: typeof s?.label === 'string' ? s.label.slice(0, 300) : undefined,
    outcome: (['ok', 'failed', 'skipped', 'held'] as const).includes(s?.outcome as never) ? s.outcome : 'failed',
    detail: typeof s?.detail === 'string' ? s.detail.slice(0, 2000) : undefined,
    duration_ms: Number.isInteger(s?.duration_ms) && (s.duration_ms as number) >= 0 ? s.duration_ms : undefined,
  }));
  const captures: Capture[] = (Array.isArray(out.captures) ? out.captures : []).slice(0, MAX_CAPTURES)
    .filter((c) => c && typeof c.ref === 'string' && typeof c.content === 'string' && c.content.length <= 2 * 1024 * 1024)
    .map((c) => ({ ref: c.ref.slice(0, 200), content: c.content, encoding: c.encoding === 'base64' ? 'base64' : 'utf8', content_type: typeof c.content_type === 'string' ? c.content_type.slice(0, 100) : undefined, entry_id: typeof c.entry_id === 'string' ? c.entry_id.slice(0, 200) : undefined, requirement_ids: Array.isArray(c.requirement_ids) ? c.requirement_ids.filter((x) => typeof x === 'string') : [] }));
  const summary = String(out.summary ?? '').trim().slice(0, 4000);
  return { outcome: out.outcome, summary: summary.length >= 3 ? summary : `${out.outcome} (no summary from command)`, steps, captures, execution_results: out.execution_results };
}

/**
 * Remediation seam: `cmd args…` is run with the queued run as JSON on stdin and must print a JSON result
 * `{ outcome, summary, steps?, captures?, execution_results? }` on stdout (see RemediationResult). The run's
 * `parameters` arrive exactly as the API holds them — never secrets (PB-02); the command resolves tenant
 * credentials on its own box. The child gets a scrubbed environment (no CES_RUNNER_* / token values).
 * Wire BHD's Stamper/AdminOps scripts with CES_RUNNER_REMEDIATION_CMD / _ARGS, e.g.
 * CMD=powershell.exe ARGS='["-NoProfile","-ExecutionPolicy","Bypass","-File","C:\\ces-nb\\runner\\remediate.ps1"]'.
 */
export function shellRemediationExecutor(cmd: string, args: string[] = [], timeoutMs = 15 * 60 * 1000): RemediationExecutor {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('CES_RUNNER_')));
  return (run: RemediationRun, ctx) => new Promise<Omit<RemediationResult, 'runner'>>((resolve) => {
    const child = execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, windowsHide: true, env }, (err, stdout, stderr) => {
      if (err) { resolve({ outcome: 'failed', summary: `remediation command failed: ${err.message.slice(0, 500)}${stderr ? ` — stderr: ${String(stderr).slice(0, 200)}` : ''}`, steps: [], captures: [] }); return; }
      try { resolve(sanitizeRemediationOutput(JSON.parse(String(stdout)))); }
      catch (e) { resolve({ outcome: 'failed', summary: `remediation command returned unusable output: ${e instanceof Error ? e.message : String(e)}`.slice(0, 4000), steps: [], captures: [] }); }
    });
    child.stdin?.on('error', () => { /* command exited before reading stdin; the exit callback reports it */ });
    child.stdin?.end(JSON.stringify({ run, engagement_id: ctx.engagementId }));
  });
}
