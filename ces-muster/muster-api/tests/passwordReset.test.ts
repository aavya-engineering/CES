// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// S1.9 (decision D3): forgot / reset password — generic answer, single-use
// 30-minute link, hash-only storage, password rule, disabled accounts, limits.
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'node:http';
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createPasswordResetRouter, RESET_TTL_MS } from '../src/routes/passwordReset.js';
import type { MailMessage } from '../src/lib/mailer.js';

type Row = Record<string, unknown>;
const users: Row[] = [
  { id: 'u1', email: 'op@example.com', role: 'bhd_operator', tenant_id: 't', password_hash: 'old', disabled_at: null, must_change_password: true },
  { id: 'u2', email: 'gone@example.com', role: 'sub', tenant_id: 't', password_hash: 'old', disabled_at: new Date(), must_change_password: false },
];
const resets: Row[] = [];
const events: Row[] = [];
const match = (r: Row, w: Row) => Object.entries(w).every(([k, v]) => (v === null ? r[k] == null : r[k] === v));
const db = {
  user: {
    findUnique: async ({ where }: { where: Row }) => users.find((u) => match(u, where)) ?? null,
    update: async ({ where, data }: { where: Row; data: Row }) => Object.assign(users.find((u) => match(u, where))!, data),
  },
  passwordReset: {
    create: async ({ data }: { data: Row }) => (resets.push({ id: `r${resets.length}`, used_at: null, ...data }), resets[resets.length - 1]),
    findUnique: async ({ where }: { where: Row }) => resets.find((r) => match(r, where)) ?? null,
    update: async ({ where, data }: { where: Row; data: Row }) => Object.assign(resets.find((r) => match(r, where))!, data),
    updateMany: async ({ where, data }: { where: Row; data: Row }) => resets.filter((r) => match(r, where)).forEach((r) => Object.assign(r, data)),
  },
  auditEvent: { create: async ({ data }: { data: Row }) => events.push(data) },
  $transaction: async <T,>(fn: (tx: unknown) => Promise<T>) => fn(db),
};
const mail: MailMessage[] = [];
let clock = Date.parse('2026-10-27T10:00:00Z');
let server: http.Server;
let base: string;

const post = async (path: string, body: unknown) => {
  const res = await fetch(`${base}/auth${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};
const tokenFrom = (m: MailMessage) => /token=([A-Za-z0-9_-]+)/.exec(m.text)![1];

beforeAll(() => {
  const app = express();
  app.use(express.json());
  app.use('/auth', createPasswordResetRouter(db as never, async (m) => (mail.push(m), 'sent'), { publicUrl: 'https://ces.example.com', now: () => clock }));
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => server?.close());

describe('forgot / reset password', () => {
  test('same answer for known, unknown and disabled emails; only the known active one gets a mail', async () => {
    const a = await post('/forgot-password', { email: 'OP@example.com' });
    const b = await post('/forgot-password', { email: 'nobody@example.com' });
    const c = await post('/forgot-password', { email: 'gone@example.com' });
    expect([a.status, b.status, c.status]).toEqual([202, 202, 202]);
    expect(a.body).toEqual(b.body);
    expect(b.body).toEqual(c.body);
    expect(mail).toHaveLength(1);
    expect(mail[0].to).toBe('op@example.com');
    expect(mail[0].text).toContain('https://ces.example.com/#/reset-password?token=');
    const token = tokenFrom(mail[0]);
    expect(resets[0].token_hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(resets)).not.toContain(token);
  });

  test('the password rule applies; a good reset works once and clears must-change', async () => {
    const token = tokenFrom(mail[0]);
    expect((await post('/reset-password', { token, new_password: 'short' })).body.code).toBe('PASSWORD_RULE');
    const ok = await post('/reset-password', { token, new_password: 'correct-horse-battery' });
    expect(ok.status).toBe(200);
    expect(await bcrypt.compare('correct-horse-battery', String(users[0].password_hash))).toBe(true);
    expect(users[0].must_change_password).toBe(false);
    expect((await post('/reset-password', { token, new_password: 'another-long-password' })).body.code).toBe('RESET_INVALID');
    expect(events.map((e) => e.action)).toContain('auth.password_reset');
  });

  test('a link expires after 30 minutes; a new request cancels the older link', async () => {
    await post('/forgot-password', { email: 'op@example.com' });
    const first = tokenFrom(mail[mail.length - 1]);
    await post('/forgot-password', { email: 'op@example.com' });
    const second = tokenFrom(mail[mail.length - 1]);
    expect((await post('/reset-password', { token: first, new_password: 'yet-another-password' })).status).toBe(400);
    clock += RESET_TTL_MS + 1000;
    expect((await post('/reset-password', { token: second, new_password: 'yet-another-password' })).body.code).toBe('RESET_INVALID');
  });

  test('requests for one email are limited', async () => {
    for (let i = 0; i < 3; i++) await post('/forgot-password', { email: 'limit@example.com' });
    expect((await post('/forgot-password', { email: 'limit@example.com' })).status).toBe(429);
  });
});
