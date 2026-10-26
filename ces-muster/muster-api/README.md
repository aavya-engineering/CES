# muster-api

Pure-Node (Express + Prisma) backend for Muster. Brokers all tenant-facing work;
the SPA never touches tenants, sessions, tokens, or registries.

## Signing in from the SPA

Since UI-01 (2026-10-24) Muster **opens on a sign-in page** (`src/features/auth/SignInPage.tsx`).
It calls the existing `POST /auth/login` (bcrypt check against the `users` table, JWT
signed with `JWT_SECRET`) and stores only the returned token under `muster-jwt`:
in `sessionStorage` by default, or in `localStorage` when **Keep me signed in** is
ticked. An expired token is dropped on read; any 401 drops it too. The page also
offers **Work offline**, which keeps the offline-first path (interview, scoring,
export) with no account; the Plan tab's own sign-in form still works from there.
Full behaviour, limits and open decisions: [`../docs/sign-in.md`](../docs/sign-in.md).

`POST /auth/login` (UI-01):
- `200 {token}` on success.
- `401 {"error":"Invalid credentials"}` for an unknown email **and** a wrong password.
  Both run one bcrypt compare, so neither the body nor the timing shows whether an
  account exists.
- `429` with `Retry-After` after `MUSTER_LOGIN_MAX_FAILURES` (default 5) failures for
  one account, or `MUSTER_LOGIN_MAX_FAILURES_PER_CLIENT` (default 20) from one client
  address, within `MUSTER_LOGIN_WINDOW_MS` (default 15 min). Counters are in memory,
  per process.

There is no dev bypass and no token in config. For local use, create an operator once:

```bash
npx tsx scripts/seed.ts --email <operator email> --password <password>   # or SEED_PASSWORD=...
npm run dev   # PORT=4000; CORS allows the Vite origins on localhost:5173/4173
```

Then sign in on the sign-in page (or choose **Work offline** and sign in later from the
header or the Plan tab).

## Test tiers

`npm test` runs the full Vitest suite. Most tests are hermetic (a `mockDb`, no
real Postgres). Three tests in `tests/rls.test.ts` are **live-Postgres RLS
tests**, env-gated on `DATABASE_URL` (`describe.skipIf(!process.env.DATABASE_URL)`).
Without `DATABASE_URL` they report as **skipped** — that is the expected default
board (e.g. "N passed + 3 skipped"), not a failure.

### Running the live RLS tier (H2)

The live tier proves cross-tenant isolation is enforced by Postgres Row-Level
Security, so it MUST run against a **non-superuser role without `BYPASSRLS`** — a
superuser silently disables RLS and the isolation tests would falsely pass
(`.env.example` carries the same warning).

One-time setup, then the one-liner:

```bash
# 1. Apply all migrations AS A SUPERUSER (migration 001 runs
#    `ALTER ROLE postgres BYPASSRLS`, which only a superuser can do), then
#    create the least-privilege app role (MG-06; resolves B13):
DATABASE_URL=postgresql://postgres:<pg-password>@localhost:5432/muster_db npm run migrate:deploy
psql -U postgres -d muster_db -v ON_ERROR_STOP=1 -v app_password="'password'" -f scripts/bootstrap-app-role.sql
#    From here on, connect ONLY as muster_app. The API refuses to start as a
#    superuser or a BYPASSRLS role (src/lib/dbRoleGuard.ts).

# 2. Seed the two-tenant fixture the positive-visibility test needs
#    (idempotent — a no-op once seeded):
DATABASE_URL=postgresql://muster_app:password@localhost:5432/muster_db npm run seed:rls

# 3. The one-liner — run the RLS suite with the live tier active:
DATABASE_URL=postgresql://muster_app:password@localhost:5432/muster_db npm run test:live
```

On Windows PowerShell, set the variable first:

```powershell
# Migrate as the database owner, not the app role (migration 001 needs superuser; onboarding B13).
$env:DATABASE_URL = 'postgresql://postgres:<owner password>@localhost:5432/muster_db'
npm run migrate:deploy
# Create the app role here (MG-06: scripts/bootstrap-app-role.sql; before MG-06, onboarding guide ch. 06).
$env:DATABASE_URL = 'postgresql://muster_app:password@localhost:5432/muster_db'
npm run seed:rls; npm run test:live
```

With `DATABASE_URL` set the three live tests execute instead of skipping:

1. `tenant-A context cannot read tenant-B parties` — isolation (needs no rows).
2. `unscoped plain-db query returns [] and does not throw` — migration 004
   fail-closed (`current_setting('app.tenant_id', true)` is NULL when unset).
3. `withTenant(tenant-B) sees tenant-B parties` — positive visibility; this is
   the one that needs `npm run seed:rls` to have run first.

To run the entire suite (hermetic + live) against Postgres, use
`DATABASE_URL=<app role URL> npm test` after steps 1–2 above.
