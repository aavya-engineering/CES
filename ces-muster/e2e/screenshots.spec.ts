// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

/**
 * Screenshot every lifecycle screen, per role, against the LIVE local stack — for the user guide and training deck.
 *   CES_E2E_LIVE=1 npx playwright test --project=live e2e/screenshots.spec.ts
 * Output: docs/screenshots/<nn>-<slug>.png (repo root), 1440×900 viewport, full page, light theme.
 * Demo data only (seed:dev accounts). Re-run whenever the UI changes; the docs build reads these files.
 */
import { test, expect, type Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', '..', 'docs', 'screenshots');
const PW = process.env.CES_E2E_PASSWORD ?? 'Ces!Local2026';

test.skip(!process.env.CES_E2E_LIVE, 'set CES_E2E_LIVE=1 with the local stack running');
test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' });

interface Shot { n: number; role: string; email: string; route: string; testId: string; slug: string; settle?: (p: Page) => Promise<void> }

const CM = 'compliance@contoso.local', OA = 'orgadmin@contoso.local', BHD = 'bhd-ops1@contoso.local', REV = 'reviewer@contoso.local', ASR = 'assessor@c3pao.local';

const SHOTS: Shot[] = [
  { n: 2, role: 'org admin', email: OA, route: 'onboard/organizations', testId: 'page-onboard-organizations', slug: 'onboard-organizations' },
  { n: 3, role: 'org admin', email: OA, route: 'onboard/tenants', testId: 'page-onboard-tenants', slug: 'onboard-tenants' },
  { n: 4, role: 'org admin', email: OA, route: 'onboard/scope', testId: 'page-onboard-scope', slug: 'onboard-scope' },
  { n: 5, role: 'org admin', email: OA, route: 'onboard/systems', testId: 'page-onboard-systems', slug: 'onboard-systems' },
  { n: 6, role: 'org admin', email: OA, route: 'onboard/checklist', testId: 'page-onboard-checklist', slug: 'onboard-checklist' },
  { n: 7, role: 'compliance manager', email: CM, route: 'assess/readiness', testId: 'page-assess-readiness', slug: 'assess-readiness' },
  { n: 8, role: 'compliance manager', email: CM, route: 'assess/gaps', testId: 'page-assess-gaps', slug: 'assess-gaps' },
  { n: 9, role: 'compliance manager', email: CM, route: 'plan/overview', testId: 'page-plan-overview', slug: 'plan-overview' },
  { n: 10, role: 'compliance manager', email: CM, route: 'plan/actions', testId: 'page-plan-actions', slug: 'plan-actions' },
  { n: 11, role: 'compliance manager', email: CM, route: 'plan/poam', testId: 'page-plan-poam', slug: 'plan-poam' },
  { n: 12, role: 'compliance manager', email: CM, route: 'remediate/overview', testId: 'page-remediate-overview', slug: 'remediate-overview' },
  { n: 13, role: 'BHD operator', email: BHD, route: 'remediate/stamper', testId: 'page-remediate-stamper', slug: 'remediate-stamper' },
  { n: 14, role: 'compliance manager', email: CM, route: 'remediate/adminops', testId: 'page-remediate-adminops', slug: 'remediate-adminops' },
  { n: 15, role: 'compliance manager', email: CM, route: 'evidence/overview', testId: 'page-evidence-overview', slug: 'evidence-overview' },
  { n: 16, role: 'compliance manager', email: CM, route: 'evidence/explorer', testId: 'page-evidence-explorer', slug: 'evidence-explorer' },
  { n: 17, role: 'compliance manager', email: CM, route: 'evidence/collect', testId: 'page-evidence-collect', slug: 'evidence-collect' },
  { n: 18, role: 'compliance manager', email: CM, route: 'evidence/catalog', testId: 'page-evidence-catalog', slug: 'evidence-catalog', settle: async (p) => { await p.getByTestId('catalog-table').waitFor({ timeout: 15_000 }).catch(() => {}); } },
  { n: 19, role: 'evidence reviewer', email: REV, route: 'evidence/explorer', testId: 'page-evidence-explorer', slug: 'evidence-review-as-reviewer' },
  { n: 20, role: 'compliance manager', email: CM, route: 'monitor/overview', testId: 'page-monitor-overview', slug: 'monitor-overview' },
  { n: 21, role: 'compliance manager', email: CM, route: 'monitor/findings', testId: 'page-monitor-findings', slug: 'monitor-findings' },
  { n: 22, role: 'compliance manager', email: CM, route: 'monitor/activity', testId: 'page-monitor-activity', slug: 'monitor-activity' },
  { n: 23, role: 'compliance manager', email: CM, route: 'prepare/overview', testId: 'page-prepare-overview', slug: 'prepare-overview' },
  { n: 24, role: 'compliance manager', email: CM, route: 'prepare/ssp', testId: 'page-prepare-ssp', slug: 'prepare-ssp' },
  { n: 25, role: 'compliance manager', email: CM, route: 'prepare/packages', testId: 'page-prepare-packages', slug: 'prepare-packages' },
  { n: 26, role: 'assessor (read-only)', email: ASR, route: 'prepare/assessor', testId: 'page-prepare-assessor', slug: 'prepare-assessor' },
  { n: 27, role: 'compliance manager', email: CM, route: 'prepare/reports', testId: 'page-prepare-reports', slug: 'prepare-reports' },
  { n: 28, role: 'org admin', email: OA, route: 'admin/settings', testId: 'page-admin-settings', slug: 'admin-settings' },
  { n: 29, role: 'org admin', email: OA, route: 'admin/access', testId: 'page-admin-access', slug: 'admin-access' },
  { n: 30, role: 'BHD operator', email: BHD, route: 'admin/health', testId: 'page-admin-health', slug: 'admin-health' },
];

const file = (n: number, slug: string) => path.join(OUT, `${String(n).padStart(2, '0')}-${slug}.png`);

async function signIn(page: Page, email: string) {
  await page.goto('/');
  if (await page.getByTestId('header-signout').isVisible().catch(() => false)) await page.getByTestId('header-signout').click();
  await page.getByTestId('signin-email').fill(email);
  await page.getByTestId('signin-password').fill(PW);
  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('portal')).toBeVisible({ timeout: 15_000 });
}

