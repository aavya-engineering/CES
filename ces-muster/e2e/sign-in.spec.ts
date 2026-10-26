// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// UI-01: Muster opens on the sign-in page. Offline: POST /auth/login is
// intercepted in the browser, nothing leaves the machine.
import { test, expect } from '@playwright/test';

function fakeJwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.sig`;
}

test('sign-in: wrong password → error; right password → app with role in header; sign out → sign-in page', async ({
  page,
}) => {
  const token = fakeJwt({ sub: 'u1', role: 'bhd_operator', exp: Math.floor(Date.now() / 1000) + 3600 });
  await page.route('**/auth/login', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    const body = req.postDataJSON() as { password?: string };
    if (body.password === 'right-password') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token }) });
    }
    return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"Invalid credentials"}' });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  await expect(page.getByTestId('begin-interview')).toHaveCount(0);

  await page.getByLabel('Email address').fill('operator@muster.test');
  await page.getByLabel('Password', { exact: true }).fill('wrong');
  await page.getByTestId('signin-submit').click();
  await expect(page.getByRole('alert')).toContainText('did not accept that email and password');

  await page.getByLabel('Password', { exact: true }).fill('right-password');
  await page.getByTestId('signin-submit').click();
  // UI-02: a signed-in operator lands on Home in the portal (doc 18 §3.3).
  await expect(page.getByTestId('page-home')).toBeVisible();
  await expect(page.getByTestId('header-account')).toContainText('BHD operator');
  await page.getByTestId('nav-muster-situation').click();
  await expect(page.getByTestId('begin-interview')).toBeVisible();
  // "Keep me signed in" was off: the token is in this tab only.
  expect(await page.evaluate(() => sessionStorage.getItem('muster-jwt'))).toBe(token);
  expect(await page.evaluate(() => localStorage.getItem('muster-jwt'))).toBeNull();

  await page.getByTestId('header-account').click();
  await page.getByTestId('header-signout').click();
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('muster-jwt'))).toBeNull();
});

test('sign-in: "Work offline" opens the interview with no network call, and can sign in later', async ({ page }) => {
  const apiCalls: string[] = [];
  page.on('request', (r) => {
    if (/\/(api|auth)\//.test(new URL(r.url()).pathname)) apiCalls.push(r.url());
  });
  await page.goto('/');
  await page.getByTestId('signin-work-offline').click();
  await expect(page.getByTestId('begin-interview')).toBeVisible();
  await expect(page.getByTestId('header-account')).toContainText('Working offline');
  expect(apiCalls).toEqual([]);

  // The choice lasts for this tab across a reload.
  await page.reload();
  await expect(page.getByTestId('begin-interview')).toBeVisible();

  await page.getByTestId('header-signin').click();
  await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
});

test('sign-in: keyboard only, and the page fits a phone width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/');
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(375);

  await page.getByLabel('Email address').focus();
  await page.keyboard.type('a@b.test');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
});
