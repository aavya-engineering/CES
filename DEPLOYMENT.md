# CES platform: deployment guide

| | |
|---|---|
| **Package** | `CES-platform-2026-10-27-v2.zip`, prepared by Aavya engineering |
| **Code level** | ces-muster `bb911f7` (Sprint 1: S1.4, S1.8, S1.9 demo feedback, S1.10 fixes, DEP-01). CES monorepo `7fd9663` (`wk2-integration-check`). ces-tenant as of 2026-10-24 |
| **What gets deployed** | The CES portal (sign-in, Home / Portfolio, CES-Shared, Engagements, Muster, Platform administration), muster-api and its PostgreSQL database |
| **Not deployed by this package** | Stamper, AdminOps, EvidenceOps, Evidence Collector, Planner. Their code is in the repository, but no container is defined for them yet |
| **Audience** | The engineer who creates the new repository from a Windows laptop and puts the build on a server |

> **Confidential.** The code is Blue Heron Defense proprietary (see `LICENSE` and `TERMS.md`). Rules for handling it:
> - Keep the new repository **private** and give access only to people BHD has approved.
> - Do not put this code, or any secret, on a public service.

---

## 1. What is in the zip

```
ces-platform/                 ← this folder becomes the new repository
  DEPLOYMENT.md               ← this guide
  Dockerfile                  ← builds two images: api and web
  .dockerignore, .gitignore, .gitattributes
  docker/
    api-entrypoint.sh         ← migrations, least-privilege DB role, seed, first admin, start API
    nginx.conf                ← serves the portal; forwards /api, /auth, /portal to the API
  deploy/
    docker-compose.yml        ← db + api + web
    .env.example              ← settings template (secrets are generated, never committed)
    start.sh / stop.sh        ← Linux server
    start.bat / stop.bat      ← Windows laptop (local test)
    make-env.ps1              ← used by start.bat to create .env
  ces-muster/                 ← portal (React) + muster-api (Express, Prisma)
  ces-shared/, ces-tenant/    ← libraries muster-api needs at build time
  ces-stamper/, ces-ao/, ces-eo/, ces-ec/, ces-planner/, docs/, scripts/ …  ← rest of the CES workspace
```

**How it runs:**
- **db** (PostgreSQL 16) and **api** (muster-api, port 4000) are on an internal Docker network only.
- **web** (nginx) is the only container that publishes a port: `8080` by default.
- The browser talks only to **web**; nginx forwards API calls to **api** on the same address.
- On every start the API applies new database migrations and connects as `muster_app`. This is a least-privilege role: not a superuser, and row-level security is enforced. The API refuses to start as a superuser.

```
Browser ──HTTPS──► TLS proxy (Caddy/nginx/LB) ──HTTP──► web:8080 (nginx)
                                                     ├─ /            → portal files
                                                     └─ /api /auth   → api:4000 ──► db:5432
```

---

## 2. Before you start

### On the Windows laptop
- **Git for Windows:** https://git-scm.com/download/win. Accept the defaults; the line-ending settings are handled by `.gitattributes`.
- **A Git host account** where you can create a **private** repository (GitHub, GitLab or Azure DevOps). Which host and organisation to use: **TBD, confirm with BHD.**
- **SSH client**, to reach the server. Windows 10/11 has `ssh` built in.
- *Optional, only for a local test:* **Docker Desktop**, https://www.docker.com/products/docker-desktop/. Choose the WSL 2 option, then wait for **Engine running**.

### The server
| Item | Minimum |
|---|---|
| OS | Ubuntu 22.04 or 24.04 LTS, x86_64 (other Linux distributions with Docker also work) |
| Size | 2 vCPU, 4 GB RAM, 30 GB disk |
| Software | Docker Engine 24+ with the `docker compose` plugin, and Git |
| Outbound internet during the build | Docker Hub, `registry.npmjs.org`, `binaries.prisma.sh`, `deb.debian.org` |
| Inbound | 443 (HTTPS) from your users. 22 (SSH) from admins only. **Do not** open 8080, 4000 or 5432 to the internet |
| DNS | A name for the portal, for example `ces.example.com`, pointing at the server |

