# SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
# SPDX-License-Identifier: LicenseRef-BHD-Proprietary
# CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
# Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
# Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
# Submitting a change to this repository means you accept TERMS.md.
# Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
# See LICENSE and TERMS.md.

# seed-dev-users.ps1 — Windows twin of seed-dev-users.sh (LOCAL DEVELOPMENT ONLY).
#   cd ces-muster\muster-api; npm run seed:dev:win        (or: powershell -File scripts\seed-dev-users.ps1)
# Same accounts, same password ($env:DEV_PASSWORD overrides). Idempotent.
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$pw = if ($env:DEV_PASSWORD) { $env:DEV_PASSWORD } else { 'Ces!Local2026' }
function Seed([string]$email, [string]$tenant, [string]$role) {
  npx tsx scripts/seed.ts --email $email --password $pw --tenant $tenant --role $role | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "seed failed for $email" }
  "{0,-34} {1,-20} {2}" -f $email, $role, $tenant
}
"Seeding dev users (password for all: $pw)"
Seed 'admin@bhd.local'          'Blue Heron Defense'     'platform_admin'
Seed 'operator@bhd.local'       'Blue Heron Defense'     'bhd_operator'
Seed 'operator2@bhd.local'      'Blue Heron Defense'     'bhd_operator'
Seed 'bhd-ops1@contoso.local'   'Contoso Defense (demo)' 'bhd_operator'
Seed 'bhd-ops2@contoso.local'   'Contoso Defense (demo)' 'bhd_operator'
Seed 'runner@contoso.local'     'Contoso Defense (demo)' 'bhd_operator'
Seed 'orgadmin@contoso.local'   'Contoso Defense (demo)' 'org_admin'
Seed 'compliance@contoso.local' 'Contoso Defense (demo)' 'compliance_manager'
Seed 'itsec@contoso.local'      'Contoso Defense (demo)' 'it_security_admin'
Seed 'reviewer@contoso.local'   'Contoso Defense (demo)' 'evidence_reviewer'
Seed 'approver@contoso.local'   'Contoso Defense (demo)' 'senior_approver'
Seed 'assessor@c3pao.local'     'Contoso Defense (demo)' 'assessor_read_only'
Seed 'prime@contoso.local'      'Contoso Defense (demo)' 'prime'
Seed 'sub@contoso.local'        'Contoso Defense (demo)' 'sub'
"Done. Sign in at the portal with any e-mail above and the password shown."
