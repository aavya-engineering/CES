// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

/**
 * Lifecycle walk against a LIVE local stack (project "live" in playwright.config.ts):
 *   muster-api on :4000 with Postgres, `npm run seed:dev` accounts, portal dev server on :5173 (vite proxy).
 * Run:  CES_E2E_LIVE=1 npx playwright test --project=live
 * Skipped entirely unless CES_E2E_LIVE=1, so the default `npm run test:e2e` (offline specs) is unaffected.
 *
 * What it proves (TC-23 in docs 09): sign-in for three roles, every lifecycle section renders without a
 * page error, Run assessment leaves the idle state, the NIST catalog loads, a Stamper simulate run goes
 * request (BHD) → approve (second BHD) → execute, Admin › Health answers. It does not assert engine results (host-dependent).
 */
import { test, expect, type Page } from '@playwright/test';

const PW = process.env.CES_E2E_PASSWORD ?? 'Ces!Local2026';
const CM = 'compliance@contoso.local';
const BHD1 = 'bhd-ops1@contoso.local';
const BHD2 = 'bhd-ops2@contoso.local';
const OA = 'orgadmin@contoso.local';

test.skip(!process.env.CES_E2E_LIVE, 'set CES_E2E_LIVE=1 with the local stack running');
test.describe.configure({ mode: 'serial' });
let runId = ''; // the Stamper run requested in test 1, approved/executed in test 2

async function signIn(page: Page, email: string) {
  await page.goto('/');
  if (await page.getByTestId('header-signout').isVisible().catch(() => false)) { await page.getByTestId('header-signout').click(); }
  await page.getByTestId('signin-email').fill(email);
  await page.getByTestId('signin-password').fill(PW);
  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('portal')).toBeVisible({ timeout: 15_000 });
}

async function open(page: Page, route: string, pageTestId: string) {
  await page.goto(`/#/${route}`);
  await expect(page.getByTestId(pageTestId)).toBeVisible({ timeout: 15_000 });
}

/** Any uncaught page error (React render crash, undefined API shape) fails the walk. */
function guardPageErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return () => expect(errors, 'uncaught page errors').toEqual([]);
}

test('compliance manager: onboard → assess → evidence catalog → monitor → prepare', async ({ page }) => {
  const check = guardPageErrors(page);
  await signIn(page, CM);

  await open(page, 'onboard/scope', 'page-onboard-scope');
  await expect(page.getByTestId('boundary-table')).toBeVisible();

  await open(page, 'assess/readiness', 'page-assess-readiness');
  const start = page.getByTestId('engine-run-start');
  await expect(start).toBeEnabled({ timeout: 15_000 });
  await start.click();
  // Windows host: in-process run → "Engine running…"; elsewhere the job queues for the runner → "Queued…".
  await expect(start).toHaveText(/Engine running…|Queued…/, { timeout: 15_000 });

  await open(page, 'evidence/catalog', 'page-evidence-catalog');
  await expect(page.getByTestId('catalog-table')).toContainText('AC.L2-3.1.1', { timeout: 15_000 });

  await open(page, 'monitor/overview', 'page-monitor-overview');
  await open(page, 'prepare/overview', 'page-prepare-overview');
  check();
});

test('BHD operator 1: request a Stamper simulate run (Stamper is BHD-only — remediate.stamper matrix)', async ({ page }) => {
  const check = guardPageErrors(page);
  await signIn(page, BHD1);
  await open(page, 'remediate/stamper', 'page-remediate-stamper');
  const ids = async () => new Set(await page.locator('[data-testid^="run-open-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!)));
  await expect(page.getByTestId('stamper-registry')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('stamper-runs').or(page.getByText('No Stamper run yet.'))).toBeVisible({ timeout: 15_000 }); // runs list loaded
  const before = await ids();
  // Prefer a `get` entry: read-only, auto-approved (DP-2 second person is for set-commands) — no tenant contact either way.
  const rows = page.getByTestId('stamper-registry').locator('tbody tr');
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  const idx = await rows.evaluateAll((trs) => {
    const pick = (kind: string | null) => trs.findIndex((tr) => { const cb = tr.querySelector<HTMLInputElement>('input[type="checkbox"]'); return !!cb && !cb.disabled && (kind === null || tr.children[2]?.textContent?.trim() === kind); });
    const i = pick('get'); return i >= 0 ? i : pick(null);
  });
  expect(idx, 'a selectable registry entry').toBeGreaterThanOrEqual(0);
  await rows.nth(idx).locator('input[type="checkbox"]').check();
  await page.getByTestId('stamper-mode').selectOption('simulate');
  await page.getByTestId('stamper-justification').fill('e2e lifecycle walk — simulate only, no tenant contact');
  await page.getByTestId('stamper-submit').click();
  await expect(page.getByTestId('stamper-preview')).toContainText(/Request recorded/, { timeout: 15_000 });
  await expect.poll(async () => (await ids()).size, { timeout: 15_000 }).toBeGreaterThan(before.size);
  const added = [...(await ids())].filter((id) => !before.has(id));
  expect(added, 'exactly one new run').toHaveLength(1);
  runId = added[0].replace('run-open-', '');
  check();
});

test('BHD operator 2: approve if needed (second person) and execute the simulate run', async ({ page }) => {
  const check = guardPageErrors(page);
  await signIn(page, BHD2);
  await open(page, 'remediate/overview', 'page-remediate-overview');
  expect(runId, 'run id from the request test').not.toBe('');
  await page.getByTestId(`run-open-${runId}`).click();
  await expect(page.getByTestId('run-gates')).toBeVisible({ timeout: 15_000 });
  // A set-command run waits for a second BHD operator (DP-2); a get-only run arrives already approved.
  const approve = page.getByTestId('run-approve');
  if (await approve.isVisible().catch(() => false)) await approve.click();
  await expect(page.getByTestId('run-execute')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('run-execute').click();
  await expect(page.getByText(/Simulated run recorded|Simulated — the tenant was not touched/).first()).toBeVisible({ timeout: 15_000 });
  check();
});

test('org admin: settings and access answer', async ({ page }) => {
  const check = guardPageErrors(page);
  await signIn(page, OA);
  await open(page, 'admin/settings', 'page-admin-settings');
  await open(page, 'admin/access', 'page-admin-access');
  check();
});

// System Health: not an org_admin group (rbac ORG_ADMIN_ADMIN_GROUPS) and platform_admin is fenced off tenant
// admin routes by the API (PB-01) — bhd_operator is the role both matrices allow. (UI shows the page to
// platform_admin and then renders the API's 403 — open item, see docs 43.)
test('BHD operator: system health answers (DB, integrations, scheduler)', async ({ page }) => {
  const check = guardPageErrors(page);
  await signIn(page, BHD1);
  await open(page, 'admin/health', 'page-admin-health');
  await expect(page.getByTestId('health-integrations')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('scheduler-status')).toBeVisible();
  check();
});
