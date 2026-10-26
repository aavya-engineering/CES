#!/usr/bin/env bash
# Start (or update) CES. First run creates .env with random secrets.
set -euo pipefail
cd "$(dirname "$0")"
command -v docker >/dev/null || { echo "Docker is not installed."; exit 1; }
if [ ! -f .env ]; then
  cp .env.example .env
  rnd() { openssl rand -hex 24; }
  sed -i.bak -e "s/^POSTGRES_PASSWORD=$/POSTGRES_PASSWORD=$(rnd)/" -e "s/^APP_DB_PASSWORD=$/APP_DB_PASSWORD=$(rnd)/" -e "s/^JWT_SECRET=$/JWT_SECRET=$(openssl rand -hex 48)/" .env && rm -f .env.bak
  chmod 600 .env
  echo "Created deploy/.env with random secrets. Set INITIAL_ADMIN_EMAIL in it, then run this again."
  exit 0
fi
mkdir -p output
docker compose --env-file .env up -d --build
echo "Starting. Follow the API log with:  docker compose logs -f api"
