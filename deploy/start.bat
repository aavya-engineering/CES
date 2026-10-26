@echo off
REM Start (or update) CES on Windows with Docker Desktop. First run creates .env.
cd /d "%~dp0"
docker version >nul 2>&1
if errorlevel 1 (
  echo Docker Desktop is not running. Open it, wait for "Engine running", then try again.
  pause
  exit /b 1
)
if not exist .env (
  powershell -NoProfile -ExecutionPolicy Bypass -File make-env.ps1
  echo Created deploy\.env with random secrets. Set INITIAL_ADMIN_EMAIL in it, save, then run start.bat again.
  notepad .env
  exit /b 0
)
if not exist output mkdir output
docker compose --env-file .env up -d --build
if errorlevel 1 (
  pause
  exit /b 1
)
echo.
echo CES is starting. Open http://localhost:8080 in a minute or two.
echo The first administrator password is in deploy\output\initial-admin.txt
pause
