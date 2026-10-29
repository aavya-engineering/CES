// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// Sprint 2 LOG-01/02, OPS-01: logger configuration, secret redaction, request
// ids and the health endpoints.
import { describe, it, expect, afterAll } from 'vitest';
import express from 'express';
import pino from 'pino';
import type { AddressInfo } from 'node:net';
import { loggerOptions, resolveLogFormat, resolveLogLevel } from '../src/lib/logger.js';
import { requestLog } from '../src/middleware/requestLog.js';
import { createHealthRouter } from '../src/routes/health.js';

describe('logger configuration', () => {
  it('defaults: debug/pretty in development, info/json elsewhere, silent under vitest', () => {
    expect(resolveLogLevel({ CES_ENV: 'development' })).toBe('debug');
    expect(resolveLogFormat({ CES_ENV: 'development' })).toBe('pretty');
    expect(resolveLogLevel({ CES_ENV: 'production' })).toBe('info');
    expect(resolveLogFormat({ CES_ENV: 'staging' })).toBe('json');
    expect(resolveLogLevel({ VITEST: '1' })).toBe('silent');
    expect(resolveLogLevel({ VITEST: '1', LOG_LEVEL: 'warn' })).toBe('warn');
  });

  it('redacts passwords, tokens, authorization headers and connection strings', () => {
    const lines: string[] = [];
    const dest = { write: (s: string) => void lines.push(s) };
    const opts = loggerOptions({ CES_ENV: 'production', LOG_LEVEL: 'info' });
    const log = pino(opts, dest as unknown as pino.DestinationStream);
    log.info(
      {
        password: 'hunter2',
        token: 'abc',
        req: { headers: { authorization: 'Bearer xyz', cookie: 'a=b' } },
        DATABASE_URL: 'postgresql://muster_app:pw@db/muster_db',
        user: { email: 'vaibhav.pathak@aavya.com', password_hash: '$2a$…' },
      },
      'probe'
    );
    const line = lines.join('');
    expect(line).not.toContain('hunter2');
    expect(line).not.toContain('Bearer xyz');
    expect(line).not.toContain('a=b');
    expect(line).not.toContain('muster_app:pw');
    expect(line).not.toContain('$2a$');
    expect(line).toContain('[redacted]');
    expect(line).toContain('vaibhav.pathak@aavya.com'); // identity stays — accountability (AU-3.3.2)
    expect(JSON.parse(line)).toMatchObject({ level: 'info', service: 'muster-api', env: 'production', msg: 'probe' });
  });
});

describe('request log + health', () => {
  const lines: string[] = [];
  const log = pino({ level: 'debug' }, { write: (s: string) => void lines.push(s) } as unknown as pino.DestinationStream);
  const app = express();
  app.use(requestLog(log));
  let dbUp = true;
  const db = {
    $queryRaw: async () => {
      if (!dbUp) throw new Error('ECONNREFUSED');
      return [{ '?column?': 1 }];
    },
  };
  app.use(createHealthRouter(db, { CES_VERSION: 'v-test' }));
  app.get('/boom', () => {
    throw new Error('kaboom');
  });
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  afterAll(() => server.close());

  it('GET /healthz is 200 and carries a generated X-Request-Id', async () => {
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', version: 'v-test' });
    const id = res.headers.get('x-request-id');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const entry = JSON.parse(lines.at(-1)!);
    expect(entry).toMatchObject({ level: 20, requestId: id, method: 'GET', path: '/healthz', status: 200 }); // debug: quiet path
  });

  it('echoes a valid incoming X-Request-Id and ignores a hostile one', async () => {
    const ok = await fetch(`${base}/healthz`, { headers: { 'x-request-id': 'nginx-123.abc' } });
    expect(ok.headers.get('x-request-id')).toBe('nginx-123.abc');
    const bad = await fetch(`${base}/healthz`, { headers: { 'x-request-id': 'y<script>alert(1)</script> ' + 'z'.repeat(200) } });
    expect(bad.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('GET /readyz reflects the database', async () => {
    expect((await fetch(`${base}/readyz`)).status).toBe(200);
    dbUp = false;
    const res = await fetch(`${base}/readyz`);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: 'degraded', db: 'unreachable' });
    dbUp = true;
  });

  it('logs 5xx at error level without the body', async () => {
    const res = await fetch(`${base}/boom`, { method: 'GET' });
    expect(res.status).toBe(500);
    const entry = JSON.parse(lines.at(-1)!);
    expect(entry).toMatchObject({ level: 50, path: '/boom', status: 500 });
    expect(entry.body).toBeUndefined();
    expect(entry.headers).toBeUndefined();
  });
});
