// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// permissions.ts — RBAC-01: the role and permission catalogue muster-api
// serves (GET /auth/roles) and that the Roles & Permissions page shows.
//
// Sprint 1 Foundation (2026-11-10): the five ENGINE roles stay (every
// requireRole() list in src/routes still names them) and five PLATFORM roles
// are added for the unified lifecycle UI (SOW v1.1 §5; BHD walkthrough
// 2026-11-04). A platform role INHERITS one or more engine roles, so existing
// route checks keep working unchanged: requireRole() now compares against
// effectiveRoles(user.role). PLATFORM_ROLE_MATRIX is the section-level access
// table the sidebar uses (ces-muster/src/features/portal/lifecycle/rbac.ts);
// a parity test keeps the two in step.

/** Engine roles — the ones every existing requireRole() list names. */
export const ENGINE_ROLES = ['platform_admin', 'bhd_operator', 'prime', 'sub', 'assessor_read_only'] as const;
export type EngineRole = (typeof ENGINE_ROLES)[number];

/** Platform roles added for the lifecycle UI (Prisma migration 014_platform_roles). */
export const PLATFORM_ONLY_ROLES = ['org_admin', 'compliance_manager', 'it_security_admin', 'evidence_reviewer', 'senior_approver'] as const;

export const ROLES = [...ENGINE_ROLES, ...PLATFORM_ONLY_ROLES] as const;
export type RoleName = (typeof ROLES)[number];

export const ROLE_LABELS: Record<RoleName, string> = {
  platform_admin: 'Platform administrator',
  bhd_operator: 'BHD operator',
  prime: 'Prime contractor',
  sub: 'Contractor',
  assessor_read_only: 'External assessor (read-only)',
  org_admin: 'Organization administrator',
  compliance_manager: 'Compliance manager',
  it_security_admin: 'IT / security administrator',
  evidence_reviewer: 'Evidence reviewer',
  senior_approver: 'Senior approver',
};

export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  platform_admin: 'Blue Heron Defense staff. Manages users and roles, reads the audit log, edits and publishes CES-Shared content (a second administrator publishes each draft). Holds no customer data (BHD role review PB-01): Home, Shared Foundation and Administration only.',
  bhd_operator: 'Blue Heron Defense / delivery team. Runs engagements end to end: discovery, live access, plan push, Stamper, results. The only role that sees Stamper.',
  prime: 'Prime contractor (engine role). Manages its engagement and subcontractors, runs discovery, pushes plans.',
  sub: 'Contractor being assessed (engine role). Answers the interview for its own organisation.',
  assessor_read_only: 'C3PAO assessor or reviewer. Reads the assessor workspace and evidence packages; changes nothing.',
  org_admin: "Customer executive or IT lead. Owns the organisation profile, systems, scope and the organisation's own users; approves plans; never sees Stamper.",
  compliance_manager: 'Customer cyber-security leadership (CISO). Runs assessments, plans remediation, owns evidence and assessment preparation; approves plans and snapshots. Inherits the prime engine role.',
  it_security_admin: 'Customer CIS administrator. Runs discovery, executes governed AdminOps changes and monitors drift; never sees Stamper. Inherits the prime engine role for discovery and plan status.',
  evidence_reviewer: 'Reviews and approves evidence for objectives it did not upload. Read access to assessments and preparation.',
  senior_approver: 'Second person for high-risk changes: approves AdminOps Tier-3 operations, plan sign-off and monitor escalations. Never approves its own request.',
};

/**
 * Role inheritance: a platform role acts as these engine roles for every
 * existing requireRole() list. Engine roles inherit only themselves.
 */
export const ROLE_INHERITS: Record<RoleName, readonly EngineRole[]> = {
  platform_admin: ['platform_admin'],
  bhd_operator: ['bhd_operator'],
  prime: ['prime'],
  sub: ['sub'],
  assessor_read_only: ['assessor_read_only'],
  org_admin: ['prime'],
  compliance_manager: ['prime'],
  it_security_admin: ['prime', 'sub'],
  evidence_reviewer: ['assessor_read_only'],
  senior_approver: ['assessor_read_only'],
};

/** The role itself plus the engine roles it inherits. Unknown roles map to nothing. */
export function effectiveRoles(role: string | undefined): readonly string[] {
  if (!role || !isRole(role)) return [];
  const set = new Set<string>([role, ...ROLE_INHERITS[role]]);
  return [...set];
}

