// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// UI-02 + RBAC-01: the portal end to end in a real browser. muster-api is
// intercepted (page.route): nothing leaves the machine.
import { test, expect, type Page } from '@playwright/test';
import { openApp } from './helpers';

function fakeJwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.sig`;
}
const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;

async function signInAs(page: Page, token: string) {
  await page.route('**/auth/login', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204 })
      : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token }) })
  );
  await page.goto('/');
  await page.getByLabel('Email address').fill('someone@bhd.test');
  await page.getByLabel('Password', { exact: true }).fill('any-password');
  await page.getByTestId('signin-submit').click();
}

test('offline: CES-Shared reference pages show the real data', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('nav-shared-requirements').click();
  await expect(page.getByTestId('stat-req-total')).toContainText('110');
  await page.getByTestId('req-search').fill('3.1.22');
  await expect(page.locator('[data-testid="req-table"] tbody tr')).toHaveCount(1);
  await page.getByRole('button', { name: 'AC.L1-3.1.22' }).click();
  await expect(page.getByTestId('req-detail')).toContainText('publicly accessible');

  await page.getByTestId('nav-shared-sprs').click();
  await expect(page.getByTestId('stat-w5')).toContainText('44');
  await expect(page.getByTestId('stat-total-deduction')).toContainText('313');
  await page.getByTestId('sprs-tab-families').click();
  await expect(page.getByTestId('sprs-families')).toContainText('Access Control');

  await page.getByTestId('nav-shared-evidence').click();
  await expect(page.getByTestId('stat-archetypes')).toContainText('50');

  await page.getByTestId('nav-shared-mapping').click();
  await expect(page.getByTestId('stat-mapped')).toContainText('1');

  // Deep link + back button.
  await page.goBack();
  await expect(page.getByTestId('page-evidence')).toBeVisible();
  await page.goto('/#/shared/sprs');
  await expect(page.getByTestId('page-sprs')).toBeVisible();
});

test('platform admin: lands on Users, no customer screens, adds a user and sees the temporary password once', async ({ page }) => {
  const users = [
    { id: 'me', email: 'admin@bhd.test', display_name: 'Admin', role: 'platform_admin', tenant_id: 't1', organization: 'BHD', party_id: null, disabled: false, must_change_password: false, last_login_at: null, created_at: '2026-10-01T00:00:00Z' },
  ];
  let posted: unknown = null;
  await page.route('**/api/users/organizations', (r) => r.fulfill({ json: { organizations: [{ id: 't1', name: 'BHD' }] } }));
  await page.route('**/api/users', async (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204 });
    if (r.request().method() === 'POST') {
      posted = r.request().postDataJSON();
      return r.fulfill({ status: 201, json: { user: { ...users[0], id: 'u2', email: 'new@acme.test', role: 'sub', must_change_password: true }, temporary_password: 'Abcde-Fghij-Kmnop-Qrstu' } });
    }
    return r.fulfill({ json: { users } });
  });
  await signInAs(page, fakeJwt({ sub: 'me', role: 'platform_admin', name: 'Admin', exp: inAnHour() }));

  await expect(page.getByTestId('page-users')).toBeVisible();
  await expect(page.getByTestId('nav-muster-situation')).toHaveCount(0);
  await expect(page.getByTestId('nav-home')).toHaveCount(0);
  // A typed-in customer route falls back to the admin landing page.
  await page.goto('/#/muster/assessment');
  await expect(page.getByTestId('page-users')).toBeVisible();

  await page.getByTestId('users-add').click();
  await page.getByTestId('add-user-email').fill('new@acme.test');
  await page.getByTestId('add-user-role').selectOption('sub');
  await page.getByTestId('add-user-submit').click();
  await expect(page.getByTestId('temp-password-value')).toHaveText('Abcde-Fghij-Kmnop-Qrstu');
  expect(posted).toEqual({ email: 'new@acme.test', role: 'sub', tenant_id: 't1' });
  await page.getByTestId('temp-password-done').click();
  await expect(page.getByText('Abcde-Fghij-Kmnop-Qrstu')).toHaveCount(0);
});

test('temporary password: sign-in leads to Choose your password, then Home', async ({ page }) => {
  const finalToken = fakeJwt({ sub: 'u2', role: 'sub', name: 'Acme IT', exp: inAnHour() });
  let changeBody: unknown = null;
  await page.route('**/auth/change-password', (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204 });
    changeBody = r.request().postDataJSON();
    return r.fulfill({ json: { token: finalToken } });
  });
  await signInAs(page, fakeJwt({ sub: 'u2', role: 'sub', email: 'it@acme.test', pwd_change_required: true, exp: inAnHour() }));

  await expect(page.getByRole('heading', { name: 'Choose your password' })).toBeVisible();
  await expect(page.getByTestId('portal')).toHaveCount(0);
  await page.getByTestId('cp-current').fill('Abcde-Fghij-Kmnop-Qrstu');
  await page.getByTestId('cp-new').fill('a long new password');
  await page.getByTestId('cp-confirm').fill('a long new password');
  await page.getByTestId('cp-submit').click();
  await expect(page.getByTestId('page-home')).toBeVisible();
  await expect(page.getByTestId('header-account')).toContainText('Contractor');
  expect(changeBody).toEqual({ current_password: 'Abcde-Fghij-Kmnop-Qrstu', new_password: 'a long new password' });
});

test('narrow screen: sidebar opens from the menu button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openApp(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByTestId('nav-shared-requirements').click();
  await expect(page.getByTestId('page-requirements')).toBeVisible();
});

test('R1: assessment objectives and the full SPRS methodology', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('nav-shared-objectives').click();
  await expect(page.getByTestId('stat-obj-total')).toContainText('320');
  await expect(page.getByTestId('stat-obj-reqs')).toContainText('110');
  await page.getByTestId('obj-tab-requirements').click();
  await page.getByRole('button', { name: 'AC.L1-3.1.1', exact: true }).click();
  // Exact requirement only: 3.1.1 must not pull in 3.1.10 – 3.1.19.
  await expect(page.getByTestId('obj-req-chip')).toBeVisible();
  const rows = page.locator('[data-testid="obj-table"] tbody tr');
  await expect(rows).toHaveCount(6);
  await expect(rows.first()).toContainText('authorized users are identified');

  await page.getByTestId('nav-shared-requirements').click();
  await page.getByTestId('req-search').fill('3.5.3');
  await page.getByRole('button', { name: 'IA.L2-3.5.3' }).click();
  await expect(page.getByTestId('req-detail-partial')).toContainText('3 points');
  await expect(page.getByTestId('req-detail-objectives')).toContainText('Assessment objectives');

  await page.getByTestId('nav-shared-sprs').click();
  await page.getByTestId('sprs-tab-methodology').click();
  await expect(page.getByTestId('sprs-ratio')).toContainText('88 of 110');
  await expect(page.getByTestId('sprs-partial')).toContainText('SC.L2-3.13.11');
  await expect(page.getByTestId('sprs-prohibited').locator('li')).toHaveCount(6);
});

test('R1: requirement details on a phone width do not widen the page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openApp(page);
  await page.goto('/#/shared/requirements');
  await page.getByTestId('req-search').fill('3.5.3');
  await page.getByRole('button', { name: 'IA.L2-3.5.3' }).click();
  await expect(page.getByTestId('req-detail-objectives')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
