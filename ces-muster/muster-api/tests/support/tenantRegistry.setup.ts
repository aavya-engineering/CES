// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// vitest setupFiles entry: a throwaway ces-tenant registry per test file.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll } from 'vitest';
import { SUITE_TENANT_SLUGS, registerTestTenant } from './tenantRegistry';

const registryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'muster-test-tenant-registry-'));
process.env.CES_TENANT_ROOT = registryRoot;
for (const slug of SUITE_TENANT_SLUGS) registerTestTenant(registryRoot, slug);

afterAll(() => {
  fs.rmSync(registryRoot, { recursive: true, force: true });
});
