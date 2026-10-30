// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// permissions.ts — RBAC-01: one readable list of what each role may do.
//
// Enforcement stays where it was: each route's requireRole(...) list. This
// catalogue DESCRIBES those lists (each entry names the route that enforces
// it) so the SPA can show the right navigation and the Roles screen can show
// the matrix. tests/rbac.permissions.test.ts drives the real routes with a
// token for every role and fails if this catalogue and the routes disagree.
//
// New in RBAC-01: platform_admin (BHD role review PB-01) — users and audit log
// only; no customer data, no operator or approver power.

export const ROLES = ['platform_admin', 'bhd_operator', 'prime', 'sub', 'assessor_read_only'] as const;
export type RoleName = (typeof ROLES)[number];

export const ROLE_LABELS: Record<RoleName, string> = {
  platform_admin: 'Platform administrator',
  bhd_operator: 'BHD operator',
  prime: 'Prime contractor',
  sub: 'Contractor',
  assessor_read_only: 'Assessor (read-only)',
};

export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  platform_admin: 'Blue Heron Defense staff. Manages users and roles, reads the audit log, edits and publishes CES-Shared content (a second administrator publishes each draft). No access to customer data.',
  bhd_operator: 'Blue Heron Defense staff. Runs engagements end to end: discovery, live access, plan push, results.',
  prime: 'Prime contractor. Manages its engagement and subcontractors, runs discovery, pushes plans.',
  sub: 'Contractor being assessed. Answers the interview for its own organisation.',
  assessor_read_only: 'C3PAO assessor or reviewer. Reads engagements, sessions and contracts; changes nothing.',
};

export interface PermissionDef {
  id: string;
  group: 'Administration' | 'Engagements' | 'Assessment' | 'Discovery & live access' | 'Plan & Stamper' | 'Contracts' | 'Operations' | 'CES-Shared';
  label: string;
  roles: readonly RoleName[];
  /** The route(s) whose requireRole list this mirrors. */
  enforcedAt: string;
}

export const PERMISSIONS: readonly PermissionDef[] = [
  { id: 'users.manage', group: 'Administration', label: 'Manage users and roles', roles: ['platform_admin'], enforcedAt: 'routes/users.ts' },
  { id: 'audit.read', group: 'Administration', label: 'Read the audit log', roles: ['platform_admin'], enforcedAt: 'routes/users.ts (GET /api/audit-events)' },

  { id: 'engagements.read', group: 'Engagements', label: 'View engagements and parties', roles: ['prime', 'bhd_operator', 'assessor_read_only'], enforcedAt: 'routes/engagements.ts:28' },
  { id: 'engagements.create', group: 'Engagements', label: 'Create and edit engagements, milestones and parties', roles: ['prime', 'bhd_operator'], enforcedAt: 'routes/engagements.ts (POST, PATCH, milestones), routes/parties.ts:66' },
  { id: 'portfolio.read', group: 'Engagements', label: 'View the Home dashboard (platform administrator: counts only, no names)', roles: ['platform_admin', 'bhd_operator', 'prime'], enforcedAt: 'routes/portfolio.ts (PORTFOLIO_ROLES, PORTFOLIO_COUNT_ROLES)' },

  { id: 'interview.answer', group: 'Assessment', label: 'Answer the interview', roles: ['sub', 'prime', 'bhd_operator'], enforcedAt: 'routes/interview.ts:78, routes/sessions.ts:37' },
  { id: 'sessions.read', group: 'Assessment', label: 'Read interview sessions', roles: ['sub', 'prime', 'bhd_operator', 'assessor_read_only'], enforcedAt: 'routes/sessions.ts:69' },
  { id: 'review.queue', group: 'Assessment', label: 'Work the human review queue', roles: ['bhd_operator', 'prime'], enforcedAt: 'routes/hil.ts:60' },

  { id: 'discovery.run', group: 'Discovery & live access', label: 'Run discovery and harvest', roles: ['prime', 'bhd_operator'], enforcedAt: 'routes/discovery.ts:74, routes/harvest.ts:81' },
  { id: 'live.enable', group: 'Discovery & live access', label: 'Switch live tenant access on or off', roles: ['bhd_operator'], enforcedAt: 'routes/live.ts:42' },
  { id: 'live.consent', group: 'Discovery & live access', label: 'Start a live read consent', roles: ['prime', 'bhd_operator'], enforcedAt: 'routes/live.ts:80' },

  { id: 'plan.push', group: 'Plan & Stamper', label: 'Send a plan to Stamper', roles: ['prime', 'bhd_operator'], enforcedAt: 'routes/plan.ts:70 (PUSH_ROLES)' },
  { id: 'plan.status', group: 'Plan & Stamper', label: 'Read Stamper progress', roles: ['prime', 'bhd_operator', 'assessor_read_only', 'sub'], enforcedAt: 'routes/plan.ts:72 (STATUS_ROLES)' },
  { id: 'plan.results', group: 'Plan & Stamper', label: 'Post Stamper results', roles: ['bhd_operator'], enforcedAt: 'routes/plan.ts:71 (RESULTS_ROLES)' },

  { id: 'contracts.read', group: 'Contracts', label: 'View contracts', roles: ['prime', 'bhd_operator', 'assessor_read_only'], enforcedAt: 'routes/contracts.ts:44' },
  { id: 'contracts.manage', group: 'Contracts', label: 'Create and edit contracts', roles: ['prime', 'bhd_operator'], enforcedAt: 'routes/contracts.ts:87' },

  { id: 'delivery.manage', group: 'Operations', label: 'Deliver artifacts and manage grants', roles: ['bhd_operator'], enforcedAt: 'routes/delivery.ts:52' },
  { id: 'nudges.manage', group: 'Operations', label: 'Run nudges and reassessments', roles: ['bhd_operator'], enforcedAt: 'routes/nudges.ts:36, routes/reassessment.ts:55' },

  { id: 'shared.read', group: 'CES-Shared', label: 'View CES-Shared reference data and published content', roles: ['platform_admin', 'bhd_operator', 'prime', 'sub', 'assessor_read_only'], enforcedAt: 'routes/cesShared.ts (READ_ROLES)' },
  { id: 'shared.edit', group: 'CES-Shared', label: 'Draft changes to CES-Shared content', roles: ['platform_admin'], enforcedAt: 'routes/cesShared.ts (EDIT_ROLES)' },
  { id: 'shared.approve', group: 'CES-Shared', label: 'Publish or retire CES-Shared content (not your own draft)', roles: ['platform_admin'], enforcedAt: 'routes/cesShared.ts (EDIT_ROLES) + service.publish (no self-approval)' },
];

export function isRole(value: unknown): value is RoleName {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function permissionsFor(role: string): string[] {
  return PERMISSIONS.filter((p) => (p.roles as readonly string[]).includes(role)).map((p) => p.id);
}

export function can(role: string | undefined, permission: string): boolean {
  if (!role) return false;
  const def = PERMISSIONS.find((p) => p.id === permission);
  return !!def && (def.roles as readonly string[]).includes(role);
}
