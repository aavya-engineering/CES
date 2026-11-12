# New joiner training: CES platform, hands-on, five days

Written for the next engineer who joins the CES work at Aavya. You should be able to follow this with the repo and a laptop, no one looking over your shoulder. Where I say "we", I mean the Aavya side of the project; "BHD" is Blue Heron Defense, the customer (Mark is our contact). Read it top to bottom once, then use it as a checklist.

Companion docs you will open from here: `docs/DEV-SETUP-WINDOWS.md` (setup), `docs/USER-GUIDE.md` (screens), `docs/architecture/ces-platform.drawio` (the picture), and in the Claude project: 04 v2 HLD, 05 v2 LLD, 44 ADRs, 09 test strategy.

---

## What this product is, in one breath

A US defence contractor that handles CUI has to meet the 110 requirements of NIST SP 800-171 and prove it to a CMMC assessor. CES is the platform that walks a contractor through that: **Onboard** (who are you, what is in scope) → **Assess** (read the Microsoft 365 / Azure tenant, score it) → **Plan** (what to fix) → **Remediate** (fix it, with approvals) → **Collect Evidence** → **Monitor** (keep it fixed) → **Prepare** (the assessor package). BHD's engineers built the engines that touch the tenant (PowerShell, Graph); we built the portal, the API, the database, the roles, and the runner that connects the two. That split matters for everything below: **the engine needs Windows, the rest does not.**

Vocabulary you will hear constantly: *requirement* (one of 110, e.g. AC.L2-3.1.1), *objective* (one of 320 assessment objectives under them), *SPRS* (the score, -203 to 110), *engagement* (one customer's assessment cycle), *tenant* (their M365/Azure), *simulator* (`tenant-stacksim`, a fake tenant we test against), *runner* (the Windows process that executes engine work), *Stamper / AdminOps / EvidenceOps* (BHD's engines), *DP-2* (two-person rule for changes), *PB-01/PB-02* (platform admin sees no customer data / no secrets in run parameters).

---

## Day 1 — get it running and click through everything

**Morning: set up.** Follow `docs/DEV-SETUP-WINDOWS.md` §1–§7 exactly (Windows) — on a Mac the same steps work with `scripts/seed-dev-users.sh` and `npm run seed:dev`; the only thing that will not work on a Mac is *Run assessment* (explained on Day 4). You are done when:

- `npm run smoke:postgres` prints `smoke: every slice wrote and read against Postgres`
- http://localhost:5173 shows the sign-in page and `compliance@contoso.local` / `Ces!Local2026` gets you in

If something fails, the troubleshooting table at the end of the setup doc lists every error we hit in the first week. Don't spend more than 30 minutes stuck — ask.

**Afternoon: click through as four people.** Sign out and in as each account below and do exactly what the user guide says for that role. The point is to feel the role matrix: things disappear from the sidebar when your role cannot do them.

| Sign in as | You are | Do this |
|---|---|---|
| `orgadmin@contoso.local` | the customer's admin | Onboard › Scope: look at the boundary; Administration › Access: see the Users tab; notice you have **no** Assess / Remediate actions |
| `compliance@contoso.local` | the customer's compliance manager — the main user | Assess › Readiness: press *Run assessment* (on a Mac it says Queued…; that's expected); Evidence › NIST catalog: open AC.L2-3.1.1; Plan › Actions: create one action |
| `bhd-ops1@contoso.local` | a BHD operator working on this customer | Remediate › Stamper: pick one `get` entry, Simulate, Request. Then open it — note it is already *Approved* (get-only runs need no second person) |
| `bhd-ops2@contoso.local` | a second BHD operator | open the same run, *Execute* → "Simulated — the tenant was not touched". Try to do that as ops1: you can't, and the message tells you why |

Write down three things that confused you. Those go into the UX backlog — new eyes are the best test we have.

---

## Day 2 — the screens, properly (user journeys)

