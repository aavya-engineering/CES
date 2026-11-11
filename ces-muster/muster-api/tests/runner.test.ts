// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

import { describe, expect, it, vi } from 'vitest';
import { ApiError, createClient, login, type RunnerClient } from '../src/runner/client.js';
import { collectCaptures, sanitizeRemediationOutput, shellRemediationExecutor, simDiscoveryExecutor } from '../src/runner/executors.js';
import { pollOnce } from '../src/runner/poll.js';

function fakeApi(over: Partial<RunnerClient> = {}): RunnerClient & { calls: string[] } {
  const calls: string[] = [];
  const rec = <T>(name: string, v: T) => async (...a: unknown[]) => { calls.push(`${name} ${a.filter((x) => typeof x === 'string').join(' ')}`); return v; };
  return {
    calls,
    engagements: rec('engagements', [{ id: 'e1' }]),
    discoveryQueue: rec('dq', []),
    claimDiscovery: rec('dclaim', undefined),
    resultDiscovery: rec('dresult', undefined),
    remediationQueue: rec('rq', []),
    claimRemediation: rec('rclaim', undefined),
    resultRemediation: rec('rresult', undefined),
    ...over,
  } as RunnerClient & { calls: string[] };
}
const job = { id: 'j1', kind: 'discovery', mode: 'sim' as const, tenant_slug: 'muster-partial' };
const uuidJob = { ...job, id: '0b7d3c1e-5a2f-4c8e-9d1a-2b3c4d5e6f70' };

describe('pollOnce — discovery lane', () => {
  it('claims, executes and posts a succeeded result', async () => {
    const posted: unknown[] = [];
    const api = fakeApi({ discoveryQueue: async () => [job], resultDiscovery: async (_e, _j, b) => { posted.push(b); } });
    const s = await pollOnce(api, { runner: 'win-1', discovery: async () => ({ outcome: 'succeeded', envelope: { x: 1 }, stats: { ran: 3 }, captures: [] }) });
    expect(s.discovery).toEqual({ seen: 1, done: 1, failed: 0, skipped: 0 });
    expect(api.calls).toContain('dclaim e1 j1 win-1');
    expect(posted[0]).toMatchObject({ runner: 'win-1', outcome: 'succeeded', envelope: { x: 1 } });
  });
  it('an executor that throws becomes a failed result (job never stays running)', async () => {
    const posted: unknown[] = [];
    const api = fakeApi({ discoveryQueue: async () => [job], resultDiscovery: async (_e, _j, b) => { posted.push(b); } });
    const s = await pollOnce(api, { runner: 'win-1', discovery: async () => { throw new Error('powershell missing'); } });
    expect(s.discovery.failed).toBe(1);
    expect(posted[0]).toMatchObject({ outcome: 'failed', error: 'powershell missing' });
  });
  it('a lost claim race (409) is skipped, not fatal', async () => {
    const api = fakeApi({ discoveryQueue: async () => [job, { ...job, id: 'j2' }], claimDiscovery: async (_e, j) => { if (j === 'j1') throw new ApiError(409, 'JOB_NOT_QUEUED', 'taken'); } });
    const exec = vi.fn(async () => ({ outcome: 'succeeded' as const, envelope: {}, captures: [] }));
    const s = await pollOnce(api, { runner: 'r', discovery: exec });
    expect(s.discovery).toEqual({ seen: 2, done: 1, failed: 0, skipped: 1 });
    expect(exec).toHaveBeenCalledTimes(1);
  });
  it('other API errors are counted and logged, not swallowed', async () => {
    const lines: string[] = [];
    const api = fakeApi({ discoveryQueue: async () => [job], claimDiscovery: async () => { throw new ApiError(403, 'ROLE_MATRIX', 'nope'); } });
    const s = await pollOnce(api, { runner: 'r', discovery: async () => ({ outcome: 'succeeded', captures: [] }), log: (l) => lines.push(l) });
    expect(s.errors).toBe(1);
    expect(lines.join('\n')).toContain('nope');
  });
  it('live jobs are never claimed', async () => {
    const live = { ...job, id: 'jl', mode: 'live' as const };
    const api = fakeApi({ discoveryQueue: async () => [live] });
    const exec = vi.fn(async () => ({ outcome: 'succeeded' as const, captures: [] }));
    const s = await pollOnce(api, { runner: 'r', discovery: exec });
    expect(s.discovery.skipped).toBe(1);
    expect(exec).not.toHaveBeenCalled();
    expect(api.calls.some((c) => c.startsWith('dclaim'))).toBe(false);
  });
  it('a rejected result POST (413/422) is followed by a minimal failed result so the job closes', async () => {
    const posted: { outcome: string; captures: unknown[] }[] = [];
    const api = fakeApi({ discoveryQueue: async () => [job], resultDiscovery: async (_e, _j, b) => { posted.push(b); if (posted.length === 1) throw new ApiError(413, undefined, 'too large'); } });
    const s = await pollOnce(api, { runner: 'r', discovery: async () => ({ outcome: 'succeeded', envelope: {}, captures: [{ ref: 'x', content: 'y', encoding: 'utf8', requirement_ids: [] }] }) });
    expect(posted.map((p) => p.outcome)).toEqual(['succeeded', 'failed']);
    expect(posted[1].captures).toEqual([]);
    expect(s.discovery.failed).toBe(1);
  });
  it('one engagement failing does not stop the others', async () => {
    const api = fakeApi({ engagements: async () => [{ id: 'bad' }, { id: 'good' }], discoveryQueue: async (e) => { if (e === 'bad') throw new ApiError(500, undefined, 'boom'); return [job]; } });
    const s = await pollOnce(api, { runner: 'r', discovery: async () => ({ outcome: 'succeeded', envelope: {}, captures: [] }) });
    expect(s.errors).toBe(1);
    expect(s.discovery.done).toBe(1);
  });
});

