# Creates deploy\.env from .env.example with random secrets (Windows).
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
function Rnd([int]$bytes) { $b = New-Object byte[] $bytes; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { $_.ToString('x2') }) }
(Get-Content .env.example) `
  -replace '^POSTGRES_PASSWORD=$', ('POSTGRES_PASSWORD=' + (Rnd 24)) `
  -replace '^APP_DB_PASSWORD=$', ('APP_DB_PASSWORD=' + (Rnd 24)) `
  -replace '^JWT_SECRET=$', ('JWT_SECRET=' + (Rnd 48)) |
  Set-Content -Encoding ascii .env
