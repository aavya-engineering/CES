// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// DEP-01: MUSTER_TRUST_PROXY makes req.ip the browser address behind nginx;
// unset, X-Forwarded-For is ignored.
import { describe, test, expect, vi, afterEach } from 'vitest';

vi.mock('../src/lib/prisma.js', () => ({ db: {}, withTenant: vi.fn() }));
const { createApp } = await import('../src/app.js');

describe('trust proxy', () => {
  afterEach(() => {
    delete process.env.MUSTER_TRUST_PROXY;
  });
  test('off by default', () => {
    expect(createApp().get('trust proxy')).toBeFalsy();
  });
  test('MUSTER_TRUST_PROXY=1 trusts one proxy hop', () => {
    process.env.MUSTER_TRUST_PROXY = '1';
    expect(createApp().get('trust proxy')).toBe(1);
  });
});
