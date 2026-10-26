# ces-muster

Muster is the **assess and plan** module of CES. It runs a CMMC Level 2 (NIST SP 800-171 Rev. 2) readiness interview for one organisation or a prime with its subcontractors, scores it (SPRS), and generates the plan that Stamper applies to the Microsoft tenant.

> Added 2026-10-24 by Aavya (onboarding repo-fixes item 12 / B12: the repo had no root README). Every statement below was checked against this repository's code; anything not checked is marked **TBD**.

## Parts

| Part | Folder | What it is | Default address |
|---|---|---|---|
| SPA | `src/` | React + Vite app. **Offline-first**: the interview, scoring and export run in the browser and keep data in IndexedDB (Dexie). It calls muster-api only for network features (discovery, harvest, coach, plan push, sign-in) | `npm run dev` → http://localhost:5173 (`npm run preview` → 4173) |
| muster-api | `muster-api/` | Express + Prisma API over PostgreSQL with row-level security. Owns sign-in (`POST /auth/login`), discovery, plan push to Stamper's folders, results | `PORT` env, default 4000 |
| Database | `muster-api/prisma/` | PostgreSQL; migrations `001_init` … `007_live_area_consents` | from `DATABASE_URL` |

How the SPA finds the API: browser `localStorage['muster-api-url']`, default `http://localhost:4000/api`. The SPA reads no environment variables. By default muster-api answers CORS only for the Vite origins on localhost (5173, 4173); see `muster-api/src/app.ts`.

## Quick start (local, simulator)

Prerequisites: Node 20 (the version CI uses), PostgreSQL. Full step-by-step, including Windows: the CES onboarding guide, chapter 06.

```bash
# SPA only (offline interview, scoring, export)
npm ci
npm run dev

# API (needs PostgreSQL and muster-api/.env — copy muster-api/.env.example)
cd muster-api
npm ci
npx prisma generate
#   migrate as the database owner, run as the app role — see muster-api/README.md
npm run migrate:deploy
npx tsx scripts/seed.ts --email <operator email> --password <password>   # first user
npm run dev
```

There is no sign-up, invitation or password reset: users are created with `muster-api/scripts/seed.ts` (roles `bhd_operator`, `prime`, `sub`, `assessor_read_only`).

Plan push writes to `{CES_PIPELINE_ROOT}/Stamper/plan-data/<tenant slug>/plans`. Set `CES_PIPELINE_ROOT` in `muster-api/.env`.

## Checks

| Command | What it runs |
|---|---|
| `npm test` | SPA unit tests (Vitest, jsdom) |
| `npm run test:e2e` | Playwright end-to-end tests (builds and previews the SPA; network calls are intercepted) |
| `npm run lint` | ESLint |
| `npm run check:drift` | Vendored-code drift check |
| `npm run check:ces-shared` / `sync:ces-shared` | Compare / refresh the vendored ces-shared copies |
| `cd muster-api && npm test` | API tests; the live RLS tier runs only with `DATABASE_URL` set (see `muster-api/README.md`) |

## Where to read next

| Topic | File |
|---|---|
| API sign-in, test tiers, live RLS tests | `muster-api/README.md` |
| How Muster reaches Microsoft tenants (and an open conflict with the code) | `TENANT-CONNECTION.md` |
| Question IDs the data must carry | `DATA-QUESTION-ID-REQUIREMENT.md` |
| Feature history and reports | `docs/` (for example `docs/FLOW-THROUGH-REPORT-2026-09.md`) |
| How to contribute, file headers, `reuse lint` | `CONTRIBUTING.md` |

## TBD

- Supported production hosting (single-hosted, multi-customer) — BHD decision; today each module runs as a local app.
- Live (non-simulator) tenant use — never run against a real tenant (onboarding repo-fixes item 33).
