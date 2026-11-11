// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  // Dev convenience (2026-11-11): `/api` and `/auth` on the dev server proxy to muster-api,
  // so the portal can run same-origin (no CORS, works in browser panes that block
  // cross-origin localhost). Opt in per browser: localStorage 'muster-api-url' = '/api',
  // or build with VITE_MUSTER_API_URL=/api. Default stays http://localhost:4000/api.
  server: {
    proxy: Object.fromEntries(['/api', '/auth'].map((p) => [p, { target: process.env.MUSTER_API_PROXY ?? 'http://localhost:4000', changeOrigin: false }])),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/shared': path.resolve(__dirname, './src/shared'),
      '@/features': path.resolve(__dirname, './src/features'),
      '@/vendored': path.resolve(__dirname, './src/vendored'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/vitest.setup.ts'],
    environmentMatchGlobs: [['src/driver/**', 'node']],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**', 'muster-api/**', '**/.worktrees/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      thresholds: {
        lines: 47,
        statements: 47,
        functions: 67,
        branches: 74,
      },
    },
  },
});
