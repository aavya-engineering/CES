@echo off
REM CES Platform — Windows Launcher for Containerized SSL
cd /d "%~dp0"

if not exist certs mkdir certs
if not exist certs\zerossl-validation mkdir certs\zerossl-validation
if not exist output mkdir output

if not exist certs\zerossl_bundle.crt (
  echo [!] No ZeroSSL certificate found in .\certs\ yet.
  echo [+] Generating bootstrap self-signed certificate...
  powershell -NoProfile -Command "New-SelfSignedCertificate -DnsName '136.108.118.191.sslip.io' -CertStoreLocation 'cert:\CurrentUser\My' | Out-Null"
  openssl req -x509 -nodes -days 30 -newkey rsa:2048 -keyout certs\private.key -out certs\zerossl_bundle.crt -subj "/CN=136.108.118.191.sslip.io" 2>nul
  copy /Y certs\zerossl_bundle.crt certs\ca_bundle.crt >nul 2>&1
)

echo [+] Starting CES Platform with containerized SSL (ports 80 & 443)...
docker compose -f docker-compose.yml -f docker-compose.ssl.yml up -d --build

echo.
docker compose -f docker-compose.yml -f docker-compose.ssl.yml ps
echo.
echo Application is accessible at:
echo   http://136.108.118.191.sslip.io
echo   https://136.108.118.191.sslip.io
pause
