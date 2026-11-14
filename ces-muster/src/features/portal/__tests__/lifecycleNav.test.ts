// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// lifecycleNav.test.ts — Sprint 1 Foundation: the lifecycle navigation model
// (navigation.ts, generated from the BHD workbook), role filtering (rbac.ts),
// built-route mapping and route resolution.

import { describe, expect, it } from 'vitest';
import { BUILT, SECTION_PLAN } from '../lifecycle/builtRoutes';
import { LIFECYCLE_COUNTS, LIFECYCLE_NAV, LIFECYCLE_PAGES } from '../lifecycle/navigation';
import { actionsFor, canView, PLATFORM_ROLES, RBAC_MATRIX, toPlatformRole } from '../lifecycle/rbac';
import { isRouteId, lifecycleRoute, navFor, routesFor, routeTitle, type Viewer } from '../nav';

const signedIn = (role: string): Viewer => ({ kind: 'signed-in', role });

describe('lifecycle navigation model (CES Navigation.xlsx, 2026-11-10)', () => {
  it('has 9 sections, 50 groups and 245 pages', () => {
    expect(LIFECYCLE_COUNTS).toEqual({ sections: 9, groups: 50, pages: 245 });
    expect(LIFECYCLE_NAV.map((s) => s.key)).toEqual(['shared', 'onboard', 'assess', 'plan', 'remediate', 'evidence', 'monitor', 'prepare', 'admin']);
  });

  it('every page path is unique and every built mapping points at a real page', () => {
    const paths = LIFECYCLE_NAV.flatMap((s) => s.groups.flatMap((g) => g.items.map((i) => i.path)));
    expect(new Set(paths).size).toBe(paths.length);
    for (const p of Object.keys(BUILT)) expect(LIFECYCLE_PAGES.has(p), `BUILT has unknown path ${p}`).toBe(true);
    for (const s of LIFECYCLE_NAV) expect(SECTION_PLAN[s.key].sprint).toMatch(/^Sprint/);
  });
});

describe('role-aware sidebar', () => {
  it('the BHD operator sees every lifecycle section including Remediate › Stamper', () => {
    const sections = navFor(signedIn('bhd_operator'));
    expect(sections.map((s) => s.id)).toEqual(['home', 'shared', 'onboard', 'assess', 'plan', 'remediate', 'evidence', 'monitor', 'prepare', 'admin']);
    const remediate = sections.find((s) => s.id === 'remediate')!;
    expect(remediate.items.some((i) => i.group === 'Configuration Management – Stamper')).toBe(true);
  });

  it('the platform administrator holds no customer data (BHD PB-01): Home, Shared Foundation, Administration only', () => {
    expect(navFor(signedIn('platform_admin')).map((s) => s.id)).toEqual(['home', 'shared', 'admin']);
    expect(canView('platform_admin', 'onboard')).toBe(false);
    expect(canView('platform_admin', 'remediate', 'configuration-management-stamper')).toBe(false);
  });

  it('customer roles never see Stamper; the CIS administrator sees AdminOps', () => {
    for (const role of ['org_admin', 'compliance_manager', 'it_security_admin', 'evidence_reviewer', 'senior_approver', 'prime', 'sub']) {
      const remediate = navFor(signedIn(role)).find((s) => s.id === 'remediate');
      const groups = new Set((remediate?.items ?? []).map((i) => i.group));
      expect(groups.has('Configuration Management – Stamper'), role).toBe(false);
    }
    const cis = navFor(signedIn('it_security_admin')).find((s) => s.id === 'remediate')!;
    expect(cis.items.some((i) => i.group === 'Administrative Operations – AdminOps')).toBe(true);
    expect(actionsFor('it_security_admin', 'remediate', 'administrative-operations-adminops')).toContain('execute');
    expect(actionsFor('senior_approver', 'remediate', 'administrative-operations-adminops')).toContain('approve');
  });

  it('the external assessor sees Shared Foundation and only the assessor-facing Prepare groups', () => {
    const sections = navFor(signedIn('assessor_read_only'));
    expect(sections.map((s) => s.id)).toEqual(['home', 'shared', 'prepare']);
    const prepare = sections.find((s) => s.id === 'prepare')!;
    expect(new Set(prepare.items.map((i) => i.group))).toEqual(new Set(['Assessment Documentation', 'Evidence Packages', 'Assessor Workspace']));
    expect(canView('assessor_read_only', 'remediate')).toBe(false);
    expect(canView('assessor_read_only', 'admin')).toBe(false);
  });

  it('an organisation administrator manages only users, settings and the audit log under Administration', () => {
    const admin = navFor(signedIn('org_admin')).find((s) => s.id === 'admin')!;
    expect(new Set(admin.items.map((i) => i.group ?? i.label))).toEqual(new Set(['Users & Roles', 'Settings', 'Audit Log']));
  });

  it('legacy engine roles map onto platform roles', () => {
    expect(toPlatformRole('prime')).toBe('compliance_manager');
    expect(toPlatformRole('sub')).toBe('it_security_admin');
    expect(toPlatformRole('nobody')).toBeNull();
    expect(navFor(signedIn('nobody')).map((s) => s.id)).toEqual(['home', 'shared']);
  });

  it('every role in the matrix is a platform role', () => {
    for (const [, byRole] of Object.entries(RBAC_MATRIX)) for (const r of Object.keys(byRole)) expect((PLATFORM_ROLES as readonly string[]).includes(r)).toBe(true);
  });
});

