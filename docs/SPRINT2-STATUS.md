# CES — Sprint 2 status (2026-10-29, end of day)

**PRs open on `aavya-engineering/CES` (base `master`):**
- **#1** `sprint2-vaibhav-fixes` — 12 commits — Sprint 2 (env, logging, users, OpenAPI, conventions, QA fixes rounds 1–3)
- **#2** `chore/dependency-audit` — 1 commit — runtime critical/high advisories cleared

Merge #1 first, then #2. Reviewer: repo maintainer (last pusher on `master`: neeleshvaishnavdevops).
Plan: `docs/SPRINT2-PLAN.md` · Conventions: `docs/CONVENTIONS.md` · Environments: `docs/ENVIRONMENTS.md`

## PR #1 — commits

| # | Commit | What |
|---|---|---|
| 1 | `04c7ff4 chore(env)` | `env/{development,staging,production,muster-api.development}.env.example`, `docs/ENVIRONMENTS.md`, compose passes CES_ENV/LOG_*/API_DOCS |
| 2 | `512a1d0 feat(api)` | pino logger (redaction), `X-Request-Id`, `/healthz` `/readyz`, 6 console sites replaced, 6 tests |
| 3 | `cda8fab feat(api)` | named users from `deploy/users.seed.json` (msutton, vaibhav.pathak, sunny.kumrawat), one-time passwords, idempotent, 3 tests |
| 4 | `9b9be95 feat(api)` | OpenAPI 3 + Swagger UI at `/api-docs` (API_DOCS=1; off in prod), 5 tests |
| 5 | `ada0caf docs/feat` | `docs/CONVENTIONS.md`, `validate()` middleware (422 envelope), 3 tests |
| 6 | `d9c2800 fix(ui)` | Login / Forgot: card margins, checkbox, centred "Back to Sign In" |
| 7 | `8517f7c fix(ui)` | 110 Requirements + SPRS aligned to m03/m15 mockups; CUI strip hidden (D5) |
| 8 | `7eaee76 docs` | first status doc |
| 9 | `5ba3a1d chore(shared)` | vendored ces-shared copies re-synced (fixes 2 pre-existing failing tests) |
| 10 | `a689cc6 fix(ui)` | browser-verified pass: login hero 58%, theme menu, SPRS filter card, Home/Portfolio code fixes |
| 11 | `9fc56c4 fix(ui)` | UX sweep: bounded textareas + maxLength, 40px controls, app-wide filter toolbars, Title Case, Mapping text fallback, top bar nowrap |
| 12 | `5191bf4 fix(ui)` | QA round 3: landing page after sign-in, export disabled w/o selection, CSV = table columns/visible only, Light/Dark segmented control, one-line objective rows |

## Verification
- Mac: `muster-api` full suite green (after `npx prisma generate` + root `npm ci` for ces-stamper), `ces-muster` suite green, `vite build` OK.
- `npm run lint` in ces-muster reports 50 **pre-existing** warnings, all in `muster-api/` (`any` in live.* tests, `_kid/_use/_alg`) — `--max-warnings 0` makes it red; fix = scope eslint to the SPA or clean those files (Sprint 3, 30 min).
- Visual check done in the Claude browser at 1536px (effective) for Login, Forgot, 110 Requirements, SPRS, Overview, Objectives, Catalog, Mapping, Golden Files, dark mode. **Home/Portfolio dashboard not yet seen running** (needs muster-api up) — verify on staging.

## Observation sheet — status after rounds 1–3

| Tab | Fixed | By decision / partial | Needs API or screenshot |
|---|---|---|---|
| Retesting (21) | 16 | #10 Create Requirement (D3), #12 Assessment Status (no data — TBD), #20 DoD weights kept | #11 (prnt.sc) |
| Sheet1 (48) | Home #1–#3,#5–#12 (code); 110 Req #13–#19,#21,#22,#23; SPRS #26–#33,#36–#39; AO #40–#48 | #14 Priority card wording, #17/#33 "—" = not set (by decision), #20 Import/Update split by design, #24/#25 CRUD items need signed-in retest | Home visuals |
| Compare (20) | Login #1,#2,#4,#7,#9,#14 | fonts/icons #5/#6/#8 (same families; pixel diff) | #15–#20 sidebar/icon screenshots |
| QA round 3 (6) | all 6 | — | — |

QA still owes: the `prnt.sc` screenshots as a zip (several items cannot be judged without them).

## PR #2 — dependencies (SI.L1-3.14.1)
Cleared (lock-file only, semver-compatible except nodemailer): proxy-addr 2.0.8 (IP spoofing — we run `trust proxy`), body-parser 1.20.9, **nodemailer 7→10.3.1** (SMTP command injection; API unchanged), js-yaml 4.3.2, nanoid, postcss, source-map-js, brace-expansion, browserslist, fast-uri.
Left for Sprint 3 (breaking): **zod 3→4** (memory DoS; mitigated by 100 kb JSON limit — touches every route schema), **vitest 1→5 / vite 5→7** (dev-only: test UI server RCE/path traversal). GitHub's "433" counts every workspace (ces-stamper/eo/ao/planner not yet audited) — run `npm audit` per package there too; `npm audit` at the root crashes (`edgesOut`, npm bug with `file:` links).

## Decisions open (ask Mark)
D1 role for sunny.kumrawat (seed says `bhd_operator`) · D2 msutton as first prod admin (yes in template) · **D3** Create Requirement stays visible · D4 Swagger off in prod · **D5** CUI purple strip removed (DoD screen marking — one CSS rule to restore) · D6 Export disabled until selection (QA ask; mockup has it always on)

## Sprint 3 candidates
1. zod 4 + vitest 5 upgrades · 2. eslint scope / warning cleanup · 3. Overview page to mockup img04 (charts, recent updates) · 4. Evaluation Rules (BHD to confirm feature) · 5. Assessment Status column (needs engagement-level data model) · 6. Compare-tab icon/font pixel pass with QA screenshots · 7. Home/Portfolio visual retest on staging

## Next (tomorrow)
1. Get #1 reviewed/merged, then #2. 2. Staging deploy (`env/staging.env.example`, users seed) → QA retest with the new build id. 3. Mark: D1/D3/D5/D6. 4. QA: screenshot zip.
