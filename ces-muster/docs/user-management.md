# Users, roles and permissions (RBAC-01)

**Status:** built 2026-10-24 on branch `RBAC-01-users-roles-api` (stacked on `UI-01-sign-in-screen`), Aavya. Not merged, not pushed.
**Basis:** BHD role review 2026-10-22 (PB-01 roles, PB-03 separation of duties, PB-10 audit log); decision 2026-10-24: keep the four roles and add `platform_admin`.

## Roles

| Role | Who | May do |
|---|---|---|
| `platform_admin` (new) | Blue Heron Defense staff | Manage users and roles; read the audit log. **No access to customer data, no operator or approver power** |
| `bhd_operator` | Blue Heron Defense staff | Run engagements: discovery, live access, plan push, results, delivery, nudges |
| `prime` | Prime contractor | Its engagement and subcontractors; discovery; plan push |
| `sub` | Contractor being assessed | Answer the interview for its own organisation |
| `assessor_read_only` | C3PAO assessor / reviewer | Read engagements, sessions, contracts, plan status |

The full permission list is `muster-api/src/lib/permissions.ts`, also served at `GET /auth/roles` and shown on **Platform → Roles & permissions**. Each permission names the route that enforces it. `tests/rbac.permissions.test.ts` calls every one of those routes with a token for every role and fails if the list and the routes disagree.

"Compliance lead" (affirms the score, PRD PE-2) is not built: no affirm-score route exists yet. **TBD** — BHD to confirm it becomes a permission on `sub`.

## How a platform administrator is kept out of customer data

1. No customer-data route lists `platform_admin` in `requireRole(...)`.
2. `src/middleware/platformAdminFence.ts`, mounted on `/api` before every router, refuses a `platform_admin` token everywhere except `/api/users` and `/api/audit-events`, including routes that check only the token (`POST /api/sprs/score`) and any future route that forgets a role list.

## API

| Method and path | Who | Notes |
|---|---|---|
| `GET /api/users` | platform_admin | Never returns password hashes |
| `GET /api/users/organizations` | platform_admin | Muster organisations (the `tenants` table — customer organisations, not Microsoft tenants) |
| `POST /api/users` | platform_admin | `{email, role, display_name?, tenant_id \| organization_name, party_id?}`. Returns `temporary_password` **once** |
| `PATCH /api/users/:id` | platform_admin | `{role?, display_name?, disabled?}` |
| `POST /api/users/:id/reset-password` | platform_admin | New temporary password, returned once |
| `GET /api/audit-events?limit=` | platform_admin | Newest first, max 500 |
| `POST /auth/login` | anyone | Adds `must_change_password`; disabled account → 403 `ACCOUNT_DISABLED` (only after the right password) |
| `POST /auth/change-password` | signed in | `{current_password, new_password}`; returns a new token |
| `GET /auth/me` | signed in | Claims + `permissions` |
| `GET /auth/roles` | signed in | Roles and the permission catalogue |

## Rules

- **Temporary password:** 20 characters from the crypto RNG, shown once to the admin. The token issued with it lasts 15 minutes and opens only `/auth/*`; every other route answers 403 `PASSWORD_CHANGE_REQUIRED` until the user sets a new password.
- **Password rule:** 12–128 characters, different from the current one, does not contain the email name. No password history yet (NIST 3.5.8 asks to block reuse) — **TBD**.
- **Guard rails:** an admin cannot change their own role, disable themselves or reset their own password; the last enabled `platform_admin` cannot be demoted or disabled.
- **Audit:** sign-in, failed sign-in, refused sign-in (disabled), user created, organisation created, role changed, disabled, enabled, renamed, password reset, password changed. User changes and their audit rows are written in one transaction: if the audit write fails, the change is rolled back. No password, hash or token is written to the log.
- **Append-only:** migration 009 adds a trigger that refuses UPDATE and DELETE on `audit_events`. The app role (`scripts/bootstrap-app-role.sql`, MG-06) has no TRUNCATE grant.

## Database

| Migration | Change |
|---|---|
| `008_role_platform_admin` | `ALTER TYPE "Role" ADD VALUE 'platform_admin'` (own migration: a new enum value cannot be used in the transaction that adds it) |
| `009_user_admin_audit` | `users`: `display_name`, `disabled_at`, `must_change_password`, `password_changed_at`, `last_login_at`; new table `audit_events` with the append-only trigger |

Checked 2026-10-24: migrations 001–009 applied in order to a fresh PostgreSQL 16; UPDATE and DELETE on `audit_events` raise "audit_events is append-only".

## First platform administrator

```bash
cd muster-api
SEED_PASSWORD='<a strong password>' npx tsx scripts/seed.ts --email <admin email> --role platform_admin
```

Then sign in and create everyone else from **Platform → Users**.

## Limits

1. No MFA and no passkeys yet (PB-05, CMMC 3.5.3). Needed before customer use.
2. No password history (3.5.8) and no expiry policy.
3. No invitation e-mail: the admin passes the temporary password to the user out of band.
4. No session revocation: disabling a user stops new sign-ins; an already-issued token stays valid until it expires (`JWT_EXPIRES_IN`, 8 h by default). Fix with the HttpOnly session work (doc 22 L7).
5. A `platform_admin` belongs to an organisation row like every user (the `tenant_id` column is NOT NULL); the fence, not the organisation, keeps them out of customer data.
6. `bhd_operator` cannot manage users. If BHD wants operators to invite customer users, add `users.invite` scoped to their engagements — **TBD**.
