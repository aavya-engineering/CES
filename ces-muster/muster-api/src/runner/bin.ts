// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

/**
 * CES tenant runner — polls muster-api for queued discovery jobs (and, when wired, remediation runs),
 * executes them on this box and posts results (ADR-02). Meant for the Windows box next to the tenant;
 * `npm run runner` here, or install as a service (docs/DEV-SETUP-WINDOWS.md, project doc 45 Part C).
 *
 * Environment (no CLI flags beyond --once):
 *   CES_API_URL                    http://localhost:4000/api            (must end in /api)
 *   CES_RUNNER_EMAIL / _PASSWORD   bhd_operator account (dev: runner@contoso.local); re-logs in on 401 — or
 *   CES_RUNNER_TOKEN               a static bearer token (a 401 then exits non-zero for the service manager)
 *   CES_RUNNER_NAME                label stored on claims/results (default: hostname)
 *   CES_RUNNER_INTERVAL_MS         poll interval, ≥ 1000 (default 30000)
 *   CES_RUNNER_WORK                work root for engine output (default <os.tmpdir()>/ces-runner)
 *   CES_RUNNER_REMEDIATION_CMD     optional command for the remediation lane (see executors.ts)
 *   CES_RUNNER_REMEDIATION_ARGS    optional JSON array of arguments for that command
 * The password is read once and never logged, echoed or passed to child processes.
 */
import os from 'node:os';
import path from 'node:path';
import { ApiError, createClient, login } from './client.js';
import { shellRemediationExecutor, simDiscoveryExecutor } from './executors.js';
import { pollOnce } from './poll.js';

const env = (k: string, d?: string) => process.env[k]?.trim() || d;
const log = (line: string) => console.log(`[runner ${new Date().toISOString()}] ${line}`);

async function main() {
  const apiBase = env('CES_API_URL', 'http://localhost:4000/api')!;
  if (!/\/api$/.test(apiBase)) throw new Error('CES_API_URL must end in /api');
  const runner = env('CES_RUNNER_NAME', os.hostname())!;
  const interval = Math.max(1000, Number(env('CES_RUNNER_INTERVAL_MS', '30000')) || 30000);
  const once = process.argv.includes('--once');
  const workRoot = env('CES_RUNNER_WORK', path.join(os.tmpdir(), 'ces-runner'))!;
  const remCmd = env('CES_RUNNER_REMEDIATION_CMD');
  const remArgs = JSON.parse(env('CES_RUNNER_REMEDIATION_ARGS', '[]')!) as unknown;
  if (!Array.isArray(remArgs) || !remArgs.every((a) => typeof a === 'string')) throw new Error('CES_RUNNER_REMEDIATION_ARGS must be a JSON array of strings');

  const staticToken = env('CES_RUNNER_TOKEN');
  const email = env('CES_RUNNER_EMAIL'); const password = process.env.CES_RUNNER_PASSWORD;
  delete process.env.CES_RUNNER_PASSWORD; delete process.env.CES_RUNNER_TOKEN;
  if (!staticToken && !(email && password)) throw new Error('set CES_RUNNER_TOKEN, or CES_RUNNER_EMAIL and CES_RUNNER_PASSWORD');
  const api = createClient(apiBase, staticToken ?? (() => login(apiBase, email!, password!)));
  const opts = { runner, discovery: simDiscoveryExecutor(workRoot), remediation: remCmd ? shellRemediationExecutor(remCmd, remArgs) : undefined, log };
  log(`${runner} → ${apiBase} every ${interval} ms; discovery=sim; remediation=${remCmd ? 'cmd' : 'off'}; platform=${process.platform}`);
  if (process.platform !== 'win32') log('warning: registry commands are PowerShell — discovery jobs will fail on this platform (ENGINE_NEEDS_WINDOWS)');

  let stopping = false; let timer: NodeJS.Timeout | undefined; let wake: (() => void) | undefined;
  const stop = (sig: string) => { if (stopping) { log(`second ${sig}: exiting now`); process.exit(130); } stopping = true; log(`${sig}: stopping after this pass`); if (timer) clearTimeout(timer); wake?.(); };
  process.on('SIGINT', () => stop('SIGINT')); process.on('SIGTERM', () => stop('SIGTERM'));
  do {
    try {
      const s = await pollOnce(api, opts);
      if (s.discovery.seen || s.remediation.seen || s.errors || once) log(`pass: ${s.engagements} engagements, ${s.errors} errors; discovery ${JSON.stringify(s.discovery)}; remediation ${JSON.stringify(s.remediation)}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) throw new Error('token rejected (401) and no credentials to re-login — restart the runner with a fresh token');
      log(`pass failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (once || stopping) break;
    await new Promise<void>((r) => { wake = r; timer = setTimeout(r, interval); });
  } while (!stopping);
}

main().catch((e) => { console.error(`[runner] fatal: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
