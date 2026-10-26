#!/usr/bin/env npx tsx
// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// MG-28 — write docs/question-register.md from src/features/interview/questionRegister.ts.
// Run: npm run register:generate

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const { buildQuestionRegister, renderRegisterMarkdown } = await import('../src/features/interview/questionRegister.ts');

const build = buildQuestionRegister();
if (build.missing.length || build.orphans.length) {
  console.error('Register is out of step with the question graph.');
  if (build.missing.length) console.error('  missing rows:', build.missing.join(', '));
  if (build.orphans.length) console.error('  stale rows:', build.orphans.join(', '));
  process.exit(1);
}
const out = path.join(ROOT, 'docs/question-register.md');
fs.writeFileSync(out, renderRegisterMarkdown(build), 'utf8');
console.log(`Wrote ${path.relative(ROOT, out)} (${build.rows.length} questions).`);
