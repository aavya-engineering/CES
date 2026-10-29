# CES — Sprint 2 status (2026-10-29)

**Branch:** `sprint2-vaibhav-fixes` · 7 commits on top of `main` @ `64e522e` · **not pushed** (push is yours)
**Plan:** `docs/SPRINT2-PLAN.md` · **How to review:** `git log --oneline 64e522e..HEAD`, then `git show <sha>`

## Commits

| # | Commit | Phase | Files |
|---|---|---|---|
| 1 | `04c7ff4 chore(env)` | 1 Environments | `env/{development,staging,production,muster-api.development}.env.example`, `docs/ENVIRONMENTS.md`, `.gitignore`, `docker-compose.yml` |
| 2 | `512a1d0 feat(api) logging` | 2 Logging | `src/lib/logger.ts`, `src/middleware/requestLog.ts`, `src/routes/health.ts`, 6 console sites, `tests/logging.test.ts` |
| 3 | `cda8fab feat(api) seed users` | 3 Users | `src/lib/seedUsers.ts`, `scripts/seed-users.ts`, `deploy/users.seed.example.json`, entrypoint + compose, `tests/seedUsers.test.ts` |
| 4 | `9b9be95 feat(api) openapi` | 4 Swagger | `src/lib/openapi.ts`, `src/routes/apiDocs.ts`, `tests/openapi.test.ts` |
| 5 | `ada0caf docs + validate` | 5 Conventions | `docs/CONVENTIONS.md`, `src/middleware/validate.ts`, `tests/validate.test.ts` |
| 6 | `d9c2800 fix(ui) sign-in` | 6 A/B | `signIn.css` |
| 7 | `8517f7c fix(ui) 110 Req + SPRS` | 6 C–F | `RequirementsPage.tsx`, `SprsWeightsPage.tsx`, `ui.tsx`, `portalTheme.css`, `muster.css`, `shellAndGrid.test.tsx` |

## Verification (run in the sandbox on your Mac's checkout)

| Check | Result |
|---|---|
| `muster-api`: `tsc --noEmit` | only the 2 errors that already exist on `main` (`auth.ts:180`, `discoveryEnvelope.ts:21` missing `ajv`) |
| `muster-api`: new tests (logging 6, seedUsers 3, openapi 5, validate 3) | **17/17 pass** |
| `muster-api`: full suite | 468 pass; 21 files fail only with `@prisma/client did not initialize` — the sandbox cannot download Prisma engines (`binaries.prisma.sh` 403). **Run on your Mac:** `cd ces-muster/muster-api && npx prisma generate && npx vitest run` |
| `ces-muster`: `tsc --noEmit` | only the 1 error that already exists on `main` (`s110Fixes.test.tsx:60`) |
| `ces-muster`: portal + auth tests | **80/80 pass** |
| `ces-muster`: full suite | 4 pre-existing failures on `main` too (vendored-parity, fixture freshness) — unrelated |
| `ces-muster`: `eslint` on touched files | clean |
| `ces-muster`: `vite build` | OK |
| Visual check of the UI fixes against the mockups | **not done here** (no browser in the sandbox) — `cd ces-muster && npm run dev`, open Login, Forgot password, 110 Requirements, SPRS |

## Retesting tab — item by item

| # | Page | Status | Where |
|---|---|---|---|
| 1, 4 | Login / Forgot | Fixed — card margins match mockup | `signIn.css` |
| 2 | Login | Fixed — checkbox 18px | `signIn.css` |
| 3 | Forgot | Fixed — "Back to Sign In" centred under a rule | `signIn.css` |
| 5 | 110 Req | Fixed — FileText icon tile | `RequirementsPage.tsx` |
| 6, 8 | 110 Req | Fixed — card proportions | `portalTheme.css` |
| 7 | 110 Req | Fixed — extra sub-texts removed from cards | `RequirementsPage.tsx` |
| 9 | 110 Req | Fixed — lede wraps in two lines | `portalTheme.css .pg-head-text` |
| 10 | 110 Req | **Won't fix (D3)** — "Create Requirement" kept per 2026-10-27 CRUD decision; confirm with Mark |
| 11 | 110 Req | **Needs the screenshot** — the prnt.sc link is not reachable from here; likely the Create caret (D3) |
| 12 | 110 Req | Partial — mockup's "Security Family" exists as a column; "Assessment Status" has no data at reference level → **TBD** |
| 13 | 110 Req | Fixed — Security Family column; Type/Weight off by default |
| 14 | 110 Req | Fixed — Export ▾ split button |
| 15 | 110 Req | Fixed — arrow only on the sorted column |
| 16, 17 | 110 Req | Fixed — pager flush under table, pages centred |
| 18 | SPRS (global) | Fixed — CUI strip hidden in Muster (**D5**: it is a DoD screen marking; BHD may want it back — one CSS rule) |
| 19 | SPRS | Fixed — placeholder matches mockup |
| 20 | SPRS | Partial — layout/labels match; DoD 5/3/1 weights kept (doc 14 M3/M4), not the mockup's 0.05 fractions |
| 21 | SPRS | Fixed — Source Standard box, Last updated, Actions ▾ |

## What was NOT needed (already in the code)
Prisma ORM, JWT auth, bcrypt hashing, zod validation, vitest suites, the 110 requirements (CSV matches
`cmmc-l2-controls.reference.json` 110/110), e-mail replacement (no `msutton@`/`@aavya` strings existed —
accounts are *created* by the new seed instead).

## Decisions still open
D1 role for `sunny.kumrawat@aavya.com` (seed example says `bhd_operator`) · D2 `msutton@…` as first admin
(prod template says yes) · D3 Create Requirement visible (kept) · D4 Swagger in prod (off) · D5 CUI strip (hidden).

## Next
1. On the Mac: `npx prisma generate` + full test run; `npm run dev` and eyeball the 4 pages.
2. `git push -u origin sprint2-vaibhav-fixes`, open the PR to `main` (checklist in `docs/CONVENTIONS.md §4`).
3. Staging: `cp env/staging.env.example .env`, fill secrets, `cp deploy/users.seed.example.json deploy/users.seed.json`, `sudo ./deploy.sh`; check `/healthz`, `/readyz`, `/api-docs`, `deploy/output/users-*.txt`.
4. Sheet1 (48) and "Compare from given reference" (20) observations next.
