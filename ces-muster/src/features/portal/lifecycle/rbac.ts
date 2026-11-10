// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// rbac.ts — Sprint 1 Foundation (S1-SEC-02 / S1-GUI-03): which lifecycle
// sections and groups each platform role may see, and with which actions.
//
// Sources: BHD walkthrough 2026-11-04 ("Stamper is restricted exclusively to
// BHD's team and never touched by customers"; "AdminOps is used solely by the
// customer's CIS administrator"; Muster by customer security leadership + BHD),
// SOW v1.1 §5 roles, muster-api/src/lib/permissions.ts (engine roles).
//
// The sidebar only HIDES what a role cannot use. muster-api enforces every
// route (requireRole + effectiveRoles); this file must stay in step with
// muster-api/src/lib/permissions.ts PLATFORM_ROLE_MATRIX (parity test).

import type { LifecycleSectionKey } from './navigation';

export const PLATFORM_ROLES = [
  'platform_admin',
  'bhd_operator',
  'org_admin',
  'compliance_manager',
  'it_security_admin',
  'evidence_reviewer',
  'senior_approver',
  'assessor_read_only',
] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const ROLE_LABEL: Record<PlatformRole, string> = {
  platform_admin: 'Platform Administrator',
  bhd_operator: 'BHD Operator',
  org_admin: 'Organization Administrator',
  compliance_manager: 'Compliance Manager',
  it_security_admin: 'IT / Security Administrator',
  evidence_reviewer: 'Evidence Reviewer',
  senior_approver: 'Senior Approver',
  assessor_read_only: 'External Assessor (read-only)',
};

/** Legacy engine roles still issued by muster-api map onto platform roles. */
export const LEGACY_ROLE_ALIAS: Record<string, PlatformRole> = {
  prime: 'compliance_manager',
  sub: 'it_security_admin',
};

export function toPlatformRole(role: string): PlatformRole | null {
  if ((PLATFORM_ROLES as readonly string[]).includes(role)) return role as PlatformRole;
  return LEGACY_ROLE_ALIAS[role] ?? null;
}

export type Action = 'view' | 'edit' | 'approve' | 'execute' | 'admin';

/** Scope keys: a section key, or `remediate.stamper` / `remediate.adminops` / `remediate.tracking`. */
export type ScopeKey = LifecycleSectionKey | 'home' | 'remediate.stamper' | 'remediate.adminops' | 'remediate.tracking';

type Matrix = Record<ScopeKey, Partial<Record<PlatformRole, readonly Action[]>>>;

const V: readonly Action[] = ['view'];
const VE: readonly Action[] = ['view', 'edit'];
const VEX: readonly Action[] = ['view', 'edit', 'execute'];
const VEA: readonly Action[] = ['view', 'edit', 'approve'];
const VA: readonly Action[] = ['view', 'approve'];
const ALL: readonly Action[] = ['view', 'edit', 'approve', 'execute', 'admin'];

