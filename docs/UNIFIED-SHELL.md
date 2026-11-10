# Unified lifecycle shell — Sprint 1 Foundation (16–27 Nov 2026)

Decision 2026-11-10 (Vaibhav): the unified CES UI is built in this repository on the Aavya portal
theme, with Postgres identity/RBAC, calling the BHD engine (ces-contractor) for Muster, Stamper,
AdminOps and EvidenceOps. BHD backend stays as is (walkthrough 2026-11-04).

## What this drop adds

| Area | Files | Notes |
|---|---|---|
| Navigation model | `ces-muster/src/features/portal/lifecycle/navigation.ts` | Generated from BHD `CES_Navigation.xlsx` (2026-11-10): 9 sections, 50 groups, 245 pages. Regenerate when the workbook changes. |
| Role matrix | `lifecycle/rbac.ts` (UI) · `muster-api/src/lib/permissions.ts` `PLATFORM_ROLE_MATRIX` (API) | 8 platform roles × lifecycle stages. Stamper = BHD only; AdminOps = customer CIS admin + senior approver. Parity test `muster-api/tests/platformRoles.test.ts`. |
| Built-route map | `lifecycle/builtRoutes.ts` | Lifecycle pages that already have a screen open it; the rest open `LifecycleScaffoldPage` (stage, module, sprint, backend, your access). |
| Shell | `nav.ts`, `PortalShell.tsx`, `App.tsx` | Signed-in viewers get the lifecycle sidebar filtered by role; offline keeps the Muster-only nav. Routes `lc/<section>/<group>/<item>`. |
| Roles page | `pages/LifecycleAccessMatrix.tsx` | Section-level access table + separation-of-duty rules. |
| Roles | Prisma `Role` enum + migration `014_platform_roles` | Adds `org_admin, compliance_manager, it_security_admin, evidence_reviewer, senior_approver`. `requireRole()` now checks `effectiveRoles()` (platform role inherits engine roles) — no route changes. |
| Seed | `deploy/users.seed.example.json` | msutton = platform_admin; vaibhav.pathak, sunny.kumrawat = bhd_operator. Kunal: TBD. |

## Run

```bash
cd ces-muster/muster-api && npx prisma migrate deploy && npx prisma generate
npm test                                  # includes tests/platformRoles.test.ts
cd .. && npm test && npm run build        # includes src/features/portal/__tests__/lifecycleNav.test.ts
```

Docker: `docker compose up -d --build` then `docker compose exec api npx prisma migrate deploy`; seed users with
`docker compose exec api npx tsx scripts/seed-users.ts` after copying `deploy/users.seed.example.json` → `deploy/users.seed.json`.

## Next (Sprint 2–3)
Shared Foundation pages wired to the BHD reference-data facade; Onboard CRUD (organisation, tenant, engagement, scope) on muster-api; discovery/interview screens re-skinned from the BHD Muster SPA.