Today you learn the product the way a customer experiences it. Each journey below is one customer story; the screens are listed in the order they are used. Do each journey end to end in the demo tenant.

### J1 — "Where do we stand?" (compliance manager)

Onboard › Organizations → Onboard › Scope (confirm the CUI boundary; org_admin does the confirming) → Assess › Readiness (*Run assessment*, wait for the run, read the family table: met / not met / unknown per family and the SPRS number) → Assess › Gaps (sorted by weight; the *Override* drawer is where a human disagrees with the engine, with a reason, and it is audited).

What to notice: the engine never *decides* a requirement is met on its own for the 150 procedural objectives — those come back *unknown* until a person or a document settles them. That is deliberate (guardrail GR1: never overstate).

### J2 — "Fix it" (compliance manager requests, BHD executes)

Plan › Actions (one action per gap, with owner and due date) → Plan › POA&M (what will be fixed later, the assessor sees this) → Remediate › AdminOps (customer-side admin operations: request with parameters, it_security_admin or BHD approves) or Remediate › Stamper (BHD-only configuration changes) → Remediate › Overview (every run, its gates, its status).

What to notice: *Simulate* and *Live* are different modes. Live is refused unless the engagement has live access switched on **and** a consent exists for that area, and it is re-checked at request, execute and claim. In the demo tenant live access is off — try it and read the error.

### J3 — "Prove it" (compliance manager, evidence reviewer)

Collect Evidence › Collect (upload or paste; pick a NIST catalog definition when one exists) → Collect Evidence › Explorer (every item, its SHA-256, its source: `discovery` from the engine, `stamper`/`adminops` from runs, `manual`) → review by `reviewer@contoso.local` (another person — the SoD hint tells the uploader they cannot review their own) → Prepare › SSP (control statements) → Prepare › Packages (build as `compliance@contoso.local`, validate, then sign off as a *different* compliance manager or BHD — the builder cannot sign; `approver@contoso.local` is the senior approver, whose job is POA&M, AdminOps approvals and escalations, not package sign-off) → Prepare › Assessor (what `assessor@c3pao.local` sees: read-only, and they can ask for things).

### J4 — "Keep it that way" (monitor)

Monitor › Overview (*Evaluate now* as `itsec@contoso.local` — only it_security_admin has `execute` in Monitor; or the scheduler when `MONITOR_SCHEDULER=1`) → Monitor › Alerts (acknowledge as anyone with edit; resolve/escalate as `approver@contoso.local`) → Monitor › Activity (the audit trail for this engagement).

### J5 — "Run the shop" (org admin, BHD)

Administration › Settings (engagement details, monitoring cadence) → Access (requests, reviews — a review must be attested by a different admin; Users tab for org-scoped user admin) → System Health (as a BHD operator: DB, integrations, scheduler, when the runner last claimed something).

By the end of Day 2 you should be able to draw the sidebar from memory and say which role can do what on each page. Check yourself against `ces-muster/src/features/portal/lifecycle/rbac.ts` — that file *is* the sidebar's permission table, and the API enforces the same table (`muster-api/src/lib/permissions.ts`; a test fails if they drift).

---

## Day 3 — read the code the way it runs (reverse engineering)

Don't start from the folder tree. Start from one HTTP request and follow it. Open these files side by side and trace **"press Run assessment"**:

