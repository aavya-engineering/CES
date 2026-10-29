# CES engineering conventions

Companion to `docs/NAMING-CONVENTION.md` (module names) and `CONTRIBUTING.md` (ownership header,
review). This page covers the **database**, the **HTTP API**, **logging** and the **git workflow**.
Where the code already does something, the rule below records it; new code follows it, old code
is changed only when touched.

## 1. Database (Postgres via Prisma, `ces-muster/muster-api/prisma`)

| Rule | Example |
|---|---|
| Tables: `snake_case`, plural, mapped with `@@map` (Prisma model stays PascalCase singular) | `model EngagementMilestone … @@map("engagement_milestones")` |
| Columns: `snake_case` | `tenant_id`, `created_at`, `must_change_password` |
| Primary key: `id` `uuid` (`@default(uuid())`) | every table |
| Foreign key: `<singular_table>_id` | `engagement_id`, `user_id`, `tenant_id` |
| Timestamps: `created_at` on every table; `updated_at` where rows change; `*_at` for events; `*_by` for actors | `published_at`, `published_by`, `retired_at` |
| Enums: Postgres enum through Prisma `enum`, lower-case values | `Role { prime sub bhd_operator … }` |
| Indexes: `<table>_<column(s)>_idx`; unique partial indexes get a meaning name | `audit_events_at_idx`, `shared_items_one_draft` |
| Check constraints: `<table>_<column>_check` | `shared_items_kind_check` |
| Join tables: `<a>_<b>` plural, both FKs in the primary key | (none yet) |
| Tenant data: every tenant-scoped table has `tenant_id` and an RLS policy; reads go through `withTenant()` | `parties`, `interview_sessions`, `contracts` |
| Migrations: `prisma/migrations/NNN_<topic>/migration.sql`, three-digit sequence, one topic each, with a comment naming the ticket/decision; never edit a shipped migration — add a new one | `013_custom_requirements` |
| App role: `muster_app` (no superuser, no BYPASSRLS); `postgres` only for migrations | `docker/api-entrypoint.sh`, `src/lib/dbRoleGuard.ts` |

## 2. HTTP API (`muster-api`)

| Rule | Example |
|---|---|
| Mount points: `/auth/*` (session), `/api/<resource>` (tenant data), `/api/v1/<reference>` for versioned reference data, `/portal/*` (grantee lane), `/healthz` `/readyz` (probes) | `/api/engagements`, `/api/v1/ces-shared/requirements` |
| Resources: plural nouns, kebab-case path segments, `snake_case` JSON fields (same names as the DB) | `/api/audit-events`, `{ "engagement_kind": … }` |
| Sub-resources nest one level; actions are verbs as the last segment | `/api/engagements/{id}/milestones`, `…/items/{kind}/{key}/publish` |
| Methods: `GET` read, `POST` create/action, `PATCH` partial update, `PUT` replace a draft, `DELETE` remove | `PATCH /api/users/{id}` |
| Status codes: `200` ok, `201` created, `204` deleted, `400` validation (zod `flatten()` in `error`), `401` no/invalid token, `403` role or fence, `404` not found (also for rows outside the caller's tenant), `409` conflict, `422` *(new, via `validate()`)* semantic validation, `429` rate limit with `Retry-After`, `500` with `requestId` | |
| Error body: `{ "error": string \| object, "code"?: string, "requestId"?: string }`; `code` is `UPPER_SNAKE` | `{ "error": "A user with this email already exists", "code": "EMAIL_TAKEN" }` |
| Auth: `bearerAuth` on every `/api` route, `requireRole(...)` per route; platform admins are fenced to `/users`, `/audit-events`, `/v1/ces-shared`, `/portfolio` | `src/middleware/auth.ts`, `platformAdminFence.ts` |
| Validation: every body/query/params through a zod schema declared next to the route; new routes use `validate(schema, 'body')` from `src/middleware/validate.ts` | `src/routes/engagements.ts` |
| Pagination (when added): `?page=1&limit=50` → `{ items, page, limit, total }` | — |
| Every route appears in `src/lib/openapi.ts` (new route = new entry in the same PR) | — |
| Request id: read `req.id` / `req.log`; never log bodies, headers, tokens or passwords | `src/middleware/requestLog.ts` |

## 3. Logging

* `import { logger } from '../lib/logger.js'`; inside a request use `req.log` (carries `requestId`).
* Levels: `error` — a request failed or data may be wrong; `warn` — rejected/denied/missing config;
  `info` — lifecycle and business events (sign-in, publish, seed); `debug` — diagnostics.
* Message is a short constant phrase; variable data goes in the object: `log.info({ tenantId }, 'engagement created')`.
* Identity (user id, e-mail, tenant) **is** logged — accountability (3.3.2); secrets never are (redaction list in `logger.ts`).
* No `console.*` in `src/` (CLI commands under `src/cli` excepted — they print for the operator).

## 4. Git and review

* Branch: `<type>/<short-topic>` from `main` — `feat/forgot-password`, `fix/retest-login-gap`; sprint integration branches `sprintN-<owner>-<topic>`.
* Commits: Conventional Commits — `feat(api): …`, `fix(ui): …`, `chore(env): …`, `docs: …`, `test: …`, `refactor: …`; scope is the package (`api`, `ui`, `shared`, `docker`, `env`). Subject ≤ 72 chars, body says *why* and names the decision/observation it closes (e.g. `Retesting #3`).
* One commit per reviewable change; UI fix groups from the observation sheet are one commit per group.
* PR checklist: tests green (`npm test` in `muster-api` and `ces-muster`), `npm run lint` in `ces-muster`, OpenAPI updated for new routes, migration has a comment, ownership header present, no secrets or `.env` in the diff, `docs/` updated when behaviour changed.
* Tags: `vMAJOR.MINOR.PATCH` on `main`; `CES_VERSION` in `.env` is the tag deployed; rollback = previous tag.

## 5. Front-end (`ces-muster/src`)

* Features under `src/features/<area>/`, shared UI under `src/shared/`; vendored copies under `src/vendored/` are never edited by hand (`npm run check:drift`).
* Visual reference is the Sprint-1 mockup set; fonts (Inter) and icons (lucide) must match it.
* Headings: Title Case for page and section titles (observation sheet #18, #36, #38, #46/48).
