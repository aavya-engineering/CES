#!/usr/bin/env bash
# ====================================================================
# CES Platform — ZeroSSL Certificate Installer & Nginx Reloader
# Usage:
#   sudo ./deploy/setup-ssl.sh [path_to_zerossl_zip_or_folder]
# Examples:
#   sudo ./deploy/setup-ssl.sh ~/136.108.118.191.sslip.io.zip
#   sudo ./deploy/setup-ssl.sh ./certs
# ====================================================================
set -euo pipefail

SSL_DIR="/etc/ssl/ces"
NGINX_CONF_SRC="deploy/nginx-zerossl.conf"
NGINX_AVAIL="/etc/nginx/sites-available/ces.conf"
NGINX_ENAB="/etc/nginx/sites-enabled/ces.conf"

if [ "$(id -u)" -ne 0 ]; then
  echo "[-] ERROR: This script must be run as root or with sudo."
  exit 1
fi

SOURCE="${1:-./certs}"

echo "[+] Preparing SSL target directory: ${SSL_DIR}"
mkdir -p "${SSL_DIR}"
chmod 700 "${SSL_DIR}"

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

# If source is a ZIP file, extract it
if [ -f "$SOURCE" ] && [[ "$SOURCE" =~ \.zip$ ]]; then
  echo "[+] Extracting ZeroSSL zip archive: $SOURCE"
  unzip -q -o "$SOURCE" -d "$WORKDIR"
  SOURCE="$WORKDIR"
elif [ -d "$SOURCE" ]; then
  cp -r "$SOURCE"/* "$WORKDIR"/ 2>/dev/null || true
  SOURCE="$WORKDIR"
fi

# Locate certificate files
CERT_FILE=$(find "$SOURCE" -maxdepth 2 -type f \( -name "certificate.crt" -o -name "*bundle.crt" -o -name "*.crt" \) ! -name "ca_bundle.crt" | head -n 1)
BUNDLE_FILE=$(find "$SOURCE" -maxdepth 2 -type f -name "ca_bundle.crt" | head -n 1)
KEY_FILE=$(find "$SOURCE" -maxdepth 2 -type f \( -name "private.key" -o -name "*.key" \) | head -n 1)

if [ -z "$CERT_FILE" ] || [ -z "$KEY_FILE" ]; then
  echo "[-] Missing certificate or private key files in $SOURCE."
  echo "    Expected: certificate.crt, ca_bundle.crt, and private.key"
  exit 1
fi

echo "[+] Found Certificate: $CERT_FILE"
echo "[+] Found Private Key: $KEY_FILE"

if [ -n "$BUNDLE_FILE" ]; then
  echo "[+] Found CA Bundle: $BUNDLE_FILE"
  echo "[+] Creating unified ZeroSSL bundle (certificate.crt + ca_bundle.crt)..."
  cat "$CERT_FILE" "$BUNDLE_FILE" > "${SSL_DIR}/zerossl_bundle.crt"
  cp "$BUNDLE_FILE" "${SSL_DIR}/ca_bundle.crt"
else
  echo "[!] Notice: ca_bundle.crt not found, using certificate directly as bundle."
  cp "$CERT_FILE" "${SSL_DIR}/zerossl_bundle.crt"
fi

cp "$KEY_FILE" "${SSL_DIR}/private.key"
chmod 600 "${SSL_DIR}/private.key"
chmod 644 "${SSL_DIR}/zerossl_bundle.crt"

# Configure Nginx
if command -v nginx >/dev/null 2>&1; then
  echo "[+] Deploying Nginx configuration..."
  cp "$NGINX_CONF_SRC" "$NGINX_AVAIL"
  mkdir -p /etc/nginx/sites-enabled
  ln -sf "$NGINX_AVAIL" "$NGINX_ENAB"
  rm -f /etc/nginx/sites-enabled/default

  mkdir -p /var/www/zerossl/.well-known/pki-validation
  mkdir -p /var/www/certbot/.well-known/acme-challenge
  chmod -R 755 /var/www/zerossl /var/www/certbot

  echo "[+] Testing Nginx configuration..."
  nginx -t

  echo "[+] Reloading Nginx service..."
  systemctl reload nginx || systemctl restart nginx
  echo "[+] Success! Nginx reloaded with valid ZeroSSL certificates."
  echo "[+] Site is live at: https://136.108.118.191.sslip.io"
else
  echo "[!] Nginx is not installed directly on the host."
  echo "    Certificates are saved in ${SSL_DIR} for containerized Nginx (docker-compose.ssl.yml)."
fi
