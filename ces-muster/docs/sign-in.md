# Muster sign-in (UI-01)

**Status:** built 2026-10-24 on branch `UI-01-sign-in-screen` (Aavya). Not merged, not pushed.
**Design source:** Aavya mockup `1. CES Compliance Security Login.png`, drawn with the CES "Instrument" tokens (`public/ces-ui.css`) instead of the mockup's own colours and photo.

## What the user sees

Muster opens on a sign-in page. It has two parts:

- **Brand panel:** CES name, "Built for the Defense Industrial Base", the four modules (Muster, Stamper, AdminOps, EvidenceOps) with Muster marked "You are signing in here", and the CMMC Level 2 / NIST SP 800-171 Rev. 2 scope.
- **Sign-in card:**

| Control | Behaviour |
|---|---|
| Email & password | Calls `POST /auth/login`. On success the app opens and the header shows "Signed in · <role>" with **Sign out** |
| Keep me signed in | Off (default): token in `sessionStorage`, gone when the tab closes. On: token in `localStorage` until it expires (`JWT_EXPIRES_IN`, 8 h by default) |
| Show / Hide password | Switches the field type; `aria-pressed` reflects the state |
| Forgot password? | Shows: "Muster has no self-service password reset yet. Ask your Blue Heron Defense administrator…" |
| Single sign-on (SSO) tab | Explains that SSO is not set up yet and offers email and password |
| Sign in with Microsoft | Disabled, with the reason under it |
| Work offline without signing in | Opens the app with no account and no network call. The choice lasts for the browser tab. The header then shows "Working offline" with **Sign in** |
| Authorized use only | System-use notice (see open decision 4) |

Error messages: wrong email or password (one message for both), too many failed attempts (429), muster-api not reachable, empty fields (checked before any network call). Errors use `role="alert"` and mark the fields `aria-invalid`.

The page works at phone width (card first, brand panel below) and in light and dark themes.

## What changed in the code

| File | Change |
|---|---|
| `src/features/auth/SignInPage.tsx`, `signIn.css` | New sign-in page |
| `src/shared/api/musterToken.ts` | New: one place to save, read and clear the token; drops expired tokens; fires `muster-auth-changed` |
| `src/shared/api/musterAuth.ts` | Uses `musterToken.ts`; `signInToMuster(email, password, { remember })`; 429 message |
| `src/shared/api/musterApi.ts` | Reads the token through `musterToken.ts` |
| `src/features/app/App.tsx` | Sign-in gate (`currentAccount()`, local check only); header account control |
| `src/features/plan/PlanTab.tsx` | Follows sign-in / sign-out done elsewhere |
| `muster-api/src/routes/auth.ts`, `src/lib/loginAttempts.ts` | No account enumeration (same body, one bcrypt compare for unknown emails); failed-attempt limit with 429 + `Retry-After` |
| `e2e/helpers.ts` + 10 specs | `openApp(page)` passes the sign-in page with "Work offline" |
| Tests | `src/features/auth/__tests__/signInPage.test.tsx` (20), `muster-api/tests/auth.login.hardening.test.ts` (8), `e2e/sign-in.spec.ts` (3) |

The offline-first guarantee (DW#5) holds: the gate decides from local storage only; nothing calls the network until the user presses **Sign in**.

## Limits (known, not hidden)

1. The token is still in web storage, readable by any script on the page. The target (doc 18 §3.2) is an HttpOnly session cookie set by muster-api.
2. The failed-attempt counters are in memory, per muster-api process: a restart clears them and several instances do not share them.
3. The lock is temporary (15 minutes by default). A permanent lock and admin unlock need user management, which Muster does not have.
4. Signing out does not delete assessment data kept in the browser's IndexedDB.
5. Users are still created only with `muster-api/scripts/seed.ts`. There is no sign-up, invitation or password reset.
6. No multi-factor authentication. CMMC 3.5.3 requires MFA for privileged accounts and for network access to non-privileged accounts.

## Open decisions for Blue Heron Defense

| # | Decision | Options | Aavya suggestion |
|---|---|---|---|
| 1 | Is "Work offline" allowed in the hosted product? | Keep for all / only for self-hosted builds / remove | Keep for self-hosted; hide in multi-customer hosting |
| 2 | Identity provider (PRD OQ-12) | Entra ID SSO / passkeys for BHD staff (SYS-FR-07) + password + MFA for customers / other | Passkeys for staff, password + MFA for customers; add Entra SSO later |
| 3 | Sign-out on a shared machine | Keep local data / clear IndexedDB on sign-out | Clear on sign-out in hosted mode |
| 4 | System-use notice text (NIST SP 800-171 3.1.9) | BHD legal text | Placeholder text is in place; BHD to supply the final wording |
| 5 | Product name | "Compliance Execution System" (Muster footer, Planner `PRODUCT_STORY.md`) / "Compliance Evidence System" (Planner `index.html`, mockup) | The page uses "Execution", matching Muster today |
| 6 | Look of the brand panel | CES "Instrument" style (built) / the mockup's photo and rounded style | Instrument style, because `ces-ui.css` is the canonical design source |

## UI-03 (2026-10-24): matched to the wireframe

At Vaibhav's request the page now matches Aavya wireframe `1. CES Compliance Security Login.png`:

- **Left panel** is the wireframe's own artwork, cropped from the wireframe to `public/brand/ces-signin-hero.jpg` (892 × 1024). Its words are repeated as screen-reader text. **Usage rights of this AI-rendered image (Pentagon and Capitol scene) — TBD, BHD to confirm before customer use.**
- **Right card**: shield-and-star mark (`src/features/auth/icons.tsx`), "CES / Compliance Evidence System", "Welcome Back", method tabs with icons, field icons, eye toggle, "Sign In →", OR, "Sign in with Microsoft", "Authorized Use Only" box, "Light Mode ▾" theme menu, soft line background.
- **Product name** is now "Compliance Evidence System" on the sign-in page, the portal sidebar and the Muster footer (decision 2026-10-24).
- **Kept different on purpose:** "Sign in with Microsoft" looks as drawn but is not available; pressing it says so. "Forgot password" keeps wireframe 2's layout but states that no email is sent. "Continue offline without signing in" sits under the card (offline-first).
- **CUI banner:** the purple `CUI` designation bar from `ces-ui.css` is hidden on the sign-in page only (no CUI is shown there; the wireframe has none). It returns on every screen after sign-in. One CSS rule (`body.ces-signin::before`) — remove it if BHD wants the bar on this page too.
