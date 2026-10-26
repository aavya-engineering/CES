#!/usr/bin/env bash
# ====================================================================
# CES Platform — Launch Stack with Containerized ZeroSSL Nginx Proxy
# Usage:
#   ./start-ssl.sh
# ====================================================================
set -euo pipefail
cd "$(dirname "$0")"

mkdir -p certs/zerossl-validation output

# Check if certificates exist in ./certs/
if [ ! -f certs/zerossl_bundle.crt ] || [ ! -f certs/private.key ]; then
  echo "[!] No ZeroSSL certificate found in ./certs/ yet."
  echo "[+] Generating bootstrap certificate so nginx-ssl can start on port 80 & 443..."
  openssl req -x509 -nodes -days 30 -newkey rsa:2048 \
    -keyout certs/private.key \
    -out certs/zerossl_bundle.crt \
    -subj "/CN=136.108.118.191.sslip.io" >/dev/null 2>&1
  cp certs/zerossl_bundle.crt certs/ca_bundle.crt
  chmod 600 certs/private.key
fi

echo "[+] Starting CES Platform with containerized SSL (ports 80 & 443)..."
docker compose -f docker-compose.yml -f docker-compose.ssl.yml up -d --build

echo ""
echo "[+] Container status:"
docker compose -f docker-compose.yml -f docker-compose.ssl.yml ps

echo ""
echo "===================================================================="
echo " CES Platform is running with Dockerized Nginx SSL Reverse Proxy!"
echo " 🌐 URL: http://136.108.118.191.sslip.io  (redirects to HTTPS)"
echo " 🔒 URL: https://136.108.118.191.sslip.io"
echo ""
echo " To install/update your official ZeroSSL certificate:"
echo "   ./load-zerossl.sh /path/to/zerossl.zip"
echo "===================================================================="
