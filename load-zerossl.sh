#!/usr/bin/env bash
# ====================================================================
# CES Platform — Load ZeroSSL Certificate into Dockerized Nginx
# Usage:
#   ./load-zerossl.sh [path_to_zerossl_zip_or_folder]
# Examples:
#   ./load-zerossl.sh ~/136.108.118.191.sslip.io.zip
#   ./load-zerossl.sh ./my-certs/
# ====================================================================
set -euo pipefail
cd "$(dirname "$0")"

SOURCE="${1:-./certs}"

if [ ! -e "$SOURCE" ]; then
  echo "[-] ERROR: Source path '$SOURCE' not found."
  echo "    Usage: ./load-zerossl.sh /path/to/zerossl.zip"
  exit 1
fi

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

# If zip archive, unpack it
if [ -f "$SOURCE" ] && [[ "$SOURCE" =~ \.zip$ ]]; then
  echo "[+] Unpacking ZeroSSL zip archive: $SOURCE"
  unzip -q -o "$SOURCE" -d "$WORKDIR"
  SOURCE="$WORKDIR"
elif [ -d "$SOURCE" ] && [ "$SOURCE" != "./certs" ]; then
  cp -r "$SOURCE"/* "$WORKDIR"/ 2>/dev/null || true
  SOURCE="$WORKDIR"
fi

CERT_FILE=$(find "$SOURCE" -maxdepth 2 -type f \( -name "certificate.crt" -o -name "*bundle.crt" -o -name "*.crt" \) ! -name "ca_bundle.crt" | head -n 1)
BUNDLE_FILE=$(find "$SOURCE" -maxdepth 2 -type f -name "ca_bundle.crt" | head -n 1)
KEY_FILE=$(find "$SOURCE" -maxdepth 2 -type f \( -name "private.key" -o -name "*.key" \) | head -n 1)

if [ -z "$CERT_FILE" ] || [ -z "$KEY_FILE" ]; then
  echo "[-] ERROR: Could not find certificate.crt and private.key in $SOURCE"
  exit 1
fi

mkdir -p certs
echo "[+] Bundling certificate + CA bundle for ZeroSSL..."
if [ -n "$BUNDLE_FILE" ]; then
  cat "$CERT_FILE" "$BUNDLE_FILE" > certs/zerossl_bundle.crt
  cp "$BUNDLE_FILE" certs/ca_bundle.crt
else
  cp "$CERT_FILE" certs/zerossl_bundle.crt
  cp "$CERT_FILE" certs/ca_bundle.crt
fi

cp "$KEY_FILE" certs/private.key
chmod 600 certs/private.key
chmod 644 certs/zerossl_bundle.crt

echo "[+] Reloading Nginx container with new ZeroSSL certificates..."
if docker compose -f docker-compose.yml -f docker-compose.ssl.yml ps | grep -q "ces-nginx-ssl"; then
  docker compose -f docker-compose.yml -f docker-compose.ssl.yml exec nginx-ssl nginx -s reload
  echo "[+] Success! ZeroSSL certificate is active."
  echo "[+] Visit: https://136.108.118.191.sslip.io"
else
  echo "[+] Certificates installed in ./certs/. Start the stack with: ./start-ssl.sh"
fi
