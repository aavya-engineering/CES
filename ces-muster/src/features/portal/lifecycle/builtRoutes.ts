// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// builtRoutes.ts — Sprint 1 Foundation: which lifecycle pages already have a
// screen (and where), which sprint builds the rest, and which engine API serves
// each section today. Everything not listed here opens LifecycleScaffoldPage.

import type { MusterView, StaticRouteId } from '../nav';
import type { LifecycleSectionKey } from './navigation';

export interface BuiltTarget {
  route: StaticRouteId;
  view?: MusterView;
  /** Keep the Sprint-1/2 test ids so existing tests and QA scripts still find the links. */
  testId?: string;
  /** Shown only to these platform roles even when the group is visible (the API behind the screen is fenced to them). */
  onlyRoles?: readonly string[];
}

/** Lifecycle page path → the screen that already exists. */
export const BUILT: Readonly<Record<string, BuiltTarget>> = {
  '/shared/overview': { route: 'shared/overview', testId: 'nav-shared-overview' },
  '/shared/reference-data/110-requirements': { route: 'shared/requirements', testId: 'nav-shared-requirements' },
  '/shared/reference-data/sprs-weight-table': { route: 'shared/sprs', testId: 'nav-shared-sprs' },
  '/shared/reference-data/version-compatibility': { route: 'shared/compat', testId: 'nav-shared-compat' },

  '/onboard/engagement-management/all-engagements': { route: 'engagements/all', testId: 'nav-engagements-all' },
  '/onboard/engagement-management/create-engagement': { route: 'muster', view: 'assessment', testId: 'nav-engagements-create' },
  '/onboard/engagement-management/engagement-details': { route: 'muster', view: 'readiness', testId: 'nav-engagements-workspace' },
  // Sprint 3 slice "Onboard" (2026-11-10): organisations, tenant registry, compliance scope on muster-api.
  '/onboard/organization-management/all-organizations': { route: 'onboard/organizations', testId: 'nav-onboard-organizations' },
  '/onboard/organization-management/create-organization': { route: 'onboard/organizations' },
  '/onboard/organization-management/edit-organization': { route: 'onboard/organizations' },
  '/onboard/organization-management/delete-organization': { route: 'onboard/organizations' },
  '/onboard/organization-management/organization-profile-view': { route: 'onboard/organizations' },
  '/onboard/tenant-management/all-tenants': { route: 'onboard/tenants', testId: 'nav-onboard-tenants' },
  '/onboard/tenant-management/register-tenant': { route: 'onboard/tenants', testId: 'nav-engagements-tenants' },
  '/onboard/tenant-management/tenant-details': { route: 'onboard/tenants' },
  '/onboard/tenant-management/tenant-configuration': { route: 'onboard/tenants' },
  '/onboard/tenant-management/tenant-connections-test-status': { route: 'onboard/tenants' },
  '/onboard/tenant-management/edit-tenants': { route: 'onboard/tenants' },
  '/onboard/tenant-management/delete-tenant': { route: 'onboard/tenants' },
  '/onboard/compliance-scope/scope-definition': { route: 'onboard/scope', testId: 'nav-onboard-scope' },
  '/onboard/compliance-scope/cui-boundary': { route: 'onboard/scope' },
  '/onboard/compliance-scope/in-scope-assets': { route: 'onboard/scope' },
  '/onboard/compliance-scope/out-of-scope-assets': { route: 'onboard/scope' },
  '/onboard/compliance-scope/external-service-providers': { route: 'onboard/scope' },
  '/onboard/compliance-scope/scope-approval': { route: 'onboard/scope' },

  '/assess/discovery/discovery-overview': { route: 'muster', view: 'discovery', testId: 'nav-muster-discovery' },
  '/assess/adaptive-interviews/interview-sessions': { route: 'muster', view: 'assessment', testId: 'nav-muster-situation' },
  // Sprint 3/4 slice "Assess" (2026-11-10): persisted runs on muster-api. The device-local Muster Readiness tab stays reachable from Discovery.
  '/assess/assessment-overview/assessment-dashboard': { route: 'assess/readiness' },
  '/assess/assessment-overview/assessment-status': { route: 'assess/readiness' },
  '/assess/readiness-assessment/readiness-overview': { route: 'assess/readiness', testId: 'nav-muster-readiness' },
  '/assess/readiness-assessment/by-control-family': { route: 'assess/readiness' },
  '/assess/readiness-assessment/trends-history': { route: 'assess/readiness' },
  '/assess/gap-analysis/gap-summary': { route: 'assess/gaps', testId: 'nav-assess-gaps' },
  '/assess/gap-analysis/gaps-by-requirement': { route: 'assess/gaps' },
  '/assess/gap-analysis/gaps-by-control-family': { route: 'assess/gaps' },
  '/assess/gap-analysis/gap-details': { route: 'assess/gaps' },
  '/assess/gap-analysis/assessment-review': { route: 'assess/gaps' },
  '/assess/discovery/prior-results': { route: 'muster', view: 'readiness' },
  '/assess/compliance-assessment/110-requirements': { route: 'shared/requirements' },
  '/assess/compliance-assessment/assessment-objectives': { route: 'shared/objectives', testId: 'nav-shared-objectives' },

  // Sprint 4 slice "Plan" (2026-11-10): actions from gaps, prioritisation, POA&M on muster-api. The Muster mission-plan push stays under Plan Artifacts.
  '/plan/planning-overview': { route: 'plan/overview', testId: 'nav-plan-overview' },
  '/plan/remediation-planning/remediation-plan': { route: 'plan/actions', testId: 'nav-muster-plan' },
  '/plan/remediation-planning/create-remediation-plan': { route: 'plan/actions' },
  '/plan/remediation-planning/plan-details': { route: 'plan/actions' },
  '/plan/remediation-planning/plan-by-requirement': { route: 'plan/actions' },
  '/plan/remediation-planning/plan-by-control-family': { route: 'plan/actions' },
  '/plan/action-management/all-action-items': { route: 'plan/actions', testId: 'nav-plan-actions' },
  '/plan/action-management/create-action-item': { route: 'plan/actions' },
  '/plan/action-management/assign-owners': { route: 'plan/actions' },
  '/plan/action-management/dependencies': { route: 'plan/actions' },
  '/plan/action-management/milestones': { route: 'plan/poam' },
  '/plan/action-management/due-dates': { route: 'plan/actions' },
  '/plan/prioritization/risk-based-priorities': { route: 'plan/actions' },
  '/plan/prioritization/critical-gaps': { route: 'assess/gaps' },
  '/plan/prioritization/resource-effort-estimates': { route: 'plan/actions' },
  '/plan/prioritization/implementation-sequence': { route: 'plan/actions' },
  '/plan/poa-m-planning/poa-m-overview': { route: 'plan/overview' },
  '/plan/poa-m-planning/poa-m-items': { route: 'plan/poam', testId: 'nav-plan-poam' },
  '/plan/poa-m-planning/milestones-target-dates': { route: 'plan/poam' },
  '/plan/poa-m-planning/cost-resources': { route: 'plan/poam' },
  '/plan/plan-artifacts/plan-summary': { route: 'plan/overview' },
  '/plan/plan-artifacts/readiness-record': { route: 'assess/readiness' },
  '/plan/plan-artifacts/plan-bundle': { route: 'muster', view: 'plan' },

  '/remediate/configuration-management-stamper/configuration-overview': { route: 'module/stamper', testId: 'nav-module-stamper' },
  '/remediate/administrative-operations-adminops/adminops-overview': { route: 'module/adminops', testId: 'nav-module-adminops' },

  '/evidence/evidence-overview/evidence-dashboard': { route: 'module/evidenceops', testId: 'nav-module-evidenceops' },
  '/evidence/standard-evidence-catalog/standard-evidence-documents': { route: 'shared/evidence', testId: 'nav-shared-evidence' },
  '/evidence/standard-evidence-catalog/requirement-to-evidence-mapping': { route: 'shared/mapping', testId: 'nav-shared-mapping' },
  '/evidence/standard-evidence-catalog/evidence-instructions': { route: 'shared/rules', testId: 'nav-shared-rules' },

  // /api/users is platform_admin only (RBAC-01); org-scoped user administration is a later slice.
  '/admin/users-roles/user-management': { route: 'platform/users', testId: 'nav-platform-users', onlyRoles: ['platform_admin'] },
  '/admin/users-roles/role-management': { route: 'platform/roles', testId: 'nav-platform-roles' },
  '/admin/users-roles/permission-management': { route: 'platform/roles' },
  '/admin/audit-log': { route: 'platform/audit', testId: 'nav-platform-audit' },
};