async function quiet(page: Page) {
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }' }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(400);
}

test.beforeAll(() => { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'INDEX.json'), JSON.stringify([{ n: 1, slug: 'sign-in', role: '—', route: '/' }, ...SHOTS.map(({ n, slug, role, route }) => ({ n, slug, role, route }))], null, 2)); });

test('01 sign-in page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('signin-page')).toBeVisible();
  await quiet(page);
  await page.screenshot({ path: file(1, 'sign-in'), fullPage: false });
});

for (const s of SHOTS) {
  test(`${String(s.n).padStart(2, '0')} ${s.route} as ${s.role}`, async ({ page }) => {
    await signIn(page, s.email);
    await page.goto(`/#/${s.route}`);
    await expect(page.getByTestId(s.testId)).toBeVisible({ timeout: 15_000 });
    await s.settle?.(page);
    await quiet(page);
    await page.screenshot({ path: file(s.n, s.slug), fullPage: true });
  });
}

test('31 settings — modules tab (org admin)', async ({ page }) => {
  await signIn(page, OA);
  await page.goto('/#/admin/settings');
  await expect(page.getByTestId('page-admin-settings')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('settings-tab-modules').click();
  await expect(page.getByTestId('settings-modules-grid')).toBeVisible({ timeout: 15_000 });
  await quiet(page);
  await page.screenshot({ path: file(31, 'admin-settings-modules'), fullPage: false });
});

test('33 remediation run drawer (BHD operator)', async ({ page }) => {
  await signIn(page, BHD);
  await page.goto('/#/remediate/overview');
  await expect(page.getByTestId('page-remediate-overview')).toBeVisible({ timeout: 15_000 });
  const open = page.locator('[data-testid^="run-open-"]').first();
  if (await open.isVisible().catch(() => false)) {
    await open.click();
    await expect(page.getByTestId('run-gates')).toBeVisible({ timeout: 15_000 });
    await quiet(page);
    await page.screenshot({ path: file(33, 'remediate-run-drawer'), fullPage: false });
  }
});

test('34 gap drawer with override (compliance manager)', async ({ page }) => {
  await signIn(page, CM);
  await page.goto('/#/assess/gaps');
  await expect(page.getByTestId('page-assess-gaps')).toBeVisible({ timeout: 15_000 });
  const open = page.locator('[data-testid^="gap-open-"]').first();
  if (await open.isVisible().catch(() => false)) {
    await open.click();
    await page.getByTestId('override-reason').waitFor({ timeout: 15_000 }).catch(() => {});
    await quiet(page);
    await page.screenshot({ path: file(34, 'assess-gap-drawer'), fullPage: false });
  }
});
