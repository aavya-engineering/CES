// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// seed-ces-shared.ts — S1.1: load the CES-Shared seed into the database.
// Run once after "npm run migrate:deploy" (safe to re-run).
//   npx tsx scripts/seed-ces-shared.ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { seedCesShared } from '../src/cesShared/seed.js';
import type { SharedDb } from '../src/cesShared/service.js';

const db = new PrismaClient();
seedCesShared(db as unknown as SharedDb)
  .then((r) => console.log(`CES-Shared seed: ${r.created} created, ${r.skipped} already present`))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
