// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// DEP-01: where the portal sends API calls — a per-browser override, then the
// build-time VITE_MUSTER_API_URL (server deployment: '/api'), then localhost.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getApiBase } from '../musterApi';

describe('getApiBase', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    localStorage.removeItem('muster-api-url');
  });
  it('defaults to the developer API on localhost', () => {
    vi.stubEnv('VITE_MUSTER_API_URL', '');
    expect(getApiBase()).toBe('http://localhost:4000/api');
  });
  it('uses the build-time URL for a server deployment', () => {
    vi.stubEnv('VITE_MUSTER_API_URL', '/api');
    expect(getApiBase()).toBe('/api');
  });
  it('a per-browser override still wins', () => {
    vi.stubEnv('VITE_MUSTER_API_URL', '/api');
    localStorage.setItem('muster-api-url', 'http://10.0.0.5:4000/api');
    expect(getApiBase()).toBe('http://10.0.0.5:4000/api');
  });
});
