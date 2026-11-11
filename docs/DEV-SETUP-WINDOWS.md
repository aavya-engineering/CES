# CES — Developer setup on Windows 10/11 (clone → install → run)

**Audience:** a developer who clones this repository on a Windows 10/11 laptop and wants the platform (muster-api + Muster portal) running locally against Postgres, with the tenant simulator so the discovery engine can be exercised end to end.
**Scope:** local development only. Server deployment is in `claude/ces-sdlc/29-server-deployment-guide.md` and `42-windows-kit-and-server-guide-2026-11-11.md` (project docs). The BHD contractor kit (`C:\ces-nb`, Demo Commander) is a separate thing and is **not** needed for this doc.
**Branch:** `feat/sprint1-lifecycle-shell` (PR #4) until it merges to `master`.
**Last verified:** 2026-11-11 on macOS (Node 24, Postgres 16) with the same scripts; Windows-specific steps are marked ⚠ where they have not yet been run on a Windows box — please report the first run.

---

## 0. What you get

| Process | Folder | Port | Start command |
|---|---|---|---|
| muster-api (Express + Prisma) | `ces-muster\muster-api` | 4000 | `npm run dev` |
| Muster portal (Vite SPA) | `ces-muster` | 5173 | `npm run dev` |
| Tenant simulator (stacksim, M365/Azure fake) | `tenant-stacksim` | 4390 | `npm run sim` (from repo root) |
| Tenant runner (optional — polls queued jobs) | `ces-muster\muster-api` | — | `npm run runner` |
| Postgres 16 | — | 5432 | Docker Desktop or EDB installer |

Everything in this doc is `localhost` only. No customer data, no real tenant, no secrets beyond local dev values.

---

## 1. Prerequisites (one-time)

| Tool | Version | Notes |
|---|---|---|
| Git for Windows | latest | During install choose **"Checkout as-is, commit as-is"** (we also force it below). Enable long paths. |
| Node.js | **24.x** (CI uses 24; engines allow ≥18) | https://nodejs.org → LTS/Current 24. Confirm `node -v`, `npm -v`. |
| PowerShell | 5.1 (built-in) or 7 | Scripts use `-ExecutionPolicy Bypass` per call; no global policy change needed. |
| Postgres 16 | 16.x | **Option A** Docker Desktop (recommended, see §3). **Option B** EDB installer; remember the `postgres` superuser password and add `C:\Program Files\PostgreSQL\16\bin` to `PATH` so `psql` works. |
| Visual Studio Build Tools | only if `npm ci` fails on a native module | Not expected: the lockfiles currently resolve to prebuilt binaries on win32-x64. |

Open **PowerShell** (not cmd) for all commands below.

---

## 2. Clone

```powershell
git config --global core.longpaths true
cd C:\
git clone -c core.autocrlf=false -c core.longpaths=true https://github.com/aavya-engineering/CES.git ces
cd C:\ces
git checkout feat/sprint1-lifecycle-shell
git log --oneline -1          # expect 3ef7407 or newer
```

Why `autocrlf=false`: the repo contains `.sh` scripts, JSON fixtures with SHA-256 checksums (`muster-api/src/vendored/ces-shared/data/evidence-catalog/README.md`) and Prisma migrations; CRLF conversion would change checksums and break `npm run catalog:check`.

Why `C:\ces` (short path): Vite/Prisma paths get long; keep the root short. Any folder works, but avoid OneDrive-synced folders (file locking breaks `tsx watch`).

---

## 3. Postgres (Option A — Docker Desktop)

```powershell
docker run -d --name ces-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=muster_db -p 5432:5432 postgres:16
docker exec -it ces-pg psql -U postgres -d muster_db -c "select version();"
```

Option B (EDB installer): create the database once:

```powershell
psql -U postgres -c "CREATE DATABASE muster_db;"
```

Two connection strings are used on purpose (least privilege, see `scripts/bootstrap-app-role.sql`):

- **Migrations** run as superuser: `postgresql://postgres:postgres@localhost:5432/muster_db`
- **The API** runs as `muster_app` (no BYPASSRLS): `postgresql://muster_app:devpass@localhost:5432/muster_db`
  The API refuses to start if `DATABASE_URL` points at a superuser.

---

## 4. Install dependencies

The repo is three npm trees. `ces-muster` and `muster-api` are **not** root workspaces, so install each.

```powershell
cd C:\ces
npm ci                                  # root workspaces: ces-shared, stamper, eo, ao, planner, ec
cd C:\ces\ces-muster;            npm ci  # portal
cd C:\ces\ces-muster\muster-api; npm ci  # API
cd C:\ces\tenant-stacksim;       npm ci  # simulator (dev deps only)
```

Use `npm ci`, never `npm install`, so `package-lock.json` stays as committed. Expect `npm audit` noise (root workspaces: known, tracked in `scripts/audit-gate.mjs`; zod high is accepted until 2026-11-30).

---

## 5. Configure and migrate the API

```powershell
cd C:\ces\ces-muster\muster-api
Copy-Item .env.example .env
```

Edit `.env` (only these lines matter for dev):

```
DATABASE_URL=postgresql://muster_app:devpass@localhost:5432/muster_db
JWT_SECRET=<any long random string, e.g. output of: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
PORT=4000
# optional: MONITOR_SCHEDULER=1
```

Run migrations as superuser, then create the app role, then generate the Prisma client:

```powershell
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/muster_db"
npx prisma migrate deploy
# Docker:
docker exec -i ces-pg psql -U postgres -d muster_db -v ON_ERROR_STOP=1 -v app_password="'devpass'" -f - < scripts\bootstrap-app-role.sql
# EDB (psql on PATH):
# psql -U postgres -d muster_db -v ON_ERROR_STOP=1 -v app_password="'devpass'" -f scripts\bootstrap-app-role.sql
Remove-Item Env:DATABASE_URL          # back to the muster_app URL from .env
npx prisma generate
```

⚠ `docker exec -i … < file` works in PowerShell 7; on PowerShell 5.1 use `Get-Content scripts\bootstrap-app-role.sql -Raw | docker exec -i ces-pg psql -U postgres -d muster_db -v ON_ERROR_STOP=1 -v app_password="'devpass'"`.

Re-run `migrate deploy` + the bootstrap SQL after every pull that adds a migration (bootstrap is idempotent and re-grants on new tables).

---

## 6. Seed dev users

```powershell
cd C:\ces\ces-muster\muster-api
npm run seed:dev:win
```

Password for every account: **`Ces!Local2026`** (override with `$env:DEV_PASSWORD`). Accounts (tenant → role):

| Email | Tenant | Role |
|---|---|---|
| admin@bhd.local | Blue Heron Defense | platform_admin (no customer data — PB-01) |
| operator@bhd.local, operator2@bhd.local | Blue Heron Defense | bhd_operator |
| bhd-ops1@contoso.local, bhd-ops2@contoso.local, runner@contoso.local | Contoso Defense (demo) | bhd_operator (runner = the account a Windows runner would poll with) |
| orgadmin@contoso.local | Contoso Defense (demo) | org_admin |
| compliance@contoso.local | Contoso Defense (demo) | compliance_manager |
| itsec@contoso.local | Contoso Defense (demo) | it_security_admin |
| (see script for the rest: senior_approver, assessor_read_only, cis) | | |

Local only. Never run this against a shared or customer database.

---

## 7. Run

Three PowerShell windows:

```powershell
# 1 — API
cd C:\ces\ces-muster\muster-api; npm run dev        # http://localhost:4000, GET /api/admin/health

# 2 — Portal
cd C:\ces\ces-muster; npm run dev                   # http://localhost:5173 (proxies /api and /auth → :4000)

# 3 — Simulator (needed only for Assess › Run assessment)
cd C:\ces; npm run sim                              # builds, creates scenario muster-partial, serves :4390

# 4 — Runner (optional; only when the API is NOT on Windows or you want to exercise the queue path)
cd C:\ces\ces-muster\muster-api
$env:CES_API_URL='http://localhost:4000/api'; $env:CES_RUNNER_EMAIL='runner@contoso.local'; $env:CES_RUNNER_PASSWORD='Ces!Local2026'
npm run runner -- --once                            # one pass; drop --once to poll every 30 s
```

The runner (`src/runner/bin.ts`) is the ADR-02 pull client: it lists the engagements its account can see, claims queued discovery jobs, runs the same simulator walk the API runs in-process on Windows, and posts the envelope + captures. On a Windows dev box the API runs discovery in-process, so the queue is normally empty; start the API with `$env:CES_ENGINE_LOCAL='0'` to force jobs onto the queue and watch the runner pick them up (that is also what a macOS/Linux API does by default). Remediation lane is off unless `CES_RUNNER_REMEDIATION_CMD` (+ `CES_RUNNER_REMEDIATION_ARGS` as a JSON array) points at a command that executes Stamper/AdminOps: the run arrives as JSON on stdin, the command prints `{outcome, summary, steps, captures}` on stdout (see `src/runner/executors.ts`); the child never sees the runner's credentials. Live-mode discovery jobs are never claimed by the runner yet (needs consent grants on the wire — ADR follow-up). Token expiry is handled by re-login; with a static `CES_RUNNER_TOKEN` the runner exits on 401 so a service manager can restart it.

Open http://localhost:5173, sign in as `compliance@contoso.local`. If the portal says it cannot reach the API, set in the browser console once: `localStorage.setItem('muster-api-url','/api')` and reload (the dev proxy handles the rest).

---

## 8. Verify (five minutes)

```powershell
cd C:\ces\ces-muster\muster-api
npm test                      # vitest, in-memory DB — ~all suites; scheduler.test.ts may be flaky under load
npm run catalog:check         # evidence catalog release 0 validates against schema
npm run smoke:postgres        # throwaway tenant; every slice writes+reads through RLS; runner round trip; 403 probes
cd C:\ces\ces-muster; npm test
```

Expected: `smoke: every slice wrote and read against Postgres (tenant Smoke xxxxxxxx)`.

In the portal (Contoso tenant):

1. **Onboard** → boundary confirmed (org_admin).
2. **Assess** → *Run assessment* with slug `muster-partial`. On Windows the engine runs **in-process** (`process.platform === 'win32'`) and spawns `powershell.exe` for registry reads → expect `ran > 0`, `failed < ran`. This is the one step that cannot succeed on macOS/Linux (there it returns 409 `ENGINE_NEEDS_WINDOWS` or queues the job for a runner). **Please paste the stats from the first Windows run into the project thread — nobody has executed this on Windows yet.** ⚠
3. **Evidence › NIST catalog** loads 14 definitions for AC.L2-3.1.1.
4. **Remediate** → create Stamper run as compliance, approve as bhd-ops1, execute; `runner@contoso.local` can claim via `GET /api/engagements/:id/remediation/runner/queue`.
5. **Admin › Health** shows DB ok, scheduler off (unless `MONITOR_SCHEDULER=1`).

---

## 9. Daily loop

```powershell
cd C:\ces; git pull
# if package-lock changed in any tree → npm ci there
# if prisma/migrations changed → §5 migrate deploy + bootstrap SQL + prisma generate
```

Commit from your own machine (`git push` stays with the developer; nothing in CI pushes). CI (`.github/workflows/ci.yml`) runs root tests, `test:muster`, audit gate and the Postgres smoke on every PR — run `npm run smoke:postgres` locally before pushing API changes.

---

## 10. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Could not find Prisma Schema` / `Missing script: seed:dev:win` | Wrong folder. API scripts run from `ces-muster\muster-api`, `sim` from repo root. |
| `permission denied for table _prisma_migrations` | You ran `migrate deploy` as `muster_app`. Set `$env:DATABASE_URL` to the `postgres` URL for migrations only (§5). |
| API exits at start: "connected as superuser / BYPASSRLS" | `.env` points at `postgres`. Use the `muster_app` URL. |
| `JWT_SECRET` error at start | `.env` not copied or empty secret. |
| Portal shows all pages 404 / `/api/api/...` in Network tab | Old build. `git pull` (fixed 2026-11-11), hard-reload, check `localStorage['muster-api-url']` is `/api` or unset. |
| `EADDRINUSE :::4390` / `:4000` / `:5173` | Previous process still alive: `Get-NetTCPConnection -LocalPort 4390 \| % { Stop-Process -Id $_.OwningProcess }`. |
| `esbuild` / `rollup` "host platform mismatch" | `node_modules` copied from another OS. Delete `node_modules` in that tree and `npm ci` again. |
| `npm ci` fails on a native module (node-gyp) | Install Visual Studio Build Tools (C++ workload) and retry; report which module. |
| `npm run sim` → `Cannot find module …/bin/stacksim.mjs` | You are inside `muster-api`; run from `C:\ces`. |
| Run assessment → 409 `ENGINE_NEEDS_WINDOWS` | You are not on Windows (or `CES_ENGINE_LOCAL` not set on a Windows box where auto-detect failed). Set `$env:CES_ENGINE_LOCAL=1` before `npm run dev` and retry. |
| Run assessment stays `queued` | API is not on Windows or `CES_ENGINE_LOCAL=0`: start the runner (window 4) or set `CES_ENGINE_LOCAL=1`. |
| Runner: `login failed (401)` / `403 ROLE_MATRIX` | Account must be `bhd_operator` in the tenant (dev: `runner@contoso.local`). Check `npm run seed:dev:win` ran. |
| Run assessment → `engine_unavailable` with ran = failed | The simulator is not serving `muster-partial` on 4390, or PowerShell execution policy blocks the spawned script. Check window 3, then `Get-ExecutionPolicy -List`. |
| CRLF diffs on every file in `git status` | Clone was made with autocrlf=true. `git config core.autocrlf false; git rm -r --cached .; git reset --hard`. |
| `scheduler.test.ts` fails once | Known timing-sensitive test; rerun. Everything else failing is real. |

---

## 11. Related docs

- `docs/ENVIRONMENTS.md` — environment matrix and config names
- `docs/CONVENTIONS.md`, `docs/NAMING-CONVENTION.md` — code/commit conventions
- `ces-muster/muster-api/.env.example` — every setting with its meaning
- `ces-muster/muster-api/scripts/smoke-postgres.ts` — what "working" means end to end
- `tenant-stacksim/VENDORED-FROM-KIT.md` — where the simulator came from and how to refresh it
- Project docs (Claude project): `45-windows-laptop-setup-2026-11-11.md` (kit + runner on a Windows box), `44-architecture-decisions-2026-11-11.md` (ADR-01…06)