> **Compliance decisions this guide cannot make.** Because CES handles CMMC / CUI work, BHD has to decide these before real customer data goes on any server. The PRD references are given for each:
> - Where CES is hosted: SYS-NFR-18, the deployment decision record.
> - Who may administer it: SYS-NFR-14, US-person access list.
> - FIPS-validated encryption in transit and at rest: SYS-NFR-04.
> - Backup RPO/RTO: SYS-NFR-07.
>
> Until those are decided, use the server for **review and test data only**.

---

## 3. Part A — create the new repository (Windows)

1. Unzip `CES-platform-2026-10-27-v2.zip` to a short path, for example `C:\ces\`. You get `C:\ces\ces-platform\`.
2. On your Git host, create a **new private, empty repository**, for example `ces-platform`. Do **not** add a README, licence or .gitignore there.
3. Open **Git Bash** (or PowerShell) and run:

   ```bash
   cd /c/ces/ces-platform            # PowerShell: cd C:\ces\ces-platform
   git init -b main
   git add .
   git status                        # deploy/.env and node_modules must NOT be listed
   git commit -m "CES platform: initial import (ces-muster 8bc2206, Sprint 1 S1.4 + S1.8 + S1.9 + DEP-01)"
   git remote add origin <URL of the new repository>
   git push -u origin main
   git tag v2026.10.27 && git push origin v2026.10.27
   ```

4. Protect the repository on the Git host:
   - Require pull requests to `main`.
   - Give access only to the agreed people.
   - Turn on secret scanning if the host offers it.

**Check:** the repository web page shows these at the top level: `DEPLOYMENT.md`, `Dockerfile`, `deploy/`, `docker/`, `ces-muster/`, `ces-shared/`, `ces-tenant/`.

---

## 4. Part B (optional) — test on the Windows laptop first

1. Start Docker Desktop and wait for **Engine running**.
2. Double-click **`deploy\start.bat`**. The first run creates `deploy\.env` with random secrets and opens it in Notepad.
3. In Notepad, set `INITIAL_ADMIN_EMAIL=` to your e-mail address, save, and close.
4. Double-click **`deploy\start.bat`** again. The first build takes **10–20 minutes**.
5. Open **http://localhost:8080**. The first administrator's one-time password is in **`deploy\output\initial-admin.txt`**.
6. To stop, run **`deploy\stop.bat`**. To start again, run `start.bat`; your data is kept.
7. To delete everything and start over, run this in `deploy\`, then `start.bat`:

   ```bash
   docker compose --env-file .env down -v
   del output\initial-admin.txt
   ```

---

## 5. Part C — deploy on the server

All of this runs on the server, over SSH.

### 5.1 Install Docker and Git (once)
```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER      # then log out and back in
docker compose version             # must print v2.x
```

### 5.2 Get the code
Use a read-only **deploy key** or access token for the private repository. Do not use a personal password.
```bash
sudo mkdir -p /opt/ces && sudo chown $USER /opt/ces
git clone <URL of the new repository> /opt/ces/ces-platform
cd /opt/ces/ces-platform
git checkout v2026.10.27
```

### 5.3 Configure
```bash
cd /opt/ces/ces-platform/deploy
./start.sh                 # first run only: creates .env with random secrets (chmod 600) and stops
nano .env                  # set INITIAL_ADMIN_EMAIL; for a TLS proxy on this server also set HTTP_BIND=127.0.0.1
```

| Setting in `deploy/.env` | Meaning |
|---|---|
| `POSTGRES_PASSWORD` | Database superuser password. Used only for migrations at start-up. Generated |
| `APP_DB_PASSWORD` | Password of `muster_app`, the role the API runs as. Generated |
| `JWT_SECRET` | Signs sign-in tokens. Generated. Changing it signs everyone out |
| `INITIAL_ADMIN_EMAIL` | First platform administrator. Created **once**, on an empty database |
| `INITIAL_TENANT_NAME` | Organisation that the first admin belongs to (default `Blue Heron Defense`) |
| `HTTP_PORT` / `HTTP_BIND` | Where the portal listens (default `0.0.0.0:8080`). Use `127.0.0.1` behind a TLS proxy on the same server |
| `CES_VERSION` | Image tag, for example `v2026.10.27` |
| `ANTHROPIC_API_KEY` | Optional. Without it the interview uses the static question set |
| `PUBLIC_URL` | The address users open, e.g. `https://ces.example.com`. Used in password-reset e-mails |
| `SMTP_URL` / `MAIL_FROM` | Outbound e-mail for **Forgot password**, e.g. `smtps://user:pass@smtp.example.com:465`. Empty = no e-mail; an admin resets passwords in **Users** |
| `JWT_EXPIRES_IN` | Sign-in token lifetime, default `30m`. Active users get a fresh token automatically; the portal signs out after 30 minutes without activity |

