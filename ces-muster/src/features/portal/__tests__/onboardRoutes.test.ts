// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// onboardRoutes.test.ts — Sprint 3 slice "Onboard": the three new screens are
// reachable from the lifecycle sidebar for the roles the matrix allows, and
// every Onboard page of the workbook groups they cover opens a real screen.

import { describe, expect, it } from 'vitest';
import { BUILT } from '../lifecycle/builtRoutes';
import { LIFECYCLE_NAV } from '../lifecycle/navigation';
import { navFor, routesFor, routeTitle, type Viewer } from '../nav';

const signedIn = (role: string): Viewer => ({ kind: 'signed-in', role });
const onboardItems = (role: string) => navFor(signedIn(role)).find((s) => s.id === 'onboard')?.items ?? [];

describe('Onboard slice routes', () => {
  it('Organization Management, Tenant Management and Compliance Scope pages open built screens', () => {
    const onboard = LIFECYCLE_NAV.find((s) => s.key === 'onboard')!;
    for (const groupKey of ['organization-management', 'tenant-management', 'compliance-scope']) {
      const group = onboard.groups.find((g) => g.key === groupKey)!;
      for (const item of group.items) expect(BUILT[item.path]?.route, `${item.path} should be built`).toMatch(/^onboard\//);
    }
  });

  it('compliance manager and BHD operator reach the screens; the assessor and platform admin do not', () => {
    for (const role of ['compliance_manager', 'bhd_operator', 'org_admin', 'it_security_admin']) {
      const routes = routesFor(signedIn(role));
      expect(routes.has('onboard/organizations'), role).toBe(true);
      expect(routes.has('onboard/tenants'), role).toBe(true);
      expect(routes.has('onboard/scope'), role).toBe(true);
    }
    for (const role of ['assessor_read_only', 'platform_admin']) {
      expect(routesFor(signedIn(role)).has('onboard/organizations'), role).toBe(false);
      expect(onboardItems(role)).toEqual([]);
    }
    const all = onboardItems('bhd_operator');
    expect(all.find((i) => i.label === 'All Organizations')).toMatchObject({ route: 'onboard/organizations', testId: 'nav-onboard-organizations' });
    expect(all.find((i) => i.label === 'Scope Definition')).toMatchObject({ route: 'onboard/scope' });
  });

  it('breadcrumbs name the workbook section, group and page', () => {
    expect(routeTitle('onboard/organizations')).toEqual(['Onboard', 'Organization Management', 'All Organizations']);
    expect(routeTitle('onboard/tenants')).toEqual(['Onboard', 'Tenant Management', 'All Tenants']);
    expect(routeTitle('onboard/scope')).toEqual(['Onboard', 'Compliance Scope', 'Scope Definition']);
  });
});
