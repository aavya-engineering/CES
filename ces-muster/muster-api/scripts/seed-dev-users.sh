# SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
# SPDX-License-Identifier: LicenseRef-BHD-Proprietary
# CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
# Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
# Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
# Submitting a change to this repository means you accept TERMS.md.
# Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
# See LICENSE and TERMS.md.

# seed-dev-users.sh — LOCAL DEVELOPMENT ONLY (2026-11-10). Creates one account per
# platform role with a KNOWN password so a developer can sign in as every role.
# Never run against a shared or customer environment: deployments use
# scripts/seed-users.ts (random one-time passwords, deploy/users.seed.json).
#
#   cd ces-muster/muster-api && bash scripts/seed-dev-users.sh
#
# Idempotent: re-running resets each account's password and role (scripts/seed.ts).
# Two tenants: "Blue Heron Defense" (platform side) and "Contoso Defense (demo)"
# (a customer). platform_admin is fenced from customer data (PB-01) — use the
# bhd_operator account to work engagements.
set -euo pipefail
cd "$(dirname "$0")/.."
PW="${DEV_PASSWORD:-Ces!Local2026}"
seed() { npx tsx scripts/seed.ts --email "$1" --password "$PW" --tenant "$2" --role "$3" >/dev/null && printf '  %-34s %-20s %s\n' "$1" "$3" "$2"; }
echo "Seeding dev users (password for all: $PW)"
seed admin@bhd.local               "Blue Heron Defense"     platform_admin
seed operator@bhd.local            "Blue Heron Defense"     bhd_operator
seed operator2@bhd.local           "Blue Heron Defense"     bhd_operator
# Decision pending with BHD (doc 43, I12): every route scopes by the user's tenant, so a BHD
# operator must hold an account INSIDE the customer tenant to approve/run Stamper there. Until a
# cross-tenant BHD role exists, the dev seed gives Contoso two BHD operators and a runner identity.
seed bhd-ops1@contoso.local        "Contoso Defense (demo)" bhd_operator
seed bhd-ops2@contoso.local        "Contoso Defense (demo)" bhd_operator
seed runner@contoso.local          "Contoso Defense (demo)" bhd_operator
seed orgadmin@contoso.local        "Contoso Defense (demo)" org_admin
seed compliance@contoso.local      "Contoso Defense (demo)" compliance_manager
seed itsec@contoso.local           "Contoso Defense (demo)" it_security_admin
seed reviewer@contoso.local        "Contoso Defense (demo)" evidence_reviewer
seed approver@contoso.local        "Contoso Defense (demo)" senior_approver
seed assessor@c3pao.local          "Contoso Defense (demo)" assessor_read_only
seed prime@contoso.local           "Contoso Defense (demo)" prime
seed sub@contoso.local             "Contoso Defense (demo)" sub
echo "Done. Sign in at the portal with any e-mail above and the password shown."
