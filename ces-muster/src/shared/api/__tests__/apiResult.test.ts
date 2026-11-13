// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// QA round 3 (2026-11-13): a 204 delete is a success, and a 422 names its fields.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, issuesByField } from '../musterApi';

const respond = (status: number, body: string | null, headers: Record<string, string> = {}) =>
  vi.fn(async () => new Response(body, { status, headers: { 'Content-Type': 'application/json', ...headers } }));

describe('apiRequest', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('treats a 204 with no body as ok (delete used to read as "Not found" on the retry)', async () => {
    vi.stubGlobal('fetch', respond(204, null));
    const r = await apiRequest<void>('DELETE', '/organizations/x');
    expect(r.ok).toBe(true);
  });

  it('keeps the field details of a validation failure', async () => {
    vi.stubGlobal('fetch', respond(422, JSON.stringify({ error: 'Validation failed', code: 'VALIDATION_ERROR', part: 'body', details: [{ path: 'website', message: 'Invalid url' }] })));
    const r = await apiRequest('POST', '/organizations', {});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('Validation failed');
    expect(issuesByField(r)).toEqual({ website: 'Invalid url' });
  });

  it('folds a zod flatten() body (contracts) into the same details shape', async () => {
    vi.stubGlobal('fetch', respond(400, JSON.stringify({ error: { formErrors: [], fieldErrors: { engagement_id: ['Required'] } } })));
    const r = await apiRequest('POST', '/contracts', {});
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(issuesByField(r)).toEqual({ engagement_id: 'Required' });
  });
});