export interface SectionPlan {
  sprint: string;
  dates: string;
  /** Which engine API the unified UI will call for this section. */
  backend: string;
  port?: number;
}

/** From "Sprint Plans" (BHD, 2026-11-10): which sprint builds each section. */
export const SECTION_PLAN: Record<LifecycleSectionKey, SectionPlan> = {
  shared: { sprint: 'Sprint 2 — CES-Shared Core', dates: '30 Nov – 11 Dec 2026', backend: 'muster-api /api/v1/ces-shared (reference data facade over ces-shared JSON)', port: 4000 },
  onboard: { sprint: 'Sprint 3 — Engagement & Muster I', dates: '14 – 25 Dec 2026', backend: 'muster-api /api/organizations, /api/customer-tenants, /api/engagements(/:id/scope), /api/parties, /api/contracts', port: 4000 },
  assess: { sprint: 'Sprint 3–4 — Muster I & II', dates: '14 Dec 2026 – 8 Jan 2027', backend: 'muster-api /api/engagements/:id/assessments (runs, gaps, overrides), /api/discovery, /api/interview, /api/sessions, /api/hil; ces-eo assessment (authoritative status)', port: 4000 },
  plan: { sprint: 'Sprint 4 — Muster II & Readiness', dates: '28 Dec 2026 – 8 Jan 2027', backend: 'muster-api /api/engagements/:id/plan (actions, POA&M), /api/plan/compile, /api/plan/push; ces-eo POA&M generator', port: 4000 },
  remediate: { sprint: 'Sprint 5 — Stamper & AdminOps MVP', dates: '11 – 22 Jan 2027', backend: 'ces-stamper API (:5002 / GUI :3000) and ces-ao API (:5003 / :3001); approvals via EO approver tokens' },
  evidence: { sprint: 'Sprint 6 — EvidenceOps & AI MVP', dates: '25 Jan – 5 Feb 2027', backend: 'ces-eo (:5004 / :4002) collectors, reviews, catalog; ces-ec (:4001) write-once uploads' },
  monitor: { sprint: 'Sprint 6 — EvidenceOps & AI MVP', dates: '25 Jan – 5 Feb 2027', backend: 'ces-eo scheduler, drift, leaver flow (ces-ao), access review' },
  prepare: { sprint: 'Sprint 6 — EvidenceOps & AI MVP', dates: '25 Jan – 5 Feb 2027', backend: 'ces-eo SSP / POA&M / SPRS / evidence packager / assessor view' },
  admin: { sprint: 'Sprint 1 — Foundation', dates: '16 – 27 Nov 2026', backend: 'muster-api /api/users, /api/audit-events, /api/users/roles (RBAC-01)', port: 4000 },
};
