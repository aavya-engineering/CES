@echo off
cd /d "%~dp0"
docker compose --env-file .env stop
pause
