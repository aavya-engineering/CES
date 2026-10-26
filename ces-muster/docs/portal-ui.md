# CES portal UI in Muster (UI-02)

**Status:** built 2026-10-24 on branch `UI-02-portal-shell` (stacked on `RBAC-01-users-roles-api` → `UI-01-sign-in-screen`), Aavya. Not merged, not pushed.
**Design source:** Aavya mockups (login, forgot password, Home/Portfolio, CES-Shared overview, 110 Requirements, SPRS Weight Table, Standard Evidence Catalog, Requirement-to-Evidence Mapping, Evaluation Rules, Golden Files, Contract Tests, Manage Tenants, All Engagements, Create Engagement).
**Decisions (Vaibhav, 2026-10-24):** build the portal inside the Muster SPA; mockup look in Muster only; follow the layout but show real data read-only; keep the four roles and add `platform_admin`.

## What changed

| Area | Before | After |
|---|---|---|
| Layout | Muster header + blue step bar | Portal: navy sidebar (role-filtered), top bar with breadcrumbs, help, theme, account menu. Muster's own steps stay as a light tab strip inside the Muster section |
| Theme | CES "Instrument" tokens (sharp, Heron Ink) | Same token names, new values in `src/features/portal/portalTheme.css`: blue primary `#1d5fd6`, 8–16 px radii, navy sidebar; light and dark. `public/ces-ui.css` (canonical copy) not edited; Stamper/AdminOps/EvidenceOps unchanged |
| Sign-in | UI-01 page | Rounded mockup look; **Forgot password** opens its own panel (mockup 2) that says plainly no email is sent and the platform admin resets it; a temporary password leads to **Choose your password** |
| Navigation | Single page with a view state | URL hash routes (`#/shared/requirements`, `#/muster/discovery`): back button and deep links work. A route the role may not open falls back to the role's landing page |
| Landing | Interview | Operator / prime / sub / assessor → Home; platform admin → Users; offline → Muster (unchanged) |

## Screens

| Sidebar item | Data | Notes |
|---|---|---|
| Home | This browser's Muster database | Counts and recent engagements; module launch cards. No portfolio charts: CES records no engagement status, dates or milestones yet |
| CES-Shared → Overview | ces-shared reference + knowledge files | Real counts |
| 110 Requirements | `src/vendored/ces-shared/data/cmmc-l2-controls.reference.json` (new vendored copy, kept byte-identical by `cesSharedSync.ts`) + `sprs-weights.json` | Search, family / level / weight filters, detail panel. Read-only |
| SPRS Weight Table | `sprs-weights.json` | Real weights 5/3/1/0 (44/14/51/1), start 110, floor −203, 313 points at stake; per-family summary. **Not** the mockup's 0.05-style weights or "Add Requirement Weight" |
| Standard Evidence Catalog | `public/knowledge/domain Evidence Archetype Catalog.yaml` (v0.1.0) | 50 archetypes, 13 domains; 45 linked to requirements |
| Requirement-to-Evidence Mapping | `public/knowledge/domain Assessor Evidence Matrix.yaml` (v0.1.0) | **1 of 110** requirements mapped today; the page says so (mockup showed 68) |
| Evaluation Rules | — | **Planned** page: no such object in CES; needs a BHD decision |
| Contracts & Golden Files | Versions from ces-shared `*.contract.ts` (snapshot) | Read-only; tests run in CI, not from the browser |
| Engagements → All Engagements | This browser + `GET /api/engagements` when the role may read | |
| Engagements → Create Engagement | — | Opens Muster → Situation (where an engagement is created today) |
| Engagements → Microsoft Tenant Registration | — | **Planned**: Step 2 of doc 21, waits for BHD decisions 1–3 |
| Muster → Situation … Help | Existing Muster screens | Unchanged behaviour |
| Stamper / AdminOps / EvidenceOps | — | Launch page with the local address (default ports 5002–5004, editable); they keep their own sign-in |
| Platform → Users | `/api/users` | platform_admin only. Add user (temporary password shown once), change role, disable / enable, reset password |
| Platform → Roles & Permissions | `/auth/roles` | Every signed-in user; the matrix muster-api enforces |
| Platform → Audit Log | `/api/audit-events` | platform_admin only |
| Account → Change password | `/auth/change-password` | From the account menu |

## Accessibility and layout

- Keyboard: every control is a button, link or form field; visible focus rings; dialogs move focus to their main button; Escape closes the account menu.
- Screen readers: sidebar is a `nav` with `aria-current="page"`; sections are `aria-expanded`; tables have header cells; errors use `role="alert"`.
- Contrast: values listed at the top of `portalTheme.css` (all text ≥ 4.5:1, UI borders ≥ 3:1).
- Narrow screens (≤ 960 px): sidebar becomes a drawer opened by the ☰ button; filters stack; wide tables scroll inside their card. Checked at 390 px: no page-level horizontal scroll.

## Tests

| Suite | Added |
|---|---|
| `src/features/portal/__tests__/portalData.test.ts` | Navigation by role, hash parsing, reference-data counts (110; 44/14/51/1; 313; family counts), knowledge files |
| `src/features/portal/__tests__/adminPages.test.tsx` | Users page (list, self-protection, add + one-time password, duplicate, 403), change password, must-change state, shell gating and account menu |
| `e2e/portal.spec.ts` | Reference pages in a real browser, admin flow, temporary-password flow, phone width |
| `e2e/sign-in.spec.ts`, `e2e/five-tabs.spec.ts` | Updated for the portal landing and hash routing |

## Known limits

1. One sign-in for Muster only; Stamper, AdminOps and EvidenceOps still have their own (needs service identities, PB-08).
2. Home has no portfolio status, milestones or "last 30 days" figures — no data source exists.
3. Top-bar search and notifications from the mockups are not built (no index or notification source).
4. Fonts stay IBM Plex Sans (already loaded by `ces-ui.css`); the mockups look like Inter. Changing fonts adds another web-font download — BHD/Aavya design call.
5. Dark mode stays the suite default (founder decision 2026-09-07); the mockups are drawn in light mode.
