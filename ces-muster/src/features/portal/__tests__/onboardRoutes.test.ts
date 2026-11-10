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

  it('Assess › Readiness Assessment and Gap Analysis open the persisted-run screens; the assessor may read them', () => {
    const onboard = LIFECYCLE_NAV.find((s) => s.key === 'assess')!;
    for (const groupKey of ['readiness-assessment', 'gap-analysis']) {
      const group = onboard.groups.find((g) => g.key === groupKey)!;
      const built = group.items.filter((i) => BUILT[i.path]);
      expect(built.length, groupKey).toBeGreaterThanOrEqual(3);
      for (const i of built) expect(BUILT[i.path].route).toMatch(/^(assess|onboard)\//); // by-system-environment opens the systems registry
    }
    expect(routesFor(signedIn('compliance_manager')).has('assess/gaps')).toBe(true);
    // The assessor reaches the SPRS score and results screens only through Prepare › Assessment Documentation (read-only APIs).
    expect(navFor(signedIn('assessor_read_only')).some((s) => s.id === 'assess')).toBe(false);
    expect(routesFor(signedIn('assessor_read_only')).has('assess/readiness')).toBe(true);
    expect(routesFor(signedIn('platform_admin')).has('assess/readiness')).toBe(false);
    expect(routeTitle('assess/gaps')).toEqual(['Assess', 'Gap Analysis', 'Gap Summary']);
  });

  it('Plan: every Remediation Planning / Action Management / Prioritization / POA&M page opens a built screen', () => {
    const plan = LIFECYCLE_NAV.find((s) => s.key === 'plan')!;
    for (const g of plan.groups) {
      const items = g.items.length ? g.items : [{ path: g.path, label: g.label }];
      for (const i of items) expect(BUILT[i.path], `${i.path} should be built`).toBeDefined();
    }
    expect(routesFor(signedIn('senior_approver')).has('plan/poam')).toBe(true); // approves POA&M, no edit
    expect(routesFor(signedIn('assessor_read_only')).has('plan/actions')).toBe(false);
    expect(routeTitle('plan/poam')).toEqual(['Plan', 'POA&M Planning', 'POA&M Items']);
  });

  it('Remediate: every workbook page opens a built screen; Stamper stays BHD-only; AdminOps for the CIS admin and the senior approver', () => {
    const rem = LIFECYCLE_NAV.find((s) => s.key === 'remediate')!;
    for (const g of rem.groups) {
      const items = g.items.length ? g.items : [{ path: g.path, label: g.label }];
      for (const i of items) expect(BUILT[i.path], `${i.path} should be built`).toBeDefined();
    }
    expect(routesFor(signedIn('bhd_operator')).has('remediate/stamper')).toBe(true);
    expect(routesFor(signedIn('it_security_admin')).has('remediate/stamper')).toBe(false);
    expect(routesFor(signedIn('it_security_admin')).has('remediate/adminops')).toBe(true);
    expect(routesFor(signedIn('senior_approver')).has('remediate/adminops')).toBe(true);
    expect(routesFor(signedIn('assessor_read_only')).has('remediate/overview')).toBe(false);
    expect(routeTitle('remediate/adminops')).toEqual(['Remediate', 'Administrative Operations – AdminOps', 'AdminOps Overview']);
  });

  it('Collect Evidence: every workbook page opens a built screen; the reviewer approves, the CIS admin collects, the assessor stays out', () => {
    const ev = LIFECYCLE_NAV.find((s) => s.key === 'evidence')!;
    for (const g of ev.groups) {
      const items = g.items.length ? g.items : [{ path: g.path, label: g.label }];
      for (const i of items) expect(BUILT[i.path], `${i.path} should be built`).toBeDefined();
    }
    expect(routesFor(signedIn('evidence_reviewer')).has('evidence/explorer')).toBe(true);
    expect(routesFor(signedIn('it_security_admin')).has('evidence/collect')).toBe(true);
    expect(routesFor(signedIn('assessor_read_only')).has('evidence/overview')).toBe(false);
    expect(routeTitle('evidence/collect')).toEqual(['Collect Evidence', 'Evidence Collection', 'Upload Evidence']);
  });

  it('Monitor: every workbook page opens a built screen; the CIS admin can act, the assessor cannot see it', () => {
    const mon = LIFECYCLE_NAV.find((s) => s.key === 'monitor')!;
    for (const g of mon.groups) {
      const items = g.items.length ? g.items : [{ path: g.path, label: g.label }];
      for (const i of items) expect(BUILT[i.path], `${i.path} should be built`).toBeDefined();
    }
    expect(routesFor(signedIn('it_security_admin')).has('monitor/findings')).toBe(true);
    expect(routesFor(signedIn('senior_approver')).has('monitor/overview')).toBe(true);
    expect(routesFor(signedIn('assessor_read_only')).has('monitor/overview')).toBe(false);
    expect(routeTitle('monitor/activity')).toEqual(['Monitor', 'Audit & Activity', 'Compliance Event History']);
  });

  it('Prepare: every workbook page opens a built screen; the external assessor reaches the workspace, documentation and packages', () => {
    const prep = LIFECYCLE_NAV.find((s) => s.key === 'prepare')!;
    for (const g of prep.groups) {
      const items = g.items.length ? g.items : [{ path: g.path, label: g.label }];
      for (const i of items) expect(BUILT[i.path], `${i.path} should be built`).toBeDefined();
    }
    const assessor = routesFor(signedIn('assessor_read_only'));
    expect(assessor.has('prepare/assessor')).toBe(true);
    expect(assessor.has('prepare/packages')).toBe(true);
    expect(assessor.has('prepare/ssp')).toBe(true);
    expect(assessor.has('prepare/overview')).toBe(false); // internal readiness review is not the assessor's
    expect(routesFor(signedIn('compliance_manager')).has('prepare/overview')).toBe(true);
    expect(routeTitle('prepare/ssp')).toEqual(['Prepare for Assessment', 'Assessment Documentation', 'System Security Plan (SSP)']);
  });

  it('every page of the workbook now opens a built screen (no scaffold left)', () => {
    const unbuilt: string[] = [];
    for (const s of LIFECYCLE_NAV) for (const g of s.groups) for (const i of (g.items.length ? g.items : [{ path: g.path }])) if (!BUILT[i.path]) unbuilt.push(i.path);
    expect(unbuilt).toEqual([]);
    expect(routesFor(signedIn('org_admin')).has('admin/settings')).toBe(true);
    expect(routesFor(signedIn('org_admin')).has('admin/access')).toBe(true);
    expect(routesFor(signedIn('platform_admin')).has('admin/health')).toBe(true);
    expect(routesFor(signedIn('compliance_manager')).has('onboard/checklist')).toBe(true);
    expect(routeTitle('onboard/systems')).toEqual(['Onboard', 'System & Environment Registry', 'Systems Inventory']);
  });

  it('breadcrumbs name the workbook section, group and page', () => {
    expect(routeTitle('onboard/organizations')).toEqual(['Onboard', 'Organization Management', 'All Organizations']);
    expect(routeTitle('onboard/tenants')).toEqual(['Onboard', 'Tenant Management', 'All Tenants']);
    expect(routeTitle('onboard/scope')).toEqual(['Onboard', 'Compliance Scope', 'Scope Definition']);
  });
});