describe('pollOnce — remediation lane', () => {
  const run = { id: 'r1', module: 'stamper' as const, entry_ids: ['AC.L2-3.1.1.x'], op_id: null, parameters: {}, requirement_id: 'AC.L2-3.1.1', action_id: null };
  it('is not polled when no executor is configured', async () => {
    const api = fakeApi({ remediationQueue: async () => [run] });
    const s = await pollOnce(api, { runner: 'r', discovery: async () => ({ outcome: 'succeeded', captures: [] }) });
    expect(s.remediation.seen).toBe(0);
    expect(api.calls.some((c) => c.startsWith('rq'))).toBe(false);
  });
  it('claims, executes and posts when configured; executor errors become failed results', async () => {
    const posted: unknown[] = [];
    const api = fakeApi({ remediationQueue: async () => [run, { ...run, id: 'r2' }], resultRemediation: async (_e, _r, b) => { posted.push(b); } });
    const s = await pollOnce(api, { runner: 'r', discovery: async () => ({ outcome: 'succeeded', captures: [] }), remediation: async (x) => { if (x.id === 'r2') throw new Error('kit missing'); return { outcome: 'succeeded', summary: 'ran 1 entry', steps: [{ step: 1, outcome: 'ok' }], captures: [] }; } });
    expect(s.remediation).toEqual({ seen: 2, done: 1, failed: 1, skipped: 0 });
    expect(posted[1]).toMatchObject({ outcome: 'failed', summary: expect.stringContaining('kit missing') });
  });
});

describe('collectCaptures', () => {
  const files: Record<string, Buffer> = { '/w/j1/captures/a.json': Buffer.from('{"a":1}'), '/w/j1/captures/b.txt': Buffer.from('b') };
  const read = (p: string) => { const b = files[p.replace(/\\/g, '/')]; if (!b) throw new Error('ENOENT'); return b; };
  const size = (p: string) => read(p).length;
  const envelope = { observations: [
    { control_id: 'AC.L2-3.1.1', objective_ids: ['AC.L2-3.1.1[a]'], ran_entry_ids: ['e1'], raw_capture_ref: 'captures/a.json' },
    { control_id: 'AC.L2-3.1.2', raw_capture_ref: 'captures/a.json' },
    { control_id: 'AC.L2-3.1.3', raw_capture_ref: 'captures/b.txt' },
    { control_id: 'AC.L2-3.1.4', raw_capture_ref: 'captures/missing.txt' },
    { control_id: 'AC.L2-3.1.5', raw_capture_ref: '../../etc/passwd' },
    { control_id: 'AC.L2-3.1.6' },
  ] };
  it('one capture per ref, base64, merged ids; missing and escaping refs counted, not posted', () => {
    const r = collectCaptures('/w/j1', envelope, read, size);
    expect(r.captures.map((c) => c.ref)).toEqual(['captures/a.json', 'captures/b.txt']);
    expect(r.captures[0]).toMatchObject({ encoding: 'base64', entry_id: 'e1', requirement_ids: ['AC.L2-3.1.1', 'AC.L2-3.1.2'], objective_ids: ['AC.L2-3.1.1[a]'] });
    expect(Buffer.from(r.captures[0].content, 'base64').toString()).toBe('{"a":1}');
    expect(r.missing).toBe(2);
    expect(r.oversize).toBe(0);
    expect(r.cut).toBe(0);
  });
  it('stops at 50 captures and counts the rest as cut', () => {
    const many = { observations: Array.from({ length: 60 }, (_, i) => ({ control_id: `c${i}`, raw_capture_ref: `captures/${i}.txt` })) };
    const r = collectCaptures('/w/j1', many, () => Buffer.from('x'), () => 1);
    expect(r.captures.length).toBe(50);
    expect(r.cut).toBe(10);
  });
  it('oversize files are skipped', () => {
    const r = collectCaptures('/w/j1', envelope, read, (p) => { read(p); return 3 * 1024 * 1024; });
    expect(r.captures).toEqual([]);
    expect(r.oversize).toBe(2);
  });
});

