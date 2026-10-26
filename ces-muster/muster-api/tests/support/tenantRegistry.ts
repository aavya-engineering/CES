// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// Test tenant registry (MU-FR-16). The push route now refuses any slug that is
// not in the ces-tenant registry, so the suite gets its own temporary registry
// root (CES_TENANT_ROOT) — never the developer's ~/.ces/tenants — holding a
// synthetic sim record for every slug the existing tests push to.
//
// A new test that pushes to a new slug either adds it to SUITE_TENANT_SLUGS or
// calls registerTestTenant() itself. A push to an unregistered slug answers
// 404 TENANT_NOT_AVAILABLE.
import * as fs from 'node:fs';
import * as path from 'node:path';

export const SUITE_TENANT_SLUGS = [
  'acme',
  'customer-live',
  'fcmu-ms1',
  'fcmu-ms3-tenant',
  'fx2mu1-tenant-a',
  'fx2mu1-tenant-b',
  'fxmu1-noauth',
  'fxmu1-tenant',
  'fxmu2-sim',
  'fxmu4-click',
  'fxmu4-tenant',
  'live-loop-sim',
  'stacksim-local',
  'vfs-gcc-high',
  'w4-hermetic',
  'w4-mu1-bad-infra',
  'w4-mu1-infra',
  'w4-mu1-str',
  'w4mu1-product',
  'x',
] as const;

/** Write a minimal synthetic registry record (no credentials of any value). */
export function registerTestTenant(
  registryRoot: string,
  slug: string,
  kind: 'live' | 'sim' = 'sim',
  tenantId = '00000000-0000-4000-8000-000000000000',
): string {
  const dir = path.join(registryRoot, kind);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${slug}.json`);
  const record = {
    kind,
    client: { slug, name: `Test tenant ${slug}` },
    tenant: {
      tenant_id: tenantId,
      domain: `${slug}.example`,
      ...(kind === 'sim' ? { environment: 'gcc-high-sim' } : {}),
    },
    auth: { app_id: 'test-app', cert_path: 'test-cert', cert_thumbprint: 'TEST' },
  };
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n', 'utf-8');
  return file;
}
