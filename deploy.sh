#!/usr/bin/env bash
# ====================================================================
# CES Platform — Production Automated Deployment Script
# Domain: 136.108.118.191.sslip.io
# Usage:
#   sudo ./deploy.sh
# ====================================================================
set -euo pipefail
cd "$(dirname "$0")"

echo "===================================================================="
echo " Starting CES Platform Deployment for 136.108.118.191.sslip.io"
echo "===================================================================="

# 1. Check Root / Sudo
if [ "$(id -u)" -ne 0 ]; then
  echo "[-] WARNING: It is recommended to run ./deploy.sh with sudo for Nginx configuration."
fi

# 2. Prerequisites Check
command -v docker >/dev/null 2>&1 || {
  echo "[-] Docker is not installed. Installing Docker Engine..."
  curl -fsSL https://get.docker.com | sh
  usermod -aG docker "${SUDO_USER:-$USER}" || true
}

if ! docker compose version >/dev/null 2>&1; then
  echo "[-] Docker Compose plugin missing. Installing docker-compose-plugin..."
  apt-get update -qq && apt-get install -y -qq docker-compose-plugin
fi

command -v openssl >/dev/null 2>&1 || {
  echo "[-] openssl missing. Installing openssl..."
  apt-get update -qq && apt-get install -y -qq openssl
}

# 3. Setup .env with Cryptographic Secrets
if [ ! -f .env ]; then
  echo "[+] Initializing .env from .env.example..."
  cp .env.example .env
  rnd() { openssl rand -hex 24; }
  sed -i.bak \
    -e "s/^POSTGRES_PASSWORD=$/POSTGRES_PASSWORD=$(rnd)/" \
    -e "s/^APP_DB_PASSWORD=$/APP_DB_PASSWORD=$(rnd)/" \
    -e "s/^JWT_SECRET=$/JWT_SECRET=$(openssl rand -hex 48)/" \
    .env && rm -f .env.bak
  chmod 600 .env
  echo "[+] Generated random passwords for database and JWT."
fi

# Ensure correct host domain and local binding in .env
grep -q "^HOST_IP=" .env || echo "HOST_IP=136.108.118.191" >> .env
grep -q "^SSLIP_DOMAIN=" .env || echo "SSLIP_DOMAIN=136.108.118.191.sslip.io" >> .env
sed -i.bak -e "s/^HTTP_BIND=.*/HTTP_BIND=127.0.0.1/" .env && rm -f .env.bak

# 4. Create Directories
mkdir -p output certs
mkdir -p /var/www/zerossl/.well-known/pki-validation
mkdir -p /var/www/certbot/.well-known/acme-challenge
mkdir -p /etc/ssl/ces
chmod 700 /etc/ssl/ces
chmod -R 755 /var/www/zerossl /var/www/certbot

# 5. Setup SSL / Nginx
if [ ! -f /etc/ssl/ces/zerossl_bundle.crt ] || [ ! -f /etc/ssl/ces/private.key ]; then
  echo "[!] Real ZeroSSL certificates not found yet in /etc/ssl/ces/."
  echo "[+] Generating bootstrap self-signed certificate so Nginx can start immediately..."
  openssl req -x509 -nodes -days 30 -newkey rsa:2048 \
    -keyout /etc/ssl/ces/private.key \
    -out /etc/ssl/ces/zerossl_bundle.crt \
    -subj "/CN=136.108.118.191.sslip.io" >/dev/null 2>&1
  cp /etc/ssl/ces/zerossl_bundle.crt /etc/ssl/ces/ca_bundle.crt
  chmod 600 /etc/ssl/ces/private.key
fi

if command -v nginx >/dev/null 2>&1; then
  echo "[+] Configuring host Nginx reverse proxy..."
  cp deploy/nginx-zerossl.conf /etc/nginx/sites-available/ces.conf
  mkdir -p /etc/nginx/sites-enabled
  ln -sf /etc/nginx/sites-available/ces.conf /etc/nginx/sites-enabled/ces.conf
  rm -f /etc/nginx/sites-enabled/default

  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx || systemctl restart nginx
    echo "[+] Nginx reverse proxy is active."
  else
    echo "[-] Nginx configuration test failed. Please check /etc/nginx/sites-available/ces.conf"
  fi
else
  echo "[!] Nginx is not installed on host. (Run 'apt install nginx' or use docker-compose.ssl.yml)"
fi

# 6. Build and Run Docker Containers
echo "[+] Starting CES platform containers (db, api, web)..."
docker compose up -d --build

echo "[+] Waiting for database and API initialization..."
sleep 5

# Follow API logs briefly to confirm startup
docker compose logs --tail=20 api

echo ""
echo "===================================================================="
echo " DEPLOYMENT STATUS: SUCCESSFUL"
echo "===================================================================="
echo " 🌐 Domain:          https://136.108.118.191.sslip.io"
echo " 🔐 Local Bind:      http://127.0.0.1:8080"
echo " 📄 Admin Password:  Check output/initial-admin.txt"
if [ -f output/initial-admin.txt ]; then
  echo "    Initial Admin:   $(cat output/initial-admin.txt)"
fi
echo ""
echo " 📌 ZERO SSL ACTIVATION NOTE:"
echo " If you just requested your certificate on ZeroSSL:"
echo " 1. Download the zip from ZeroSSL"
echo " 2. Run: sudo ./deploy/setup-ssl.sh /path/to/your-zerossl.zip"
echo "===================================================================="