describe('simDiscoveryExecutor', () => {
  it('maps engine failures and the all-failed walk to failed results', async () => {
    const ex = simDiscoveryExecutor('/w', (async () => ({ ok: false, code: 'sim_unreachable', message: 'no sim' })) as never, () => {});
    expect(await ex(uuidJob, { engagementId: 'e1' })).toMatchObject({ outcome: 'failed', error: 'sim_unreachable: no sim' });
    const ex2 = simDiscoveryExecutor('/w', (async () => ({ ok: true, envelope: { observations: [] }, stats: { ran: 5, failed: 5 }, postures: { met: 0, unknown: 0, not_met: 0 } })) as never, () => {});
    expect(await ex2(uuidJob, { engagementId: 'e1' })).toMatchObject({ outcome: 'failed', error: expect.stringContaining('engine_unavailable') });
  });
  it('refuses live jobs', async () => {
    const run = vi.fn();
    const ex = simDiscoveryExecutor('/w', run as never);
    expect(await ex({ ...job, mode: 'live' }, { engagementId: 'e1' })).toMatchObject({ outcome: 'failed' });
    expect(run).not.toHaveBeenCalled();
  });
  it('posts the envelope with capture stats on success and cleans the work dir', async () => {
    const cleaned: string[] = [];
    const ex = simDiscoveryExecutor('/w', (async () => ({ ok: true, envelope: { observations: [{ control_id: 'x' }] }, stats: { ran: 2, failed: 0 }, postures: { met: 1, unknown: 0, not_met: 0 } })) as never, (d) => cleaned.push(d));
    const r = await ex(uuidJob, { engagementId: 'e1' });
    expect(r).toMatchObject({ outcome: 'succeeded', stats: { ran: 2, captures_posted: 0 }, captures: [] });
    expect(cleaned[0].replace(/\\/g, '/')).toBe('/w/' + uuidJob.id);
  });
  it('refuses a job id that is not a UUID (it becomes a path segment)', async () => {
    const run = vi.fn();
    expect(await simDiscoveryExecutor('/w', run as never)({ ...job, id: '../x' }, { engagementId: 'e1' })).toMatchObject({ outcome: 'failed' });
    expect(run).not.toHaveBeenCalled();
  });
});

