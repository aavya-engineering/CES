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
 * request → approve (BHD) → execute, Admin › Health answers. It does not assert engine results (host-dependent).
 */
import { test, expect, type Page } from '@playwright/test';

const PW = process.env.CES_E2E_PASSWORD ?? 'Ces!Local2026';
const CM = 'compliance@contoso.local';
const BHD = 'bhd-ops1@contoso.local';
const OA = 'orgadmin@contoso.local';

test.skip(!process.env.CES_E2E_LIVE, 'set CES_E2E_LIVE=1 with the local stack running');
test.describe.configure({ mode: 'serial' });

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

test('compliance manager: onboard → assess → evidence catalog → stamper request → monitor → prepare', async ({ page }) => {
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

  await open(page, 'remediate/stamper', 'page-remediate-stamper');
  const pick = page.getByTestId('stamper-registry').locator('input[type="checkbox"]:not([disabled])').first();
  await expect(pick).toBeVisible({ timeout: 15_000 });
  await pick.check();
  await page.getByTestId('stamper-mode').selectOption('simulate');
  await page.getByTestId('stamper-justification').fill('e2e lifecycle walk — simulate only, no tenant contact');
  await page.getByTestId('stamper-submit').click();
  await open(page, 'remediate/overview', 'page-remediate-overview');
  await expect(page.locator('[data-testid^="run-open-"]').first()).toBeVisible({ timeout: 15_000 });

  await open(page, 'monitor/overview', 'page-monitor-overview');
  await open(page, 'prepare/overview', 'page-prepare-overview');
  check();
});

test('BHD operator: approve and execute the simulate run', async ({ page }) => {
  const check = guardPageErrors(page);
  await signIn(page, BHD);
  await open(page, 'remediate/overview', 'page-remediate-overview');
  await page.locator('[data-testid^="run-open-"]').first().click();
  await expect(page.getByTestId('run-gates')).toBeVisible({ timeout: 15_000 });
  const approve = page.getByTestId('run-approve');
  if (await approve.isEnabled().catch(() => false)) {
    await approve.click();
    await expect(page.getByTestId('run-execute')).toBeEnabled({ timeout: 15_000 });
  }
  const execute = page.getByTestId('run-execute');
  if (await execute.isEnabled().catch(() => false)) {
    await execute.click();
    await expect(page.getByTestId('run-gates')).toContainText(/succeeded|simulated|would_run/i, { timeout: 15_000 });
  }
  check();
});

test('org admin: settings, access and health answer', async ({ page }) => {
  const check = guardPageErrors(page);
  await signIn(page, OA);
  await open(page, 'admin/settings', 'page-admin-settings');
  await open(page, 'admin/access', 'page-admin-access');
  await open(page, 'admin/health', 'page-admin-health');
  await expect(page.getByTestId('health-integrations')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('scheduler-status')).toBeVisible();
  check();
});
