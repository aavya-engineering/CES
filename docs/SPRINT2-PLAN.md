# CES — Sprint 2 Execution Plan (production hardening)

**Repo:** `aavya-engineering/CES` · **Branch:** `sprint2-vaibhav-fixes` (from `main` @ `64e522e`)
**Owner:** Vaibhav Pathak (Aavya) · **Date:** 2026-10-29 · **Status:** approved to start

This plan is based on what is actually in the repository today (verified on 2026-10-29), not on
assumptions. Each phase lists the evidence, the change, how it is verified, and the commit.

---

## 0. What the repo already has (verified — do NOT rebuild)

| Area | Evidence | Status |
|---|---|---|
| Prisma ORM | `ces-muster/muster-api/prisma/schema.prisma` (19 models), 13 migrations `001_init … 013_custom_requirements`, `src/lib/prisma.ts` | **Already in place** — no raw SQL in routes. No "Prisma setup" task needed. |
| Auth / RBAC | `bcryptjs` password hashing (`src/lib/passwords.ts`), JWT (`src/lib/jwt.ts`, `middleware/auth.ts`), 5 roles (`Role` enum), platform-admin fence, login lockout (3.1.8), Postgres RLS + `dbRoleGuard.ts` | **Already in place** |
| Request validation | `zod` schemas per route (`src/cesShared/schemas.ts`, routes) | **Already in place** (per-route; will add a shared error envelope) |
| Tests | `vitest` — 45+ test files in `muster-api/tests`, SPA tests + Playwright e2e in `ces-muster` | **Already in place** |
| 110 NIST requirements | `src/vendored/ces-shared/data/cmmc-l2-controls.reference.json` + `sprs-weights.json` + `src/data/nist-800-171r2.json`, served by `src/cesShared/reference.ts` | **Already loaded, 110/110.** Compared against `ces-110-requirements-2026-10-24.csv`: IDs, NIST refs, families, levels, Basic/Derived types, SPRS weights and practice text all match (the CSV's "Assessment Objective" text is also already present). Nothing to import. |
| Env templates | `.env.example`, `deploy/.env.example`, `ces-muster/muster-api/.env.example` | Exists, but **one template for every environment** — no dev / staging / prod split |
| Docker deploy | `Dockerfile` (api + web targets), `docker-compose.yml`, `docker/api-entrypoint.sh` (migrate → bootstrap app role → seed CES-Shared → create first admin), nginx + ZeroSSL | **Already in place** |
| Naming convention | `docs/NAMING-CONVENTION.md` (modules), DB: snake_case tables via `@@map`, `created_at` columns | Exists for modules; **DB/API conventions not written down** |
| Structured logging | none — `console.log/error` in 6 files (`server.ts`, `app.ts`, `mailer.ts`, `audit.ts`, `plan.ts`, `schedulerService.ts`) | **Missing** |
| Swagger / OpenAPI | none | **Missing** |
| Named user accounts | only `INITIAL_ADMIN_EMAIL=admin@example.com` in templates; **no** `msutton@…` / `@aavya.com` anywhere in code | **Missing** — users are created at first boot only |

Email IDs: there is nothing to "replace". Real accounts (`msutton@blueherondefense.com`,
`vaibhav.pathak@aavya.com`, `sunny.kumrawat@aavya.com`) have to be **created** as users — see Phase 3.

---

## 1. Phases, in execution order

### Phase 1 — Environments & configuration (today)
Goal: one clear file per environment; nothing secret in git.

| # | Change | Files |
|---|---|---|
| 1.1 | Per-environment templates under `env/`: `development.env.example` (local Mac), `staging.env.example`, `production.env.example` (plain names, not dotfiles — visible and never auto-loaded) — same keys, environment-correct defaults, every secret blank with a comment on how to generate it | repo root |
| 1.2 | `.gitignore`: keep `.env*` ignored, allow `!env/*.env.example` | `.gitignore` |
| 1.3 | `env/muster-api.development.env.example` for running the API directly with `npm run dev` against a local Postgres | `env/` |
| 1.4 | `docs/ENVIRONMENTS.md`: which file is used where, key-by-key table (dev / staging / prod), how to switch at deploy time (`cp env/production.env.example .env` → fill secrets → `./deploy.sh`), what must change per environment (PUBLIC_URL, HTTP_BIND, SMTP, CORS, log level), secret generation commands | `docs/` |
| 1.5 | `NODE_ENV` + `LOG_LEVEL` + `LOG_FORMAT` added to compose and entrypoint so the same image behaves correctly in each environment | `docker-compose.yml`, `docker/api-entrypoint.sh` |

Verify: `docker compose config` renders with the production template; `npm run dev` in muster-api boots with the development template.

### Phase 2 — Logging (pino) & request tracing
Goal: production-grade, structured, no `console.*` in app code.

| # | Change | Files |
|---|---|---|
| 2.1 | Add `pino` + `pino-http` (chosen over winston: JSON-native, fastest, standard for Express/TS; `pino-pretty` for dev) | `muster-api/package.json` |
| 2.2 | `src/lib/logger.ts`: single logger; `LOG_LEVEL` (dev=debug, prod=info); pretty in dev, JSON in staging/prod; **redacts** `authorization`, `password`, `cookie`, tokens, `DATABASE_URL`, `SMTP_URL` | new |
| 2.3 | `src/middleware/requestLog.ts`: one line per request (method, path, status, ms, request-id, user id/role/tenant when signed in — never the body); `X-Request-Id` echoed to the client | new |
| 2.4 | Replace the 6 `console.*` call sites; central error handler logs with request-id and returns the standard error envelope | 6 files |
| 2.5 | Health endpoints `GET /healthz` (process) and `GET /readyz` (DB reachable) for the proxy / uptime checks | `app.ts` |

Verify: unit test for redaction + request-id; `grep -r console. src/` returns 0 (excluding `vendored/`).

### Phase 3 — Real user accounts (seed, not hard-code)
| # | Change | Files |
|---|---|---|
| 3.1 | `scripts/seed-users.ts`: reads `deploy/users.seed.json` (email, display_name, role, tenant); creates missing users with a random one-time password and `must_change_password=true`; writes passwords to `deploy/output/users-<date>.txt` (mode 600, gitignored) — same pattern as the existing first-admin bootstrap; idempotent | new |
| 3.2 | `deploy/users.seed.example.json` with the three known accounts: `msutton@blueherondefense.com` (platform_admin, Blue Heron Defense), `vaibhav.pathak@aavya.com` (platform_admin), `sunny.kumrawat@aavya.com` (role **TBD — confirm**) | new |
| 3.3 | Entrypoint runs the seed when `deploy/users.seed.json` is present | `docker/api-entrypoint.sh` |
| 3.4 | `INITIAL_ADMIN_EMAIL` default in prod template → `msutton@blueherondefense.com`; dev → `vaibhav.pathak@aavya.com` | env templates |

Verify: run seed twice on a fresh DB → 3 created, then 0 created / 3 skipped; sign-in forces password change.

### Phase 4 — API documentation (OpenAPI 3 / Swagger UI)
| # | Change | Files |
|---|---|---|
| 4.1 | `swagger-jsdoc` + `swagger-ui-express`; spec built from JSDoc on routes + shared schemas (`components/securitySchemes: bearerAuth`) | `package.json`, `src/lib/openapi.ts` |
| 4.2 | `GET /api-docs` (UI) and `GET /api-docs.json` (spec); **enabled in dev/staging, disabled in production unless `API_DOCS=1`**; behind sign-in in staging | `app.ts` |
| 4.3 | Document first: `/auth/*`, `/api/users`, `/api/v1/ces-shared/*` (110 requirements, custom requirements, SPRS), `/api/portfolio`, `/api/engagements`; remaining routers get a stub tag and are filled in as touched | route files |
| 4.4 | Test: spec validates (`openapi-types` / swagger-parser) and every mounted `/api` path appears in the spec | `tests/openapi.test.ts` |

### Phase 5 — Conventions & validation envelope
| # | Change | Files |
|---|---|---|
| 5.1 | `docs/CONVENTIONS.md`: DB (snake_case, plural tables, `id` uuid, `<table>_id` FKs, `idx_<table>_<cols>`, `created_at/updated_at`, migration naming `NNN_<topic>`), API (`/api/v1/<resource>`, plural nouns, status codes, error envelope `{ error: { code, message, details?, requestId } }`, pagination `?page&limit`), code (conventional commits, branch naming, PR checklist) | `docs/` |
| 5.2 | `src/middleware/validate.ts`: `validate(schema, 'body'|'query'|'params')` wrapper that turns zod errors into the envelope with HTTP 422; adopt in routes touched this sprint | new |

### Phase 6 — Bug fixes from `CES_Observation.xlsx` → **Retesting** tab (21 items, all UI vs. mockup)
All 21 are SPA (`ces-muster/src/features/*`) pixel/layout mismatches against the Sprint-1 mockups
(`Mockups.zip`). Grouped so each group is one reviewable commit:

| Group | Items | Pages |
|---|---|---|
| A | 1, 2, 4 — section gap, checkbox size | Login, Forgot Password |
| B | 3 — "Back to Sign In" centred + divider line | Forgot Password |
| C | 5–9 — icons, card shape, extra text, card mismatch, wrapping | 110 Requirements header/cards |
| D | 10–15 — Create Requirement / dropdowns / headers / Export / arrow (needs decision: the mockup predates the 10-27 CRUD decision that *added* Create Requirement — keep CRUD, align styling) | 110 Requirements toolbar/table |
| E | 16, 17 — rows-per-page position, centred pagination | 110 Requirements footer |
| F | 18–21 — remove CUI strip, search placeholder, section layout, Last Updated/Action columns | SPRS Weight Table |

Each fix: screenshot in `prnt.sc` link → reproduce locally → fix → Playwright/visual check → mark
**Passed** in the sheet with build id. Sheet1 (48 items) and "Compare from given reference" (20 items)
are tracked next, after Retesting is green.

### Phase 7 — Verification, PR, deploy
1. `npm test` (workspaces + muster-api) green; `npm run lint` in ces-muster green.
2. Conventional commits per phase on `sprint2-vaibhav-fixes`; PR → `main` with the checklist.
3. Staging: `cp env/staging.env.example .env` on the staging box → fill secrets → `./deploy.sh`; smoke test (sign-in, 110 requirements page, SPRS page, forgot-password mail, `/healthz`, `/api-docs`).
4. Production: same with `env/production.env.example`; `API_DOCS` off; verify users seeded; retest the Retesting tab on prod; notify Mark.

---

## 2. Decisions needed from Vaibhav (work continues meanwhile)

| # | Question | Default if no answer |
|---|---|---|
| D1 | Role for `sunny.kumrawat@aavya.com` (platform_admin / bhd_operator / assessor_read_only)? | `bhd_operator` |
| D2 | Should `msutton@…` be the **first** admin on prod (`INITIAL_ADMIN_EMAIL`) or an extra seeded user? | first admin |
| D3 | Retesting group D: keep "Create Requirement" (10-27 decision) even though the mockup doesn't show it? | keep, restyle to mockup |
| D4 | Swagger on production: off, or on behind sign-in? | off |

## 3. Out of scope this sprint
Microservices / Kubernetes / message queues (the product is a two-container monolith by design;
no evidence it needs more), MongoDB, Redux, winston (pino chosen), re-importing the 110 requirements (already present and verified).

## 4. Commit map
`chore(env): …` → `feat(api): structured logging …` → `feat(api): seed named users …` →
`feat(api): openapi docs …` → `docs: conventions …` → `fix(ui): retesting A…F` → `test: …`
