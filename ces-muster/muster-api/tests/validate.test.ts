// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// Sprint 2 VAL-01: validate() answers 422 with the standard envelope and
// hands the parsed (defaulted, transformed) value to the handler.
import { describe, it, expect, afterAll } from 'vitest';
import express from 'express';
import { z } from 'zod';
import type { AddressInfo } from 'node:net';
import { validate } from '../src/middleware/validate.js';

const createSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  role: z.enum(['prime', 'sub']).default('sub'),
}).strict();
const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) });

const app = express();
app.use(express.json());
app.post('/x', validate(createSchema), (req, res) => res.status(201).json(req.body));
app.get('/x', validate(listQuery, 'query'), (req, res) => res.json(req.query));
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
afterAll(() => server.close());

describe('validate()', () => {
  it('passes the parsed body (transforms + defaults) to the handler', async () => {
    const res = await fetch(`${base}/x`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'Mark@Example.COM' }) });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ email: 'mark@example.com', role: 'sub' });
  });

  it('answers 422 with code, part and per-field details', async () => {
    const res = await fetch(`${base}/x`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'nope', role: 'admin', extra: 1 }) });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toMatchObject({ error: 'Validation failed', code: 'VALIDATION_ERROR', part: 'body' });
    expect(body.details.map((d: { path: string }) => d.path).sort()).toEqual(['(root)', 'email', 'role']);
  });

  it('validates and coerces the query string', async () => {
    expect(await (await fetch(`${base}/x`)).json()).toEqual({ limit: 50 });
    expect(await (await fetch(`${base}/x?limit=7`)).json()).toEqual({ limit: 7 });
    const bad = await fetch(`${base}/x?limit=1000`);
    expect(bad.status).toBe(422);
    expect((await bad.json()).part).toBe('query');
  });
});
