// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// UI-02: navigation by role, and the reference data the CES-Shared pages show
// (real files, no network).
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { defaultRoute, navFor, routesFor, type Viewer } from '../nav';
import { FAMILIES, REQUIREMENTS, SPRS_META, familySummaries, totalDeduction, weightCounts } from '../referenceData';
import { parseArchetypeCatalog, parseEvidenceMatrix } from '../evidenceData';
import { parseHash } from '@/features/app/account';

const offline: Viewer = { kind: 'offline' };
const as = (role: string): Viewer => ({ kind: 'signed-in', role });
const ids = (v: Viewer) => navFor(v).map((s) => s.id);

describe('UI-02 navigation by role (lifecycle sidebar, Sprint 1 Foundation 2026-11-10)', () => {
  it('platform admin: Home, Shared Foundation and Administration — no customer data surfaces (BHD PB-01)', () => {
    expect(ids(as('platform_admin'))).toEqual(['home', 'shared', 'admin']);
    const r = routesFor(as('platform_admin'));
    expect(r.has('platform/users')).toBe(true);
    expect(r.has('platform/audit')).toBe(true);
    for (const forbidden of ['muster', 'engagements/all', 'remediate/stamper', 'onboard/organizations'] as const) expect(r.has(forbidden)).toBe(false);
    expect(defaultRoute(as('platform_admin'))).toBe('home');
  });

  it.each(['bhd_operator', 'prime', 'sub', 'org_admin', 'compliance_manager', 'it_security_admin'])('%s: no Users; reaches Muster; lands on Home', (role) => {
    const r = routesFor(as(role));
    expect(r.has('platform/users')).toBe(false);
    expect(r.has('muster')).toBe(true);
    expect(defaultRoute(as(role))).toBe('home');
  });

  it('only BHD and the organisation administrator see Administration; the assessor sees Shared Foundation and Prepare only', () => {
    expect(routesFor(as('bhd_operator')).has('platform/roles')).toBe(true);
    expect(routesFor(as('org_admin')).has('platform/roles')).toBe(true);
    expect(routesFor(as('compliance_manager')).has('platform/roles')).toBe(false);
    expect(ids(as('assessor_read_only'))).toEqual(['home', 'shared', 'prepare']);
    expect(routesFor(as('assessor_read_only')).has('muster')).toBe(false);
  });

  it('offline: no Platform section, lands in Muster (the pre-portal behaviour)', () => {
    expect(ids(offline)).not.toContain('platform');
    expect(ids(offline)).not.toContain('admin');
    expect(routesFor(offline).has('account/password')).toBe(false);
    expect(defaultRoute(offline)).toBe('muster');
  });

  it('every item is either a built screen or a planned lifecycle scaffold (never presented as working)', () => {
    const items = navFor(as('bhd_operator')).flatMap((s) => s.items);
    // QA 2026-11-14: one sidebar entry per screen within a section (the wireframe listed one per task).
    expect(items.length).toBeGreaterThan(30);
    for (const i of items) {
      if (i.planned) expect(i.route.startsWith('lc/'), `${i.label} is planned so must open the scaffold`).toBe(true);
      else expect(i.route.startsWith('lc/'), `${i.label} is built so must open a real screen`).toBe(false);
    }
    expect(items.filter((i) => !i.planned).length).toBeGreaterThanOrEqual(40);
  });

  it('hash parsing', () => {
    expect(parseHash('#/shared/requirements')).toEqual({ route: 'shared/requirements', view: null });
    expect(parseHash('#/muster/discovery')).toEqual({ route: 'muster', view: 'discovery' });
    expect(parseHash('#/muster/nonsense')).toEqual({ route: 'muster', view: null });
    expect(parseHash('#/not-a-route')).toEqual({ route: null, view: null });
    expect(parseHash('')).toEqual({ route: null, view: null });
  });
});

describe('UI-02 reference data (ces-shared vendored copies)', () => {
  it('110 unique requirements, each with a weight', () => {
    expect(REQUIREMENTS).toHaveLength(110);
    expect(new Set(REQUIREMENTS.map((r) => r.control_id)).size).toBe(110);
  });

  it('weights are the DoD methodology values, not the mockup fractions', () => {
    expect(weightCounts()).toEqual({ 5: 44, 3: 14, 1: 51, 0: 1 });
    expect(totalDeduction()).toBe(313);
    expect(SPRS_META.starting_score - totalDeduction()).toBe(SPRS_META.floor_score);
    expect(REQUIREMENTS.find((r) => r.weight === 0)?.control_id).toBe('CA.L2-3.12.4');
  });

  it('family counts agree with the family list (AC 22, AT 3, … SI 7)', () => {
    expect(FAMILIES).toHaveLength(14);
    const sums = new Map(familySummaries().map((f) => [f.family, f.count]));
    for (const f of FAMILIES) expect(sums.get(f.abbreviation)).toBe(f.control_count);
  });

  it('numeric NIST order: 3.1.2 before 3.1.10, 3.1.22 before 3.2.1', () => {
    const order = REQUIREMENTS.map((r) => r.nist_ref);
    expect(order.indexOf('3.1.2')).toBeLessThan(order.indexOf('3.1.10'));
    expect(order.indexOf('3.1.22')).toBeLessThan(order.indexOf('3.2.1'));
    expect(order[0]).toBe('3.1.1');
    expect(order[109]).toBe('3.14.7');
  });
});

describe('UI-02 evidence knowledge files', () => {
  const dir = path.resolve(__dirname, '../../../../public/knowledge');
  it('archetype catalog: 50 archetypes, 13 domains, date shown as written', () => {
    const c = parseArchetypeCatalog(fs.readFileSync(path.join(dir, 'domain Evidence Archetype Catalog.yaml'), 'utf8'));
    expect(c.archetypes).toHaveLength(50);
    expect(c.domains).toHaveLength(13);
    expect(c.generated_on).toBe('2026-02-03');
    expect(c.archetypes.every((a) => Array.isArray(a.maps_to_cmmc_practices))).toBe(true);
  });

  it('assessor evidence matrix: the one mapping the file holds today', () => {
    const m = parseEvidenceMatrix(fs.readFileSync(path.join(dir, 'domain Assessor Evidence Matrix.yaml'), 'utf8'));
    expect(m.mappings.map((x) => x.practice_id)).toEqual(['AC.L2-3.1.1']);
    expect(m.strength_tiers).toEqual(['weak', 'adequate', 'strong']);
  });
});
