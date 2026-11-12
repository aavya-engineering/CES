const path = require('path');
const L = require('./lib');
const { p, runs, h1, h2, h3, bullet, num, nums, muted, note, code, br, table, cover, toc, build, write } = L;

const c = [];
c.push(...cover('CES — Installation Guide', 'Windows 10/11 developer machine: clone, install, run, verify', 'Aavya Engineering for Blue Heron Defense · platform state: master, 12 November 2026 · local development only, demo data'));
c.push(note('Status of this guide: every step was executed on macOS with the same scripts on 11 November 2026; the Windows-specific lines are marked ⚠ until the first Windows run is reported. Keep the troubleshooting table at the end current — add every error you hit.'));
c.push(br());
c.push(...toc());

c.push(h1('1. What you get'));
c.push(p('A complete local CES platform on one laptop: the Muster portal, the muster-api, a PostgreSQL 16 database, the tenant simulator (a fake Microsoft 365 / Azure tenant) and, optionally, the tenant runner. Everything listens on localhost only; nothing talks to a real tenant.'));
c.push(table(['Process', 'Folder', 'Port', 'Start command'], [
  ['muster-api (Express + Prisma)', 'ces-muster\\muster-api', '4000', 'npm run dev'],
  ['Muster portal (Vite SPA)', 'ces-muster', '5173', 'npm run dev'],
  ['Tenant simulator (stacksim)', 'tenant-stacksim', '4390', 'npm run sim (from the repo root)'],
  ['Tenant runner (optional)', 'ces-muster\\muster-api', '—', 'npm run runner'],
  ['PostgreSQL 16', '—', '5432', 'Docker Desktop or the EDB installer'],
], [3000, 2600, 900, 2860]));
c.push(p('The one thing a Windows machine adds over a Mac: Assess › Run assessment executes the engine in-process, because the registry\u2019s read commands are Windows PowerShell. On macOS/Linux the same button queues the job for a runner.'));

c.push(h1('2. Prerequisites (one time)'));
c.push(table(['Tool', 'Version', 'Notes'], [
  ['Git for Windows', 'latest', 'During install choose “Checkout as-is, commit as-is”; we also force it on the clone. Enable long paths.'],
  ['Node.js', '24.x', 'nodejs.org → 24 LTS/Current. Confirm with node -v and npm -v. CI runs 24; engines allow ≥ 18.'],
  ['PowerShell', '5.1 (built in) or 7', 'Scripts pass -ExecutionPolicy Bypass per call; no global policy change.'],
  ['PostgreSQL 16', '16.x', 'Option A: Docker Desktop (recommended). Option B: EDB installer — remember the postgres password and add C:\\Program Files\\PostgreSQL\\16\\bin to PATH.'],
  ['Visual Studio Build Tools', 'only if npm ci fails on a native module', 'Not expected; the lockfiles resolve to prebuilt binaries on win32-x64.'],
], [2400, 2000, 4960]));
c.push(p('Open PowerShell (not cmd) for every command below.'));

c.push(h1('3. Clone'));
c.push(...code(['git config --global core.longpaths true', 'cd C:\\', 'git clone -c core.autocrlf=false -c core.longpaths=true https://github.com/aavya-engineering/CES.git ces', 'cd C:\\ces', 'git log --oneline -1']));
c.push(runs([{ text: 'Why autocrlf=false: ', bold: true }, 'the repo contains .sh scripts, JSON fixtures with SHA-256 checksums and Prisma migrations; CRLF conversion would change checksums and break npm run catalog:check.']));
c.push(runs([{ text: 'Why C:\\ces: ', bold: true }, 'Vite and Prisma paths get long; keep the root short and avoid OneDrive-synced folders (file locking breaks tsx watch).']));