describe('routes', () => {
  it('built pages open their existing screens with the Sprint-1 test ids', () => {
    const shared = navFor(signedIn('bhd_operator')).find((s) => s.id === 'shared')!;
    const req = shared.items.find((i) => i.label === '110 Requirements')!;
    expect(req.route).toBe('shared/requirements');
    expect(req.testId).toBe('nav-shared-requirements');
    const assess = navFor(signedIn('compliance_manager')).find((s) => s.id === 'assess')!;
    expect(assess.items.find((i) => i.label === 'Discovery Overview')).toMatchObject({ route: 'muster', view: 'discovery' });
  });

  it('scaffold routes still resolve (future workbook pages), but no built page uses one any more', () => {
    const r = lifecycleRoute('/assess/discovery/sync-status');
    expect(r).toBe('lc/assess/discovery/sync-status');
    expect(isRouteId(r)).toBe(true);
    expect(isRouteId('lc/assess/discovery/not-a-page')).toBe(false);
    expect(routeTitle(r)).toEqual(['Assess', 'Discovery', 'Sync Status']);
    expect(routeTitle('lc/plan/planning-overview')).toEqual(['Plan', 'Planning Overview']);
    // 2026-11-10: every workbook page opens a built screen, so the sidebar carries no planned item.
    expect(navFor(signedIn('bhd_operator')).flatMap((s) => s.items).filter((i) => i.planned)).toEqual([]);
    expect(routesFor(signedIn('it_security_admin')).has(r)).toBe(false);
    expect(routesFor(signedIn('it_security_admin')).has('remediate/stamper')).toBe(false);
    expect(routesFor(signedIn('bhd_operator')).has('remediate/stamper')).toBe(true);
  });

  it('the offline viewer keeps the Muster-only navigation', () => {
    expect(navFor({ kind: 'offline' }).map((s) => s.id)).toEqual(['home', 'shared', 'muster']);
  });
});

describe('module visibility (Administration › Settings › Modules)', () => {
  it('a module set to false disappears from the sidebar and from the allowed routes, for every role; Administration never hides', () => {
    const v: Viewer = { kind: 'signed-in', role: 'compliance_manager', modules: { monitor: false, prepare: false } };
    const ids = navFor(v).map((s) => s.id);
    expect(ids).not.toContain('monitor');
    expect(ids).not.toContain('prepare');
    expect(ids).toContain('assess');
    expect(routesFor(v).has('monitor/overview')).toBe(false);
    const admin: Viewer = { kind: 'signed-in', role: 'org_admin', modules: { admin: false, onboard: false } as Record<string, boolean> };
    expect(navFor(admin).map((s) => s.id)).toContain('admin');
    expect(navFor(admin).map((s) => s.id)).not.toContain('onboard');
  });
  it('without modules (not fetched yet) everything the role may see is shown', () => {
    expect(navFor(signedIn('compliance_manager')).map((s) => s.id)).toContain('monitor');
  });
});

describe('QA round 3 (2026-11-13) — one current item per screen', () => {
  it('a built screen shared by several lifecycle pages is current for one item only (the rest are shortcuts)', () => {
    for (const role of ['bhd_operator', 'org_admin', 'compliance_manager', 'it_security_admin']) {
      const seen = new Set<string>();
      for (const s of navFor(signedIn(role))) {
        for (const i of s.items) {
          if (i.shortcut) continue;
          const key = `${i.route}|${i.view ?? ''}`;
          expect(seen.has(key), `${role}: ${key} is current twice`).toBe(false);
          seen.add(key);
        }
      }
    }
  });
  it('one sidebar entry per screen; the route stays reachable', () => {
    const nav = navFor(signedIn('bhd_operator'));
    const stamper = nav.find((s) => s.id === 'remediate')!.items.filter((i) => i.route === 'remediate/stamper');
    expect(stamper).toHaveLength(1);
    const orgs = nav.find((s) => s.id === 'onboard')!.items.filter((i) => i.route === 'onboard/organizations');
    expect(orgs).toHaveLength(1);
    expect(routesFor(signedIn('bhd_operator')).has('remediate/stamper')).toBe(true);
  });
});