export type LifecycleScope = 'home' | 'shared' | 'onboard' | 'assess' | 'plan' | 'remediate.stamper' | 'remediate.adminops' | 'remediate.tracking' | 'evidence' | 'monitor' | 'prepare' | 'admin';
export type LifecycleAction = 'view' | 'edit' | 'approve' | 'execute' | 'admin';

const V: readonly LifecycleAction[] = ['view'];
const VE: readonly LifecycleAction[] = ['view', 'edit'];
const VEX: readonly LifecycleAction[] = ['view', 'edit', 'execute'];
const VEA: readonly LifecycleAction[] = ['view', 'edit', 'approve'];
const VA: readonly LifecycleAction[] = ['view', 'approve'];
const ALL: readonly LifecycleAction[] = ['view', 'edit', 'approve', 'execute', 'admin'];

/**
 * Section-level access for the lifecycle UI. Must equal RBAC_MATRIX in
 * ces-muster/src/features/portal/lifecycle/rbac.ts (parity test
 * tests/platformRoles.test.ts). Stamper: BHD only. AdminOps: customer CIS admin
 * executes, senior approver approves (BHD walkthrough 2026-11-04).
 */
// BHD role review PB-01 + platformAdminFence.ts: a platform administrator holds NO
// customer data, so platform_admin appears only in home / shared / admin. BHD staff
// who run engagements use bhd_operator (msutton may need both accounts — decision open).
export const PLATFORM_ROLE_MATRIX: Record<LifecycleScope, Partial<Record<RoleName, readonly LifecycleAction[]>>> = {
  home: { platform_admin: V, bhd_operator: V, org_admin: V, compliance_manager: V, it_security_admin: V, evidence_reviewer: V, senior_approver: V },
  shared: { platform_admin: ['view', 'edit', 'admin'], bhd_operator: V, org_admin: V, compliance_manager: V, it_security_admin: V, evidence_reviewer: V, senior_approver: V, assessor_read_only: V },
  onboard: { bhd_operator: VE, org_admin: VEA, compliance_manager: VE, it_security_admin: VE, evidence_reviewer: V, senior_approver: V },
  assess: { bhd_operator: VEX, org_admin: V, compliance_manager: ['view', 'edit', 'execute', 'approve'], it_security_admin: VEX, evidence_reviewer: V, senior_approver: V },
  plan: { bhd_operator: VEX, org_admin: VA, compliance_manager: VEA, it_security_admin: VE, evidence_reviewer: V, senior_approver: VA },
  // DP-2 (walkthrough 2026-11-04): a Stamper run is requested by one BHD operator and approved by a second one.
  'remediate.stamper': { bhd_operator: ['view', 'edit', 'approve', 'execute'] },
  // AdminOps: the customer's CIS administrator requests and executes; a senior approver or BHD approves.
  'remediate.adminops': { bhd_operator: ['view', 'approve', 'execute'], org_admin: V, compliance_manager: V, it_security_admin: VEX, senior_approver: VA },
  'remediate.tracking': { bhd_operator: VE, org_admin: V, compliance_manager: VE, it_security_admin: VE, evidence_reviewer: V, senior_approver: V },
  evidence: { bhd_operator: VE, org_admin: V, compliance_manager: VE, it_security_admin: VE, evidence_reviewer: VA, senior_approver: V },
  monitor: { bhd_operator: VE, org_admin: V, compliance_manager: VE, it_security_admin: VEX, evidence_reviewer: V, senior_approver: VA },
  prepare: { bhd_operator: VE, org_admin: V, compliance_manager: VEA, it_security_admin: V, evidence_reviewer: V, senior_approver: V, assessor_read_only: V },
  admin: { platform_admin: ALL, bhd_operator: V, org_admin: VE },
};

export interface PermissionDef {
  id: string;
  group: 'Administration' | 'Engagements' | 'Assessment' | 'Discovery & live access' | 'Plan & Stamper' | 'Contracts' | 'Operations' | 'CES-Shared';
  label: string;
  /** Engine roles the route names; platform roles get it through ROLE_INHERITS. */
  roles: readonly EngineRole[];
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

/** Permission ids a role holds, through inheritance. */
export function permissionsFor(role: string): string[] {
  const eff = effectiveRoles(role);
  return PERMISSIONS.filter((p) => p.roles.some((r) => eff.includes(r))).map((p) => p.id);
}

export function can(role: string | undefined, permission: string): boolean {
  if (!role) return false;
  const def = PERMISSIONS.find((p) => p.id === permission);
  if (!def) return false;
  const eff = effectiveRoles(role);
  return def.roles.some((r) => eff.includes(r));
}
