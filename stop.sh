#!/usr/bin/env bash
# CES Platform — Root Stop Script
cd "$(dirname "$0")"
docker compose down
echo "[ces] Stopped all containers."
