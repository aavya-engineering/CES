# REQ: ces-tenant: a public, side-effect-free "is this slug registered?" lookup

**Filed by:** ces-muster (MU-FR-16 Step 1, 2026-10-23)
**Target module:** ces-tenant
**Priority:** P2 (Muster works around it with a local mirror; the mirror can drift)

## Finding
muster-api must refuse a plan push to a slug that is not in the ces-tenant registry (PRD v5 MU-FR-16).
The only public lookup is `FileTenantRegistry.get(slug)`, which:

1. resolves secret references while parsing (`auth.cert_thumbprint`, `evidence_storage.account_key`,
   fail closed) — so muster-api would load another module's credentials, and a push would fail whenever
   muster-api's environment cannot resolve Stamper's secret references; and
2. migrates legacy records forward (`migrateForward` writes `<registry>/<kind>/<slug>.json`) — so a push
   would write into the registry.

Neither is appropriate for an existence check on a request path.

## Ask
Export a read-only lookup, for example:

```ts
describe(slug: string): Promise<
  | { status: 'registered'; slug: string; kind: TenantKind; tenantId: string; domain?: string;
      source: 'registry' | 'plan-data' | 'legacy' }
  | { status: 'not_registered' }
  | { status: 'invalid'; reason: string }   // A9 collision, mis-kinded, unreadable, no tenant id
>
```

with the same read order as `get()`, no secret resolution and no writes.

## What Muster does meanwhile
`muster-api/src/lib/tenantRegistryGate.ts` mirrors `get()`'s read order and its collision and kind rules,
reads only non-secret fields, and writes nothing (tests: `muster-api/tests/plan.registryGate.test.ts`).
It uses ces-tenant's exported `getRegistryRoot` and `registryRecordPath`. Replace it with `describe()` when
this REQ lands.
