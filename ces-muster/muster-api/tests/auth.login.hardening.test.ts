// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// UI-01: POST /auth/login hardening.
//  1. An unknown email and a wrong password get the same 401 body, and both run
//     a bcrypt compare (no account enumeration by body or timing).
//  2. Repeated failures for one account are refused with 429 + Retry-After
//     (NIST SP 800-171 3.1.8), a success clears the counter, and the window ends.
import { describe, test, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';

const OPERATOR = {
  id: 'user-ui01',
  email: 'operator@ui01.test',
  tenant_id: '00000000-0000-0000-0000-0000000000a1',
  party_id: null,
  role: 'bhd_operator',
  password_hash: '',
};
const PASSWORD = randomBytes(12).toString('hex');

vi.mock('../src/lib/prisma.js', () => ({
  db: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) =>
        where.email === OPERATOR.email ? OPERATOR : null
      ),
    },
  },
  withTenant: vi.fn(),
}));

const { createApp } = await import('../src/app.js');
const attempts = await import('../src/lib/loginAttempts.js');

let server: http.Server;
let base: string;

beforeAll(async () => {
  OPERATOR.password_hash = await bcrypt.hash(PASSWORD, 4);
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => server?.close());
beforeEach(() => {
  attempts.resetLoginAttempts();
  vi.useRealTimers();
});

function login(email: string, password: string) {
  return fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

describe('UI-01: no account enumeration', () => {
  test('unknown email and wrong password return the same 401 body', async () => {
    const unknown = await login('nobody@ui01.test', 'whatever-password');
    const wrong = await login(OPERATOR.email, `${PASSWORD}x`);
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(await unknown.json()).toEqual(await wrong.json());
  });

  test('an unknown email still runs a bcrypt compare', async () => {
    const spy = vi.spyOn(bcrypt, 'compare');
    await login('nobody2@ui01.test', 'whatever-password');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test('right password still signs in', async () => {
    const res = await login(OPERATOR.email, PASSWORD);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token?: string };
    expect(typeof body.token).toBe('string');
  });
});

describe('UI-01: limit unsuccessful logon attempts', () => {
  test(`after ${attempts.MAX_FAILURES_PER_ACCOUNT} failures the account gets 429 + Retry-After, even with the right password`, async () => {
    for (let i = 0; i < attempts.MAX_FAILURES_PER_ACCOUNT; i++) {
      expect((await login(OPERATOR.email, 'wrong-password')).status).toBe(401);
    }
    const locked = await login(OPERATOR.email, PASSWORD);
    expect(locked.status).toBe(429);
    const retry = Number(locked.headers.get('retry-after'));
    expect(retry).toBeGreaterThan(0);
    expect(retry).toBeLessThanOrEqual(Math.ceil(attempts.WINDOW_MS / 1000));
    // No token in a refused answer.
    expect(await locked.json()).not.toHaveProperty('token');
  });

  test('the account key ignores case and surrounding spaces', async () => {
    for (let i = 0; i < attempts.MAX_FAILURES_PER_ACCOUNT; i++) {
      await login(i % 2 ? OPERATOR.email.toUpperCase() : OPERATOR.email, 'wrong-password');
    }
    expect(attempts.retryAfterSeconds(` ${OPERATOR.email.toUpperCase()} `, 'other-client')).toBeGreaterThan(0);
  });

  test('a success before the limit clears the account counter', async () => {
    for (let i = 0; i < attempts.MAX_FAILURES_PER_ACCOUNT - 1; i++) {
      await login(OPERATOR.email, 'wrong-password');
    }
    expect((await login(OPERATOR.email, PASSWORD)).status).toBe(200);
    for (let i = 0; i < attempts.MAX_FAILURES_PER_ACCOUNT - 1; i++) {
      expect((await login(OPERATOR.email, 'wrong-password')).status).toBe(401);
    }
    expect((await login(OPERATOR.email, PASSWORD)).status).toBe(200);
  });

  test('the lock ends when the window has passed', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < attempts.MAX_FAILURES_PER_ACCOUNT; i++) {
      attempts.recordFailure(OPERATOR.email, 'c1', t0);
    }
    expect(attempts.retryAfterSeconds(OPERATOR.email, 'c1', t0 + 1)).toBeGreaterThan(0);
    expect(attempts.retryAfterSeconds(OPERATOR.email, 'c1', t0 + attempts.WINDOW_MS)).toBe(0);
  });

  test('one client spraying many accounts is limited too', () => {
    const t0 = 2_000_000;
    for (let i = 0; i < attempts.MAX_FAILURES_PER_CLIENT; i++) {
      attempts.recordFailure(`user${i}@ui01.test`, 'sprayer', t0);
    }
    expect(attempts.retryAfterSeconds('fresh@ui01.test', 'sprayer', t0 + 1)).toBeGreaterThan(0);
    expect(attempts.retryAfterSeconds('fresh@ui01.test', 'someone-else', t0 + 1)).toBe(0);
  });
});
