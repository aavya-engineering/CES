#!/bin/sh
# muster-api start: wait for the database, migrate (as postgres), make sure the
# least-privilege role exists, load CES-Shared content, create the first
# administrator once, then run the API as muster_app (row-level security on).
set -eu
: "${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in deploy/.env}"
: "${APP_DB_PASSWORD:?set APP_DB_PASSWORD in deploy/.env}"
: "${JWT_SECRET:?set JWT_SECRET in deploy/.env}"
export PGPASSWORD="$POSTGRES_PASSWORD"
DB="${POSTGRES_DB:-muster_db}"
HOST="${DB_HOST:-db}"

echo "[ces] waiting for the database..."
until pg_isready -h "$HOST" -U postgres -q; do sleep 1; done

cd /app/ces-muster/muster-api
echo "[ces] applying database migrations..."
DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@${HOST}:5432/${DB}" npx prisma migrate deploy
psql -h "$HOST" -U postgres -d "$DB" -q -v ON_ERROR_STOP=1 -v app_password="'${APP_DB_PASSWORD}'" -f scripts/bootstrap-app-role.sql

export DATABASE_URL="postgresql://muster_app:${APP_DB_PASSWORD}@${HOST}:5432/${DB}"
export PORT=4000 CES_PIPELINE_ROOT=/data/pipeline CES_TENANT_ROOT=/data/tenants
export MUSTER_TRUST_PROXY="${MUSTER_TRUST_PROXY:-1}"

echo "[ces] loading CES-Shared reference content (skips what is already there)..."
npm run --silent seed:ces-shared

USERS="$(psql -h "$HOST" -U postgres -d "$DB" -tAc 'select count(*) from users')"
if [ "$USERS" = "0" ] && [ -n "${INITIAL_ADMIN_EMAIL:-}" ]; then
  echo "[ces] creating the first platform administrator: ${INITIAL_ADMIN_EMAIL}"
  PW="$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)"
  SEED_PASSWORD="$PW" npx tsx scripts/seed.ts --email "$INITIAL_ADMIN_EMAIL" --role platform_admin \
    --tenant "${INITIAL_TENANT_NAME:-Blue Heron Defense}" >/dev/null
  psql -h "$HOST" -U postgres -d "$DB" -q -c "update users set must_change_password = true where email = '$(printf %s "$INITIAL_ADMIN_EMAIL" | sed "s/'/''/g")'"
  umask 077
  printf '%s  %s  (first platform administrator; must change at first sign-in)\n' "$INITIAL_ADMIN_EMAIL" "$PW" > /output/initial-admin.txt
  echo "[ces] its one-time password is in deploy/output/initial-admin.txt on the server"
fi

echo "[ces] muster-api starting on port 4000"
exec npx tsx src/server.ts