export const RBAC_MATRIX: Matrix = {
  home: { platform_admin: V, bhd_operator: V, org_admin: V, compliance_manager: V, it_security_admin: V, evidence_reviewer: V, senior_approver: V },
  shared: { platform_admin: ['view', 'edit', 'admin'], bhd_operator: V, org_admin: V, compliance_manager: V, it_security_admin: V, evidence_reviewer: V, senior_approver: V, assessor_read_only: V },
  onboard: { platform_admin: ALL, bhd_operator: VE, org_admin: VEA, compliance_manager: VE, it_security_admin: VE, evidence_reviewer: V, senior_approver: V },
  assess: { platform_admin: VEX, bhd_operator: VEX, org_admin: V, compliance_manager: ['view', 'edit', 'execute', 'approve'], it_security_admin: VEX, evidence_reviewer: V, senior_approver: V },
  plan: { platform_admin: VEA, bhd_operator: VEX, org_admin: VA, compliance_manager: VEA, it_security_admin: VE, evidence_reviewer: V, senior_approver: VA },
  // Stamper: BHD only (walkthrough 2026-11-04 01:00:11). Customers never see it.
  'remediate.stamper': { platform_admin: ['view', 'execute', 'approve'], bhd_operator: VEX },
  // AdminOps: the customer's CIS administrator runs it; second person approves.
  'remediate.adminops': { platform_admin: ['view', 'execute', 'approve'], bhd_operator: ['view', 'execute'], org_admin: V, compliance_manager: V, it_security_admin: VEX, senior_approver: VA },
  'remediate.tracking': { platform_admin: V, bhd_operator: VE, org_admin: V, compliance_manager: VE, it_security_admin: VE, evidence_reviewer: V, senior_approver: V },
  remediate: {}, // resolved per group, see scopeFor()
  evidence: { platform_admin: VE, bhd_operator: VE, org_admin: V, compliance_manager: VE, it_security_admin: VE, evidence_reviewer: VA, senior_approver: V },
  monitor: { platform_admin: VE, bhd_operator: VE, org_admin: V, compliance_manager: VE, it_security_admin: VEX, evidence_reviewer: V, senior_approver: VA },
  prepare: { platform_admin: VE, bhd_operator: VE, org_admin: V, compliance_manager: VEA, it_security_admin: V, evidence_reviewer: V, senior_approver: V, assessor_read_only: V },
  admin: { platform_admin: ALL, bhd_operator: V, org_admin: VE },
};

/** Groups inside Remediate that map to Stamper / AdminOps / tracking scopes. */
const REMEDIATE_GROUP_SCOPE: Record<string, ScopeKey> = {
  'configuration-management-stamper': 'remediate.stamper',
  'administrative-operations-adminops': 'remediate.adminops',
  'remediation-tracking': 'remediate.tracking',
  'remediation-overview': 'remediate.tracking',
};

/** The assessor sees only these Prepare groups (read-only). */
const ASSESSOR_PREPARE_GROUPS = new Set(['assessor-workspace', 'evidence-packages', 'assessment-documentation']);
/** An org admin manages only users/roles and settings of its own organisation. */
const ORG_ADMIN_ADMIN_GROUPS = new Set(['users-roles', 'settings', 'audit-log']);

export function scopeFor(section: LifecycleSectionKey, groupKey?: string): ScopeKey {
  if (section === 'remediate' && groupKey) return REMEDIATE_GROUP_SCOPE[groupKey] ?? 'remediate.tracking';
  return section;
}

export function actionsFor(role: string, section: LifecycleSectionKey | 'home', groupKey?: string): readonly Action[] {
  const pr = toPlatformRole(role);
  if (!pr) return [];
  const scope = section === 'home' ? 'home' : scopeFor(section, groupKey);
  const actions = RBAC_MATRIX[scope]?.[pr] ?? [];
  if (!actions.length) return [];
  if (pr === 'assessor_read_only' && section === 'prepare' && groupKey && !ASSESSOR_PREPARE_GROUPS.has(groupKey)) return [];
  if (pr === 'org_admin' && section === 'admin' && groupKey && !ORG_ADMIN_ADMIN_GROUPS.has(groupKey)) return [];
  return actions;
}

export function canView(role: string, section: LifecycleSectionKey | 'home', groupKey?: string): boolean {
  return actionsFor(role, section, groupKey).includes('view');
}

export function can(role: string, action: Action, section: LifecycleSectionKey, groupKey?: string): boolean {
  return actionsFor(role, section, groupKey).includes(action);
}

/** Separation-of-duty rules the platform enforces (shown on the Roles page). */
export const SOD_RULES = [
  'An approver can never approve a change they requested.',
  'A reviewer can never review a document they uploaded.',
  'An external assessor cannot hold any other role on the same engagement.',
  'Stamper execution requires a BHD role and the engagement\'s live-access flag.',
] as const;
