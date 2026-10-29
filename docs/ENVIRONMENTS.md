# CES environments and configuration

One template per environment, all with the **same keys**. The only file the containers read is
`.env` in the repo root; you create it by copying the template for the environment you are on.

| Environment | Template | Where it runs | How you start it |
|---|---|---|---|
| development | `env/development.env.example` | laptop, Docker Compose | `cp env/development.env.example .env && ./start.sh` |
| development (API only, no Docker) | `env/muster-api.development.env.example` | laptop, `npm run dev` | `cp env/muster-api.development.env.example ces-muster/muster-api/.env` — see the header of that file |
| staging / UAT | `env/staging.env.example` | UAT server behind Nginx + TLS | `cp env/staging.env.example .env` → fill secrets → `sudo ./deploy.sh` |
| production | `env/production.env.example` | prod server behind Nginx + TLS | `cp env/production.env.example .env` → fill secrets → `sudo ./deploy.sh` |

`.env` and every `.env.*` are git-ignored; only the templates under `env/` are committed (they are not dotfiles on purpose, so they are visible and cannot be loaded by mistake).
`deploy/.env.example` and the root `.env.example` are kept for backward compatibility with
`DEPLOYMENT.md`; they are equivalent to the production template.

## What changes per environment

| Key | development | staging | production | Why |
|---|---|---|---|---|
| `CES_ENV` | development | staging | production | Drives log format, Swagger default, banner text |
| `NODE_ENV` | development | production | production | Express/Prisma optimisations; staging must behave like prod |
| `POSTGRES_PASSWORD`, `APP_DB_PASSWORD` | any | random, unique | random, unique | `openssl rand -hex 24` |
| `JWT_SECRET` | any | random, unique | random, unique | `openssl rand -hex 48`; rotating signs everyone out |
| `JWT_EXPIRES_IN` | 8h | 30m | 30m | 30-minute idle sign-out is a product decision |
| `HTTP_BIND` | 0.0.0.0 | 127.0.0.1 | 127.0.0.1 | Servers sit behind the host Nginx; never expose 8080 publicly |
| `PUBLIC_URL` | http://localhost:8080 | https://\<staging host\> | https://\<prod host\> | Goes into password-reset e-mails |
| `SMTP_URL` | empty (mail printed to log) | real | real | "Forgot password" needs it |
| `INITIAL_ADMIN_EMAIL` | vaibhav.pathak@aavya.com | vaibhav.pathak@aavya.com | msutton@blueherondefense.com | First platform admin, created once on an empty DB |
| `LOG_LEVEL` / `LOG_FORMAT` | debug / pretty | info / json | info / json | JSON for log shipping; pretty for humans |
| `API_DOCS` | 1 | 1 | 0 | Swagger UI at `/api-docs` (sign-in required outside development) |
| `CES_VERSION` | dev | git tag | git tag | Rollback = previous tag + `./deploy.sh` |
| `HOST_IP`, `SSLIP_DOMAIN` | unused | server IP / host | server IP / host | Used by `deploy.sh` and `deploy/setup-ssl.sh` |

Keys that are the same everywhere: `POSTGRES_DB`, `INITIAL_TENANT_NAME`, `MAIL_FROM` (change the
display name only), `ANTHROPIC_API_KEY` (optional; empty = static interview).

## How the values reach the code

```
.env  ──► docker-compose.yml (${VAR})  ──► api container env  ──► docker/api-entrypoint.sh
                                                                  └─► muster-api (process.env)
```

* `docker-compose.yml` maps portal-facing names to the API's internal names
  (`PUBLIC_URL` → `MUSTER_PUBLIC_URL`, `SMTP_URL` → `MUSTER_SMTP_URL`, `MAIL_FROM` → `MUSTER_MAIL_FROM`).
* `docker/api-entrypoint.sh` builds `DATABASE_URL` from the DB settings and exports
  `CES_PIPELINE_ROOT`, `CES_TENANT_ROOT`, `MUSTER_TRUST_PROXY=1`.
* `muster-api` reads only `process.env` (`dotenv` loads `muster-api/.env` when run without Docker).

## Named users

The first administrator comes from `INITIAL_ADMIN_EMAIL`. Further accounts are seeded from
`deploy/users.seed.json` (copy `deploy/users.seed.example.json`, git-ignored) on container start;
one-time passwords land in `deploy/output/users-<date>.txt` and every seeded user must change
their password at first sign-in. Re-running is safe: existing e-mails are skipped. Afterwards
manage users in **Platform / Administration → Users**.

## Switching environments at deploy time — checklist

1. `cp env/<env>.env.example .env` on that server (never copy a `.env` between servers).
2. Fill `POSTGRES_PASSWORD`, `APP_DB_PASSWORD`, `JWT_SECRET`, `SMTP_URL`, and check `PUBLIC_URL`,
   `HOST_IP`, `SSLIP_DOMAIN`, `INITIAL_ADMIN_EMAIL`, `CES_VERSION`.
3. `chmod 600 .env`.
4. `sudo ./deploy.sh` (or `./start.sh` on a laptop).
5. Verify: `curl -s https://<host>/healthz` → `{"status":"ok"}`; `curl -s https://<host>/readyz` → DB reachable;
   `docker compose logs api | head` shows `"env":"<env>"` on the start line; sign in.

## Secrets handling

* Never commit `.env`, `deploy/output/`, certificates or `users.seed.json` (all git-ignored).
* Logs redact `authorization`, `cookie`, `password`, `token`, `DATABASE_URL`, `SMTP_URL`.
* Rotate `JWT_SECRET` and DB passwords by editing `.env` and `docker compose up -d` (DB password
  change also needs `ALTER ROLE` — see `DEPLOYMENT.md`).