c.push(h1('4. PostgreSQL'));
c.push(h2('Option A — Docker Desktop'));
c.push(...code(['docker run -d --name ces-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=muster_db -p 5432:5432 postgres:16', 'docker exec -it ces-pg psql -U postgres -d muster_db -c "select version();"']));
c.push(h2('Option B — EDB installer'));
c.push(...code(['psql -U postgres -c "CREATE DATABASE muster_db;"']));
c.push(p('Two connection strings are used on purpose (least privilege; see scripts\\bootstrap-app-role.sql):'));
c.push(bullet([{ text: 'Migrations ', bold: true }, 'run as the superuser: postgresql://postgres:postgres@localhost:5432/muster_db']));
c.push(bullet([{ text: 'The API ', bold: true }, 'runs as muster_app (no BYPASSRLS): postgresql://muster_app:devpass@localhost:5432/muster_db. The API refuses to start if DATABASE_URL points at a superuser.']));

c.push(h1('5. Install dependencies'));
c.push(p('The repository is four npm trees. ces-muster and muster-api are not root workspaces, so install each one.'));
c.push(...code(['cd C:\\ces', 'npm ci', 'cd C:\\ces\\ces-muster;            npm ci', 'cd C:\\ces\\ces-muster\\muster-api; npm ci', 'cd C:\\ces\\tenant-stacksim;       npm ci']));
c.push(p('Use npm ci, never npm install, so package-lock.json stays as committed. npm 11 (ships with Node 24) only runs install scripts that are approved; the root package.json already approves esbuild, better-sqlite3 and fsevents. Expect npm audit noise: the known items are tracked in scripts/audit-gate.mjs.'));

c.push(h1('6. Configure and migrate the API'));
c.push(...code(['cd C:\\ces\\ces-muster\\muster-api', 'Copy-Item .env.example .env']));
c.push(p('Edit .env — only these lines matter for development:'));
c.push(...code(['DATABASE_URL=postgresql://muster_app:devpass@localhost:5432/muster_db', 'JWT_SECRET=<any long random string>   # node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"', 'PORT=4000', '# optional: MONITOR_SCHEDULER=1   CES_ENGINE_LOCAL=1|0']));
c.push(p('Run migrations as the superuser, create the app role, generate the Prisma client:'));
c.push(...code(['$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/muster_db"', 'npx prisma migrate deploy', '# Docker (PowerShell 7):', 'docker exec -i ces-pg psql -U postgres -d muster_db -v ON_ERROR_STOP=1 -v app_password="\'devpass\'" -f - < scripts\\bootstrap-app-role.sql', '# EDB (psql on PATH):', '# psql -U postgres -d muster_db -v ON_ERROR_STOP=1 -v app_password="\'devpass\'" -f scripts\\bootstrap-app-role.sql', 'Remove-Item Env:DATABASE_URL', 'npx prisma generate']));
c.push(note('⚠ On PowerShell 5.1 the “< file” redirection does not exist. Use: Get-Content scripts\\bootstrap-app-role.sql -Raw | docker exec -i ces-pg psql -U postgres -d muster_db -v ON_ERROR_STOP=1 -v app_password="\'devpass\'"'));
c.push(p('Re-run migrate deploy + the bootstrap SQL after every pull that adds a migration (the bootstrap is idempotent and re-grants on new tables). Current migrations: 001–025.'));

c.push(h1('7. Seed the demo accounts'));
c.push(...code(['cd C:\\ces\\ces-muster\\muster-api', 'npm run seed:dev:win']));
c.push(p('Password for every account: Ces!Local2026 (override with $env:DEV_PASSWORD). Local only — never run this against a shared or customer database.'));
c.push(table(['Account', 'Tenant', 'Role'], [
  ['admin@bhd.local', 'Blue Heron Defense', 'platform admin (no customer data — PB-01)'],
  ['operator@bhd.local · operator2@bhd.local', 'Blue Heron Defense', 'BHD operator'],
  ['bhd-ops1@contoso.local · bhd-ops2@contoso.local · runner@contoso.local', 'Contoso Defense (demo)', 'BHD operator (runner = the account the Windows runner polls with)'],
  ['orgadmin@contoso.local', 'Contoso Defense (demo)', 'org admin'],
  ['compliance@contoso.local', 'Contoso Defense (demo)', 'compliance manager'],
  ['itsec@contoso.local', 'Contoso Defense (demo)', 'IT security admin'],
  ['reviewer@contoso.local', 'Contoso Defense (demo)', 'evidence reviewer'],
  ['approver@contoso.local', 'Contoso Defense (demo)', 'senior approver'],
  ['assessor@c3pao.local', 'Contoso Defense (demo)', 'assessor (read-only)'],
  ['prime@contoso.local · sub@contoso.local', 'Contoso Defense (demo)', 'prime / sub (engine roles)'],
], [3800, 2400, 3160]));

