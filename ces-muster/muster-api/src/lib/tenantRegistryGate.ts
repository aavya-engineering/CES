// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// tenantRegistryGate.ts — PRD v5 MU-FR-16 (Must): "Muster shall push a plan
// bundle to Stamper only for a tenant that exists in the ces-tenant registry,
// and shall refuse any other push with a named error."
//
// Answers one question — is this slug a registered Microsoft tenant, and of
// which kind (live | sim)? — WITHOUT side effects:
//
//   * Same read order as ces-tenant FileTenantRegistry.get():
//       (a) registry root (CES_TENANT_ROOT, else ~/.ces/tenants), live/ and sim/
//           namespaces — a slug in BOTH is the A9 collision → invalid;
//           a record whose `kind` disagrees with its namespace → invalid;
//       (b) Stamper plan-data `<plan-data>/<slug>/<slug>.json` (where
//           `stacksim init-tenant --emit-plan-data` writes sim tenants);
//       (c) legacy ~/.stamper/tenants/<slug>.json, then <slug>/<slug>.json.
//   * Kind of a record without `kind` follows ces-tenant detectKind():
//     tenant.environment === 'gcc-high-sim' → sim, otherwise live.
//   * Unlike FileTenantRegistry.get() it does NOT resolve secret references
//     (cert thumbprint, evidence-storage key) — muster-api must not load another
//     module's credentials just to check existence — and does NOT migrate
//     legacy records forward (a push must not write into the registry).
//     REQ-ces-tenant-side-effect-free-lookup.md asks ces-tenant for a public
//     equivalent; switch to it when it lands.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getRegistryRoot, registryRecordPath } from 'ces-tenant';
import { getStamperTenantRoot } from '../vendored/ces-shared/storage/node.js';

export type RegistryTenantKind = 'live' | 'sim';

export interface RegisteredTenant {
  slug: string;
  kind: RegistryTenantKind;
  /** Entra directory (tenant) id from the record's tenant.tenant_id. */
  tenantId: string;
  domain?: string;
  source: 'registry' | 'plan-data' | 'legacy';
}

export type RegistryLookup =
  | { status: 'registered'; tenant: RegisteredTenant }
  | { status: 'not_registered' }
  | { status: 'invalid'; reason: string };

export interface RegistryLookupOptions {
  /** Registry root. Default: CES_TENANT_ROOT, else ~/.ces/tenants (ces-tenant getRegistryRoot). */
  registryRoot?: string;
  /** Stamper tenant folder for a slug. Default: the same folder the push writes plans under. */
  stamperTenantRoot?: (slug: string) => string;
  /** Home directory for the legacy ~/.stamper lookup. Default: os.homedir(). */
  homeDir?: string;
}

type RawRecord = Record<string, unknown> & {
  kind?: unknown;
  tenant?: { tenant_id?: unknown; domain?: unknown; environment?: unknown };
};

function readRecord(file: string): RawRecord | { unreadable: string } {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { unreadable: 'record is not a JSON object' };
    }
    return parsed as RawRecord;
  } catch (err) {
    return { unreadable: (err as Error).message };
  }
}

function detectKind(raw: RawRecord): RegistryTenantKind {
  if (raw.kind === 'live' || raw.kind === 'sim') return raw.kind;
  return raw.tenant?.environment === 'gcc-high-sim' ? 'sim' : 'live';
}

function toLookup(
  slug: string,
  file: string,
  source: RegisteredTenant['source'],
  namespaceKind?: RegistryTenantKind,
): RegistryLookup {
  const raw = readRecord(file);
  if ('unreadable' in raw) {
    return { status: 'invalid', reason: `unreadable tenant record ${file}: ${raw.unreadable}` };
  }
  if (namespaceKind && raw.kind !== namespaceKind) {
    return {
      status: 'invalid',
      reason: `record in the ${namespaceKind} namespace has kind=${JSON.stringify(raw.kind)}`,
    };
  }
  const tenantId = raw.tenant?.tenant_id;
  if (typeof tenantId !== 'string' || tenantId.trim() === '') {
    return { status: 'invalid', reason: `tenant record ${file} has no tenant.tenant_id` };
  }
  const domain = typeof raw.tenant?.domain === 'string' ? raw.tenant.domain : undefined;
  return {
    status: 'registered',
    tenant: {
      slug,
      kind: namespaceKind ?? detectKind(raw),
      tenantId,
      ...(domain ? { domain } : {}),
      source,
    },
  };
}

/** Side-effect-free registry lookup for a (format-validated) tenant slug. */
export function lookupRegisteredTenant(slug: string, options: RegistryLookupOptions = {}): RegistryLookup {
  const registryRoot = options.registryRoot ?? getRegistryRoot(process.env);
  const stamperTenantRoot = options.stamperTenantRoot ?? getStamperTenantRoot;
  const homeDir = options.homeDir ?? os.homedir();

  // (a) Registry root, both namespaces.
  const livePath = registryRecordPath(registryRoot, 'live', slug);
  const simPath = registryRecordPath(registryRoot, 'sim', slug);
  const inLive = fs.existsSync(livePath);
  const inSim = fs.existsSync(simPath);
  if (inLive && inSim) {
    return { status: 'invalid', reason: `slug "${slug}" is in BOTH live and sim namespaces (A9 collision)` };
  }
  if (inLive) return toLookup(slug, livePath, 'registry', 'live');
  if (inSim) return toLookup(slug, simPath, 'registry', 'sim');

  // (b) Stamper plan-data tenant object.
  const planDataPath = path.join(stamperTenantRoot(slug), `${slug}.json`);
  if (fs.existsSync(planDataPath)) return toLookup(slug, planDataPath, 'plan-data');

  // (c) Legacy ~/.stamper/tenants — flat, then nested.
  const flat = path.join(homeDir, '.stamper', 'tenants', `${slug}.json`);
  if (fs.existsSync(flat)) return toLookup(slug, flat, 'legacy');
  const nested = path.join(homeDir, '.stamper', 'tenants', slug, `${slug}.json`);
  if (fs.existsSync(nested)) return toLookup(slug, nested, 'legacy');

  return { status: 'not_registered' };
}
