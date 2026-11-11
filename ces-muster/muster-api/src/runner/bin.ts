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
 *   CES_API_URL                  http://localhost:4000/api            (must end in /api)
 *   CES_RUNNER_EMAIL / _PASSWORD  bhd_operator account (e.g. runner@contoso.local in dev) — or
 *   CES_RUNNER_TOKEN              a bearer token instead of a password
 *   CES_RUNNER_NAME               label stored on claims/results (default: hostname)
 *   CES_RUNNER_INTERVAL_MS        poll interval (default 30000)
 *   CES_RUNNER_WORK               work root for engine output (default <os.tmpdir()>/ces-runner)
 *   CES_RUNNER_REMEDIATION_CMD    optional command for the remediation lane (see executors.ts)
 *   CES_RUNNER_ALLOW_LIVE=1       claim live discovery jobs (fails them until live execution lands)
 * The password is read once and never logged or echoed.
 */
import os from 'node:os';
import path from 'node:path';
import { createClient, login } from './client.js';
import { shellRemediationExecutor, simDiscoveryExecutor } from './executors.js';
import { pollOnce } from './poll.js';

const env = (k: string, d?: string) => process.env[k]?.trim() || d;
const log = (line: string) => console.log(`[runner ${new Date().toISOString()}] ${line}`);

async function main() {
  const apiBase = env('CES_API_URL', 'http://localhost:4000/api')!;
  if (!/\/api$/.test(apiBase)) throw new Error('CES_API_URL must end in /api');
  const runner = env('CES_RUNNER_NAME', os.hostname())!;
  const interval = Number(env('CES_RUNNER_INTERVAL_MS', '30000'));
  const once = process.argv.includes('--once');
  const workRoot = env('CES_RUNNER_WORK', path.join(os.tmpdir(), 'ces-runner'))!;
  const remCmd = env('CES_RUNNER_REMEDIATION_CMD');

  let token = env('CES_RUNNER_TOKEN');
  if (!token) {
    const email = env('CES_RUNNER_EMAIL'); const password = process.env.CES_RUNNER_PASSWORD;
    if (!email || !password) throw new Error('set CES_RUNNER_TOKEN, or CES_RUNNER_EMAIL and CES_RUNNER_PASSWORD');
    token = await login(apiBase, email, password);
    delete process.env.CES_RUNNER_PASSWORD;
  }
  const api = createClient(apiBase, token);
  const opts = {
    runner,
    discovery: simDiscoveryExecutor(workRoot),
    remediation: remCmd ? shellRemediationExecutor(remCmd) : undefined,
    allowLive: env('CES_RUNNER_ALLOW_LIVE') === '1',
    log,
  };
  log(`${runner} → ${apiBase} every ${interval} ms; discovery=sim${opts.allowLive ? '+live' : ''}; remediation=${remCmd ? 'cmd' : 'off'}; platform=${process.platform}`);
  if (process.platform !== 'win32') log('warning: registry commands are PowerShell — discovery jobs will fail on this platform (ENGINE_NEEDS_WINDOWS)');

  let stopping = false;
  process.on('SIGINT', () => { stopping = true; log('stopping after this pass'); });
  process.on('SIGTERM', () => { stopping = true; });
  do {
    try {
      const s = await pollOnce(api, opts);
      if (s.discovery.seen || s.remediation.seen || once) log(`pass: ${s.engagements} engagements; discovery ${JSON.stringify(s.discovery)}; remediation ${JSON.stringify(s.remediation)}`);
    } catch (e) { log(`pass failed: ${e instanceof Error ? e.message : String(e)}`); }
    if (once || stopping) break;
    await new Promise((r) => setTimeout(r, interval));
  } while (!stopping);
}

main().catch((e) => { console.error(`[runner] fatal: ${e instanceof Error ? e.message : String(e)}`); process.exit(1); });