c.push(h1('8. Run'));
c.push(p('Three PowerShell windows (a fourth for the runner, optional):'));
c.push(...code(['# 1 — API', 'cd C:\\ces\\ces-muster\\muster-api; npm run dev        # http://localhost:4000, GET /api/admin/health', '', '# 2 — Portal', 'cd C:\\ces\\ces-muster; npm run dev                   # http://localhost:5173 (proxies /api and /auth → :4000)', '', '# 3 — Simulator (needed for Assess › Run assessment)', 'cd C:\\ces; npm run sim                              # builds, creates scenario muster-partial, serves :4390', '', '# 4 — Runner (optional; exercises the queue path)', 'cd C:\\ces\\ces-muster\\muster-api', '$env:CES_API_URL=\'http://localhost:4000/api\'; $env:CES_RUNNER_EMAIL=\'runner@contoso.local\'; $env:CES_RUNNER_PASSWORD=\'Ces!Local2026\'', 'npm run runner -- --once                            # one pass; drop --once to poll every 30 s']));
c.push(p('Open http://localhost:5173 and sign in as compliance@contoso.local. If the portal says it cannot reach the API, run once in the browser console: localStorage.setItem(\'muster-api-url\',\'/api\') and reload.'));
c.push(p('On a Windows machine the API runs discovery in-process, so the runner\u2019s queue is normally empty. Start the API with $env:CES_ENGINE_LOCAL=\'0\' to force jobs onto the queue and watch the runner pick them up — that is also what a macOS/Linux API does by default.'));

c.push(h1('9. Verify (five minutes)'));
c.push(...code(['cd C:\\ces\\ces-muster\\muster-api', 'npm test                      # vitest, in-memory DB (scheduler.test.ts may be flaky under load)', 'npm run catalog:check         # evidence catalog release 0 validates against its schema', 'npm run smoke:postgres        # throwaway tenant; every slice writes+reads through RLS; runner round trip; 403 probes', 'cd C:\\ces\\ces-muster; npm test', 'CES_E2E_LIVE=1 npm run test:e2e:live   # PowerShell: $env:CES_E2E_LIVE=\'1\'; npm run test:e2e:live']));
c.push(p('Expected: smoke: every slice wrote and read against Postgres (tenant Smoke xxxxxxxx), and the lifecycle walk 5/5.'));
c.push(p('In the portal (Contoso tenant):'));
c.push(...nums(['Onboard › Scope — boundary confirmed (org admin).', [{ text: 'Assess › Run assessment ', bold: true }, 'with slug muster-partial. On Windows the engine runs in-process and spawns powershell.exe for the registry reads → expect ran > 0 and failed < ran, then a run with an SPRS score. ⚠ This is the step nobody has executed on Windows yet — please paste the stats into the project thread.'], 'Evidence › NIST catalog loads 14 definitions for AC.L2-3.1.1.', 'Remediate › Stamper — request a get-only simulate run as bhd-ops1, execute as bhd-ops2.', 'Administration › System health (as a BHD operator) shows DB ok, scheduler off, and the runner\u2019s last claim if you ran it.']));

c.push(h1('10. Daily loop'));
c.push(...code(['cd C:\\ces; git pull', '# if package-lock changed in any tree → npm ci there', '# if prisma/migrations changed → section 6: migrate deploy + bootstrap SQL + prisma generate']));
c.push(p('Commit and push from your own machine; nothing in CI pushes. CI runs the root suites, the Muster suites, the dependency gate and the Postgres smoke on every PR. Run npm run smoke:postgres locally before pushing API changes.'));