**Keep `.env` safe.** Only the deploy user should be able to read it. Back it up with the database (§8), because without it the stored data cannot be reached.

### 5.4 Start
```bash
./start.sh                         # builds the images (10–20 min the first time) and starts
docker compose logs -f api         # wait for: "[ces] muster-api starting on port 4000"
```

What the API does on start:
- Waits for the database.
- Applies migrations `001`–`013`.
- Creates or refreshes the `muster_app` role and its grants.
- Loads the CES-Shared reference content: 50 evidence archetypes, 450 mappings and 107 rules. On later starts it skips content that is already there.
- If there are no users yet, creates the first administrator and writes the one-time password to `deploy/output/initial-admin.txt`.

---

## 6. HTTPS (required for anything beyond a private test)

The `web` container serves plain HTTP. Put TLS in front of it. Choose **one** of these options:

**Option 1 — Caddy on the server** (automatic Let's Encrypt certificates):
1. Set `HTTP_BIND=127.0.0.1` in `.env` and run `./start.sh`.
2. Install Caddy: https://caddyserver.com/docs/install.
3. Write `/etc/caddy/Caddyfile`:

   ```
   ces.example.com {
       reverse_proxy 127.0.0.1:8080
       header Strict-Transport-Security "max-age=31536000"
   }
   ```

4. Run `sudo systemctl reload caddy`, then open `https://ces.example.com`.

**Option 2 — an existing load balancer or reverse proxy:**
- Terminate TLS 1.2+ on it.
- Forward to `http://<server>:8080`.
- Pass `X-Forwarded-For` and `X-Forwarded-Proto`.
- Restrict port 8080 so only the proxy can reach it.

> If BHD requires FIPS-validated TLS (SYS-NFR-04), the TLS terminator must run in FIPS mode. **TBD with BHD.**

---

## 7. First sign-in and users

1. Read the password: `cat /opt/ces/ces-platform/deploy/output/initial-admin.txt`.
2. Sign in at the portal. You are asked to choose a new password.
3. Delete the file: `rm deploy/output/initial-admin.txt`.
4. Go to **Platform / Administration → Users** and create:
   - A **second platform administrator**. This is required: an administrator cannot publish their own CES-Shared draft, so a different administrator has to.
   - **BHD operator** accounts, which run engagements and see Home / Portfolio.
5. Each new user gets a one-time password and must change it at first sign-in.

> **Demo data.** `npm run seed:demo-portfolio` creates five engagements labelled **DEMO-…**. It is for review laptops only. **Do not run it on a shared or production server.**

---

## 8. Backup and restore

**Back up.** Run daily from the server's crontab. Keep copies off the server and keep `deploy/.env` with them.
```bash
cd /opt/ces/ces-platform/deploy
docker compose --env-file .env exec -T db pg_dump -U postgres -Fc muster_db > /opt/ces/backup/muster_db-$(date +%F).dump
```

**Restore** into a stopped API:
```bash
docker compose --env-file .env stop api web
docker compose --env-file .env exec -T db pg_restore -U postgres -d muster_db --clean --if-exists < /opt/ces/backup/muster_db-YYYY-MM-DD.dump
./start.sh
```

Test a restore at least once before going live. Retention and RPO/RTO: **TBD with BHD** (SYS-NFR-05, SYS-NFR-07).

---

## 9. Updating to a new version

Developers merge to `main` and tag a release, for example `v2026.11.02`. Then on the server:

```bash
cd /opt/ces/ces-platform
# take a backup first (§8)
git fetch --tags && git checkout v2026.11.02
sed -i 's/^CES_VERSION=.*/CES_VERSION=v2026.11.02/' deploy/.env
cd deploy && ./start.sh             # rebuilds; new migrations are applied automatically
```

**Roll back:**
1. Check out the previous tag.
2. Set `CES_VERSION` back.
3. Run `./start.sh`.

**Database migrations only move forward.** If the new version applied a migration, roll back by also restoring the backup taken before the update.

---

## 10. Check that it works

- [ ] `docker compose ps` shows `db` healthy, and `api` and `web` running.
- [ ] `curl -s http://127.0.0.1:8080/` returns the portal HTML.
- [ ] `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8080/api/portfolio` returns **401**: the API is reached and asks for sign-in.
- [ ] Sign in as the first admin and change the password.
- [ ] **CES-Shared → 110 Requirements** lists 110 rows. **Standard Evidence Catalog** shows 50.
- [ ] Create the second admin and an operator. Sign in as the operator; **Home / Portfolio** opens (empty until engagements exist).
- [ ] In `docker compose logs api`, the line `connected as muster_app` appears and there is no superuser warning.
- [ ] Ports 4000 and 5432 are **not** reachable from outside: `nc -zv <server> 4000` fails.
- [ ] The portal opens over **HTTPS** with a valid certificate.

---

## 11. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `set POSTGRES_PASSWORD in .env` | `.env` is missing or empty. Run `./start.sh` once to create it |
| Build fails at `npm ci` or `prisma generate` | The server has no outbound access to `registry.npmjs.org` or `binaries.prisma.sh`. Open them for the build |
| Sign-in page says the API is not reachable | `docker compose logs api`. Usually still migrating, or a bad `APP_DB_PASSWORD` after `.env` was changed. Do not change DB passwords in `.env` on an existing database |
| `PLATFORM_ADMIN_FENCED` for an admin | Expected. Platform administrators have no access to customer data (BHD role review) |
| Every user gets "too many attempts" | The proxy is not passing `X-Forwarded-For`. Fix the proxy. `MUSTER_TRUST_PROXY=1` is already set for the bundled nginx |
| No `initial-admin.txt` | Users already exist, or `INITIAL_ADMIN_EMAIL` was empty on the first start. Create a user with: `docker compose exec -e SEED_PASSWORD='<temp>' api sh -c "cd /app/ces-muster/muster-api && npx tsx scripts/seed.ts --email you@example.com --role platform_admin"` |
| Windows: `start.bat` closes at once | Docker Desktop is not running, or the path has non-ASCII characters. Use `C:\ces\` |

---

## 12. Known limits of this build (Sprint 1)

These are open items, not defects of the deployment:
- **Forgot password** sends a reset link (valid 30 minutes, single use) only when `SMTP_URL` is set. Without e-mail, an administrator resets passwords in **Users**.
- **Single API instance only:** the sign-in attempt counter is held in memory.
- **Tenant Registration and Contract Tests are not built yet:** they are marked "Planned" in the menu (releases S1.7 and S1.6).
- **Home / Portfolio readiness:** Stamper, AdminOps and EvidenceOps show **TBD** until BHD agrees a formula. The rules are in `ces-muster/muster-api/src/services/portfolioService.ts`.
- **Live Microsoft tenant access is off by default.** Turning it on needs the app registration and consent steps in `ces-muster/docs/`; it is not part of this deployment.
- Reminders and nudges are recorded but not sent; only password-reset e-mail uses `SMTP_URL`.

## 13. Open decisions (TBD)

- Hosting location and the deployment decision record (SYS-NFR-18).
- The US-person admin list (SYS-NFR-14).
- FIPS mode for TLS and disk encryption (SYS-NFR-04).
- Backup RPO/RTO and retention (SYS-NFR-05, SYS-NFR-07).
- The Git host and organisation for the new repository, and who gets access.
- Whether Stamper, AdminOps and EvidenceOps join this deployment, and how.
