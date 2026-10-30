#!/usr/bin/env bash
# CES Platform — Root Start Script (Linux / macOS / WSL)
set -euo pipefail
cd "$(dirname "$0")"

command -v docker >/dev/null 2>&1 || { echo "ERROR: Docker is not installed or not in PATH."; exit 1; }

if [ ! -f .env ]; then
  echo "[ces] .env not found. Generating .env from .env.example with random cryptographic secrets..."
  cp .env.example .env
  rnd() { openssl rand -hex 24; }
  sed -i.bak \
    -e "s/^POSTGRES_PASSWORD=$/POSTGRES_PASSWORD=$(rnd)/" \
    -e "s/^APP_DB_PASSWORD=$/APP_DB_PASSWORD=$(rnd)/" \
    -e "s/^JWT_SECRET=$/JWT_SECRET=$(openssl rand -hex 48)/" \
    .env && rm -f .env.bak
  chmod 600 .env
  echo "[ces] Created .env with random secrets."
  echo "[ces] Please edit .env to review INITIAL_ADMIN_EMAIL or other variables, then re-run ./start.sh"
  exit 0
fi

mkdir -p output
echo "[ces] Building and starting CES platform containers..."
docker compose up -d --build

echo "[ces] Containers launched. Checking status:"
docker compose ps
echo ""
echo "[ces] Follow logs with: docker compose logs -f api"
echo "[ces] Web portal will be available at: http://${HTTP_BIND:-localhost}:${HTTP_PORT:-8080}"
echo "[ces] First administrator credentials will be saved in: ./output/initial-admin.txt"