describe('client', () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => ({ token: 't0k', id: 'x' }) }; }) as unknown as typeof fetch;
  it('login posts to /auth/login beside /api and returns the token', async () => {
    expect(await login('http://h:4000/api', 'runner@contoso.local', 'pw', f)).toBe('t0k');
    expect(calls[0].url).toBe('http://h:4000/auth/login');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ email: 'runner@contoso.local', password: 'pw' });
  });
  it('hits the documented runner paths with the bearer token', async () => {
    const c = createClient('http://h:4000/api', 't0k', f);
    await c.discoveryQueue('e1'); await c.claimDiscovery('e1', 'j1', 'r'); await c.resultDiscovery('e1', 'j1', { runner: 'r', outcome: 'failed', captures: [] });
    await c.remediationQueue('e1'); await c.claimRemediation('e1', 'r1', 'r'); await c.resultRemediation('e1', 'r1', { runner: 'r', outcome: 'failed', summary: 'x', steps: [], captures: [] });
    expect(calls.slice(1).map((x) => `${x.init.method} ${x.url.replace('http://h:4000/api', '')}`)).toEqual([
      'GET /engagements/e1/assessments/runner/queue', 'POST /engagements/e1/assessments/jobs/j1/claim', 'POST /engagements/e1/assessments/jobs/j1/result',
      'GET /engagements/e1/remediation/runner/queue', 'POST /engagements/e1/remediation/runs/r1/claim', 'POST /engagements/e1/remediation/runs/r1/result',
    ]);
    expect((calls[1].init.headers as Record<string, string>).authorization).toBe('Bearer t0k');
  });
  it('re-logs in once on 401 when a token source is given; static token fails', async () => {
    let n = 0;
    const f401 = (async (_u: string, init: RequestInit) => { n += 1; const ok = (init.headers as Record<string, string>).authorization === 'Bearer fresh'; return { ok, status: ok ? 200 : 401, json: async () => (ok ? [] : { code: 'UNAUTHORIZED' }) }; }) as unknown as typeof fetch;
    const src = vi.fn(async () => (src.mock.calls.length > 1 ? 'fresh' : 'stale'));
    expect(await createClient('http://h/api', src, f401).engagements()).toEqual([]);
    expect(src).toHaveBeenCalledTimes(2);
    expect(n).toBe(2);
    await expect(createClient('http://h/api', 'stale', f401).engagements()).rejects.toMatchObject({ status: 401 });
  });
  it('rejects a login that demands a password change', async () => {
    const f2 = (async () => ({ ok: true, status: 200, json: async () => ({ token: 't', must_change_password: true }) })) as unknown as typeof fetch;
    await expect(login('http://h/api', 'a@b', 'p', f2)).rejects.toMatchObject({ code: 'MUST_CHANGE_PASSWORD' });
  });
  it('non-2xx becomes ApiError with the API code', async () => {
    const f2 = (async () => ({ ok: false, status: 409, json: async () => ({ error: 'taken', code: 'JOB_NOT_QUEUED' }) })) as unknown as typeof fetch;
    await expect(createClient('http://h/api', 't', f2).claimDiscovery('e', 'j', 'r')).rejects.toMatchObject({ status: 409, code: 'JOB_NOT_QUEUED' });
  });
});

describe('remediation command seam', () => {
  it('sanitizeRemediationOutput clamps to the API schema', () => {
    const r = sanitizeRemediationOutput({ outcome: 'succeeded', summary: 'x'.repeat(5000), steps: [{ step: 0, outcome: 'weird', label: 'L'.repeat(400) }, { outcome: 'held' }], captures: [{ ref: 'a', content: 'b' }, { ref: 'bad' }], execution_results: { m: 1 } });
    expect(r.summary.length).toBe(4000);
    expect(r.steps).toEqual([{ step: 1, outcome: 'failed', label: 'L'.repeat(300), entry_id: undefined, op_id: undefined, detail: undefined, duration_ms: undefined }, { step: 2, outcome: 'held', entry_id: undefined, op_id: undefined, label: undefined, detail: undefined, duration_ms: undefined }]);
    expect(r.captures).toEqual([{ ref: 'a', content: 'b', encoding: 'utf8', content_type: undefined, entry_id: undefined, requirement_ids: [] }]);
    expect(r.execution_results).toEqual({ m: 1 });
    expect(sanitizeRemediationOutput({ outcome: 'failed' }).summary).toBe('failed (no summary from command)');
    expect(() => sanitizeRemediationOutput({ outcome: 'maybe' })).toThrow();
  });
  const run = { id: 'r1', module: 'stamper' as const, entry_ids: ['e'], op_id: null, parameters: { a: 1 }, requirement_id: null, action_id: null };
  it('runs the command with the run on stdin, parses stdout, and hides CES_RUNNER_* from the child', async () => {
    process.env.CES_RUNNER_PASSWORD = 'secret';
    const ex = shellRemediationExecutor(process.execPath, ['-e', "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const i=JSON.parse(d);console.log(JSON.stringify({outcome:'succeeded',summary:'got '+i.run.id+' env='+(process.env.CES_RUNNER_PASSWORD??'none'),steps:[{step:1,outcome:'ok'}]}))})"]);
    delete process.env.CES_RUNNER_PASSWORD;
    expect(await ex(run, { engagementId: 'e1' })).toMatchObject({ outcome: 'succeeded', summary: 'got r1 env=none', steps: [{ step: 1, outcome: 'ok' }] });
  });
  it('non-JSON output, a failing command and an early exit all become failed results', async () => {
    expect(await shellRemediationExecutor(process.execPath, ['-e', "console.log('nope')"])(run, { engagementId: 'e1' })).toMatchObject({ outcome: 'failed', summary: expect.stringContaining('unusable output') });
    expect(await shellRemediationExecutor(process.execPath, ['-e', "process.exit(3)"])(run, { engagementId: 'e1' })).toMatchObject({ outcome: 'failed', summary: expect.stringContaining('command failed') });
    expect(await shellRemediationExecutor('/definitely/not/a/command')(run, { engagementId: 'e1' })).toMatchObject({ outcome: 'failed' });
  });
});
