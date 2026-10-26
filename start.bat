@echo off
REM CES Platform — Root Start Script for Windows (Docker Desktop)
cd /d "%~dp0"

docker version >nul 2>&1
if errorlevel 1 (
  echo ERROR: Docker Desktop is not running or Docker is not installed.
  echo Please open Docker Desktop, ensure the engine is started, and try again.
  pause
  exit /b 1
)

if not exist .env (
  echo [ces] Generating .env with secure random secrets...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; function Rnd([int]$bytes) { $b = New-Object byte[] $bytes; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString('x2') }) }; (Get-Content .env.example) -replace '^POSTGRES_PASSWORD=$', ('POSTGRES_PASSWORD=' + (Rnd 24)) -replace '^APP_DB_PASSWORD=$', ('APP_DB_PASSWORD=' + (Rnd 24)) -replace '^JWT_SECRET=$', ('JWT_SECRET=' + (Rnd 48)) | Set-Content -Encoding ascii .env"
  echo [ces] Created .env with random secrets.
  echo [ces] Opening .env in Notepad. Set INITIAL_ADMIN_EMAIL, save, and run start.bat again.
  notepad .env
  exit /b 0
)

if not exist output mkdir output

echo [ces] Building and starting CES containers...
docker compose up -d --build
if errorlevel 1 (
  echo.
  echo [ces] Docker Compose failed to start.
  pause
  exit /b 1
)

echo.
echo ===================================================================
echo [ces] CES Platform is starting!
echo [ces] Web Portal: http://localhost:8080
echo [ces] Initial Admin password: .\output\initial-admin.txt
echo ===================================================================
echo.
pause
