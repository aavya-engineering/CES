// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// platformRoles.test.ts — Sprint 1 Foundation: platform roles inherit engine
// roles for every requireRole() list; the API matrix equals the UI matrix.

import { describe, expect, it } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { can, effectiveRoles, isRole, permissionsFor, PLATFORM_ROLE_MATRIX, ROLES } from '../src/lib/permissions.js';
import { requireRole } from '../src/middleware/auth.js';
import { RBAC_MATRIX } from '../../src/features/portal/lifecycle/rbac';

function run(role: string, ...allowed: string[]): number {
  let status = 200;
  const req = { user: { role } } as unknown as Request;
  const res = { status: (s: number) => { status = s; return res; }, json: () => res } as unknown as Response;
  const next: NextFunction = () => {};
  requireRole(...allowed)(req, res, next);
  return status;
}

describe('platform roles (RBAC-01, Sprint 1 Foundation)', () => {
  it('ten roles: five engine + five platform', () => {
    expect(ROLES).toEqual(['platform_admin', 'bhd_operator', 'prime', 'sub', 'assessor_read_only', 'org_admin', 'compliance_manager', 'it_security_admin', 'evidence_reviewer', 'senior_approver']);
    for (const r of ROLES) expect(isRole(r)).toBe(true);
    expect(isRole('root')).toBe(false);
  });

  it('a platform role acts as its engine roles in requireRole()', () => {
    expect(effectiveRoles('compliance_manager')).toEqual(['compliance_manager', 'prime']);
    expect(effectiveRoles('it_security_admin')).toEqual(['it_security_admin', 'prime', 'sub']);
    expect(run('compliance_manager', 'prime', 'bhd_operator')).toBe(200);
    expect(run('it_security_admin', 'sub')).toBe(200);
    expect(run('evidence_reviewer', 'assessor_read_only')).toBe(200);
    expect(run('evidence_reviewer', 'prime')).toBe(403);
    expect(run('org_admin', 'bhd_operator')).toBe(403);
    expect(run('unknown', 'prime')).toBe(403);
  });

  it('permissions follow inheritance', () => {
    expect(can('compliance_manager', 'plan.push')).toBe(true);
    expect(can('compliance_manager', 'live.enable')).toBe(false);
    expect(can('senior_approver', 'sessions.read')).toBe(true);
    expect(permissionsFor('org_admin')).toContain('engagements.create');
    expect(permissionsFor('org_admin')).not.toContain('users.manage');
  });

  it('API matrix equals the UI matrix (ces-muster lifecycle/rbac.ts)', () => {
    const ui = RBAC_MATRIX as Record<string, Record<string, readonly string[]>>;
    for (const [scope, byRole] of Object.entries(PLATFORM_ROLE_MATRIX)) {
      expect(ui[scope], `UI matrix is missing scope ${scope}`).toBeDefined();
      expect(byRole).toEqual(ui[scope]);
    }
    // Stamper is BHD-only; the platform administrator holds no customer data (PB-01).
    expect(Object.keys(PLATFORM_ROLE_MATRIX['remediate.stamper'])).toEqual(['bhd_operator']);
    expect(PLATFORM_ROLE_MATRIX.onboard.platform_admin).toBeUndefined();
  });
});
