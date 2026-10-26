@echo off
REM CES Platform — Root Stop Script for Windows
cd /d "%~dp0"
docker compose down
echo [ces] Stopped all containers.
pause