c.push(h1('11. Troubleshooting'));
c.push(table(['Symptom', 'Cause / fix'], [
  ['Could not find Prisma Schema / Missing script: seed:dev:win', 'Wrong folder. API scripts run from ces-muster\\muster-api; sim from the repo root.'],
  ['permission denied for table _prisma_migrations', 'You ran migrate deploy as muster_app. Set $env:DATABASE_URL to the postgres URL for migrations only (section 6).'],
  ['API exits at start: connected as superuser / BYPASSRLS', '.env points at postgres. Use the muster_app URL.'],
  ['JWT_SECRET error at start', '.env not copied or the secret is empty.'],
  ['Prisma schema validation P1012', 'Pull again — a schema comment issue was fixed on 12 Nov; or you edited schema.prisma with /** */ comments (use //).'],
  ['Portal: every page 404 / /api/api/… in the Network tab', 'Old build. git pull, hard-reload, and check localStorage[\'muster-api-url\'] is /api or unset.'],
  ['EADDRINUSE :::4390 / :4000 / :5173', 'A previous process is still alive: Get-NetTCPConnection -LocalPort 4390 | % { Stop-Process -Id $_.OwningProcess }'],
  ['esbuild / rollup “host platform mismatch”', 'node_modules copied from another OS. Delete node_modules in that tree and npm ci again.'],
  ['npm ci fails on a native module (node-gyp)', 'Install Visual Studio Build Tools (C++ workload) and retry; report which module.'],
  ['npm warn install-scripts … not yet covered by allowScripts', 'npm 11 skipped an install script. The root package.json approves esbuild/better-sqlite3/fsevents; for another package: npm install-scripts approve <pkg> then npm ci.'],
  ['npm run sim → Cannot find module …/bin/stacksim.mjs', 'You are inside muster-api; run from C:\\ces.'],
  ['Run assessment → 409 ENGINE_NEEDS_WINDOWS', 'You are not on Windows (or auto-detect failed). Set $env:CES_ENGINE_LOCAL=\'1\' before npm run dev and retry.'],
  ['Run assessment stays queued', 'API is not on Windows or CES_ENGINE_LOCAL=0: start the runner (window 4) or set CES_ENGINE_LOCAL=1.'],
  ['Run assessment → engine_unavailable with ran = failed', 'The simulator is not serving muster-partial on 4390, or PowerShell execution policy blocks the spawned script. Check window 3, then Get-ExecutionPolicy -List.'],
  ['Runner: login failed (401) / 403 ROLE_MATRIX', 'The account must be a bhd_operator in the tenant (dev: runner@contoso.local). Check that the seed ran.'],
  ['CRLF diffs on every file in git status', 'The clone was made with autocrlf=true: git config core.autocrlf false; git rm -r --cached .; git reset --hard'],
  ['scheduler.test.ts fails once', 'Known timing-sensitive test; rerun. Anything else failing is real.'],
], [3800, 5560]));

c.push(h1('12. Related documents'));
c.push(bullet('docs/DEV-SETUP-WINDOWS.md — this guide in Markdown (kept in step)'));
c.push(bullet('docs/USER-GUIDE.md, docs/NEW-JOINER-TRAINING.md — what to do once it runs'));
c.push(bullet('docs/handover/CES-Deployment-Guide-Server.docx — the demo / production server'));
c.push(bullet('ces-muster/muster-api/.env.example — every setting with its meaning'));
c.push(bullet('ces-muster/muster-api/scripts/smoke-postgres.ts — what “working” means end to end'));

write(build(c, { title: 'CES — Installation Guide (Windows developer machine)', description: 'Clone, install, run and verify the CES platform on Windows 10/11', headerText: 'CES — Installation Guide · Windows developer machine · Aavya for Blue Heron Defense · local development only' }), path.join(__dirname, 'CES-Installation-Guide-Windows.docx'));
