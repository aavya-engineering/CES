// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173',
  },
  webServer: process.env.CES_E2E_LIVE ? undefined : {
    command: 'npm run build && npm run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /lifecycle-walk|screenshots/,
    },
    {
      // Lifecycle walk against the running local stack (API :4000 + Postgres + `npm run dev` on :5173).
      // `CES_E2E_LIVE=1 npm run test:e2e:live`; the spec skips itself without that flag. No webServer:
      // the dev server's /api proxy is what reaches muster-api.
      name: 'live',
      testMatch: /lifecycle-walk|screenshots/,
      use: { ...devices['Desktop Chrome'], baseURL: process.env.CES_E2E_BASE ?? 'http://localhost:5173' },
    },
  ],
});
