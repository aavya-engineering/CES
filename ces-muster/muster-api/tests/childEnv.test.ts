// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

import { describe, expect, it } from 'vitest';
import { childEnv } from '../src/lib/childEnv.js';

describe('childEnv — API secrets never reach child processes (doc 49 H2)', () => {
  it('drops secret-shaped keys, keeps the rest and explicit keeps', () => {
    const env = childEnv({ PATH: '/bin', JWT_SECRET: 'x', DATABASE_URL: 'postgres://', ANTHROPIC_API_KEY: 'k', CES_RUNNER_PASSWORD: 'p', SMTP_PASSWORD: 'q', GRAPH_CLIENT_SECRET: 's', MUSTER_LIVE_GRAPH_TOKEN: 't', PSModulePath: 'm', STACKSIM_SERVER_URL: 'u' }, ['MUSTER_LIVE_GRAPH_TOKEN']);
    expect(Object.keys(env).sort()).toEqual(['MUSTER_LIVE_GRAPH_TOKEN', 'PATH', 'PSModulePath', 'STACKSIM_SERVER_URL']);
  });
});