1. `ces-muster/src/features/portal/pages/assess/AssessPages.tsx` — find `RunEngineButton`. It calls `assessApi.startRun`.
2. `.../assess/assessApi.ts` — the URL is `engagements/:id/assessments/run`, relative to `getApiBase()` (which ends in `/api`; a bug we fixed once was pages writing `/api/...` themselves).
3. `ces-muster/vite.config.ts` — in dev, `/api` is proxied to `localhost:4000`. In production nginx does the same job.
4. `muster-api/src/app.ts` — find the line that mounts `/api/engagements/:engagementId/assessments`. Read the three middlewares in order: `bearerAuth` (who are you), `requireAction('assess', …)` (may your role do this *kind* of thing — view/edit/approve/execute), then the router.
5. `muster-api/src/middleware/auth.ts` — `requireAction` and `actionFor`. Note `canonicalPath`: that exists because `…/approve/` with a trailing slash used to be classified as `edit` (security finding A1). Security bugs usually look this small.
6. `muster-api/src/routes/assessments.ts` — `r.post('/run', …)`. Read it slowly: it validates the body (zod, `runSchema`), checks the live gate if `mode === 'live'`, decides `local` (Windows → run in-process; else queue an `engine_jobs` row), and either spawns `runSimDiscovery` or returns `202 queued`.
7. `muster-api/src/services/simDiscoveryRun.ts` → `liveSimSession.ts` — this is where `powershell.exe` is spawned with the registry's commands. This is the Windows boundary.
8. `muster-api/src/routes/assessments.ts` again — `landEnvelope`: the result comes back, is validated as a `readiness-result` record, `persistRun` writes `assessment_runs` + 110 results + SPRS, captures become `evidence_items` via `services/runCaptures.ts`.
9. `muster-api/src/lib/prisma.ts` — `withTenant`. Every DB call in the routes goes through it; it sets `app.tenant_id` on the transaction and Postgres row-level security does the rest. If you ever write a query outside `withTenant`, it returns zero rows (fail-closed). That is not a bug.

Now do the same for **"request a Stamper run → approve → execute"** on your own, starting from `RemediatePages.tsx` and ending in `routes/remediation.ts`. Write the call chain down (file → function → next file). Compare with the LLD §4; if you found something the LLD doesn't say, add it there — that's your first doc PR.

**The map, once you have traced two flows:**

```
ces-muster/
  src/features/portal/        the lifecycle portal (what customers use)
    nav.ts, lifecycle/        sidebar, routes, the role matrix (rbac.ts)
    pages/<section>/          one folder per lifecycle section: *Pages.tsx + *Api.ts
    PortalShell.tsx, ui.tsx   shell, shared primitives (PageHeader, Drawer, Toast…)
  src/features/{assessment,interview,plan,readiness,…}   the older Muster single-page flows (still used: interview, SPRS)
  e2e/                        Playwright: offline specs + lifecycle-walk (live stack)
  muster-api/
    src/app.ts                every router mounted with its guards — read this first
    src/routes/               one file per section; thin: validate → guard → withTenant → audit
    src/services/             engine runs, captures, catalog, monitor evaluate/scheduler
    src/runner/               the Windows runner (client, poll loop, executors, bin)
    src/lib/                  prisma/withTenant, audit, permissions, openapi, jwt, childEnv
    src/vendored/ces-shared/  BHD reference data (110 controls, SPRS weights, registry, catalog) — read-only, with SHA notes
    prisma/                   schema + 24 migrations (RLS policies live in SQL, read 004 and 018+)
    scripts/                  seed-dev-users, smoke-postgres, bootstrap-app-role.sql, validate-catalog-rows
    tests/                    vitest; helpers/mockDb.ts is the in-memory DB used by most route tests
tenant-stacksim/              the simulator (vendored from BHD's kit) — `npm run sim` at repo root
ces-stamper, ces-ao, ces-eo, ces-ec, ces-shared, ces-tenant   BHD engines; we read, rarely change
docs/                         repo docs (ADRs, conventions, DEV-SETUP-WINDOWS, this file)
```

**Exercise:** pick any route in `app.ts`, write down (a) which roles can call it, (b) which table it writes, (c) which audit action it records. Then prove (a) with a one-line test in `tests/roleMatrix.test.ts` (copy an existing `denied(...)` line). Run `npx vitest run tests/roleMatrix.test.ts`.

---

## Day 4 — the engine, the runner, and Windows

The part that trips everyone up. Read ADR-02 first (five minutes), then:

- **Why Windows:** BHD's registry of 201 read commands is PowerShell 5.1; the kit refuses Linux (PL-147). On a Mac, *Run assessment* queues a job and nothing executes it — unless a runner is polling.
- **The runner** (`muster-api/src/runner/`): a loop that logs in as a `bhd_operator`, lists engagements, pulls `queued` discovery jobs (and remediation runs if a command is configured), claims each one, executes, posts the result. Start it in a fourth terminal: `npm run runner -- --once` with `CES_API_URL`, `CES_RUNNER_EMAIL=runner@contoso.local`, `CES_RUNNER_PASSWORD`. On a Mac the job will end `failed — engine_unavailable` (no PowerShell). On Windows it ends `done` with a run and evidence.
- **Hands-on on a Windows machine:** setup doc §8, then start the API with `CES_ENGINE_LOCAL=0` so jobs queue even on Windows, and watch the runner pick them up. Then read `src/runner/poll.ts` — it is 100 lines and every branch has a test in `tests/runner.test.ts`. The invariant to remember: *a claimed job always gets a result*, even when the executor crashes or the API rejects the body.
- **What is not built yet:** live discovery on the runner (needs consent grants on the wire) and the remediation lane's actual command (needs BHD's kit CLI). If Mark has answered by the time you read this, those are good second tasks.

**Exercise:** on Windows, run the lifecycle walk against the real stack: `CES_E2E_LIVE=1 npm run test:e2e:live` in `ces-muster`. Then open `e2e/lifecycle-walk.spec.ts` and add one assertion to the compliance spec (for example that the Gaps page lists at least one row after the run). Keep it green.

---

## Day 5 — ship a change the way we ship

1. Branch from `master`: `git checkout -b fix/<what>`. Small branches; one concern each.
2. Write the test first when it's API behaviour (`tests/*.test.ts` with `mockDb`), or extend the smoke when it's a DB/RLS behaviour, or the Playwright walk when it's UI behaviour. We learned the hard way that green unit tests don't mean the app works, so for anything a user sees: open it in the browser against the real API before you call it done.
3. `npm test` in the tree you touched, `npm run smoke:postgres` for API changes, `npm run test:e2e:live` for UI changes.
4. Commit messages say *why*, reference the doc or finding (`doc 49 A2`), and keep the two trailer lines you'll see in `git log`.
5. Push, open a PR against `master`, read the CI result yourself (three jobs: root suites, Muster suites, Postgres smoke). Vaibhav merges.
6. If you changed behaviour, update the doc that describes it in the same PR (LLD for API behaviour, user guide for screens, deployment guide for deployment). Docs that lag code are worse than no docs.

Things we do not do without an explicit yes from Vaibhav/Mark: push to `master` directly, deploy to the demo server, touch a real tenant, add dependencies with native builds, run `npm install` (use `npm ci`).

**Graduation exercise (half a day):** the seven legacy routers (`/api/plan`, `/api/discovery`, `/api/live`, `/api/engagements`, …) have no role-matrix guard. Add `requireAction(...)` to one of them (`/api/plan` is a good first), with a denial probe in `roleMatrix.test.ts`, and open the PR. You'll touch `app.ts`, `permissions.ts`, a test, and the LLD. That is the whole loop.

---

## Where to look when something is wrong

- API logs in the terminal running `npm run dev` (requests are logged without bodies; errors with stack in dev).
- `GET http://localhost:4000/api/admin/health` as a BHD operator — DB, scheduler, last runner claim.
- A 403 with `code: ROLE_MATRIX` is the matrix saying no; `NOT_APPROVER`, `STAMPER_BHD_ONLY`, `RUN_NOT_APPROVED`, `LIVE_DISABLED`, `RUNNER_MISMATCH` are route rules — the message says which.
- Zero rows where you expect data: you are outside `withTenant` or signed in to the wrong tenant.
- `npx prisma studio` (as the `postgres` user URL) to look at tables directly in dev — never against a shared database.

## Who to ask

Vaibhav (delivery lead, Aavya) for scope and priorities; Mark (BHD) through Vaibhav for anything about the engines, tenants, kit, or production hosting.
