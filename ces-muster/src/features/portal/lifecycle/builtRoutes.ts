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
  '/onboard/tenant-management/register-tenant': { route: 'engagements/tenants', testId: 'nav-engagements-tenants' },

  '/assess/discovery/discovery-overview': { route: 'muster', view: 'discovery', testId: 'nav-muster-discovery' },
  '/assess/adaptive-interviews/interview-sessions': { route: 'muster', view: 'assessment', testId: 'nav-muster-situation' },
  '/assess/readiness-assessment/readiness-overview': { route: 'muster', view: 'readiness', testId: 'nav-muster-readiness' },
  '/assess/compliance-assessment/110-requirements': { route: 'shared/requirements' },
  '/assess/compliance-assessment/assessment-objectives': { route: 'shared/objectives', testId: 'nav-shared-objectives' },

  '/plan/remediation-planning/remediation-plan': { route: 'muster', view: 'plan', testId: 'nav-muster-plan' },
  '/plan/plan-artifacts/plan-bundle': { route: 'muster', view: 'result' },

  '/remediate/configuration-management-stamper/configuration-overview': { route: 'module/stamper', testId: 'nav-module-stamper' },
  '/remediate/administrative-operations-adminops/adminops-overview': { route: 'module/adminops', testId: 'nav-module-adminops' },

  '/evidence/evidence-overview/evidence-dashboard': { route: 'module/evidenceops', testId: 'nav-module-evidenceops' },
  '/evidence/standard-evidence-catalog/standard-evidence-documents': { route: 'shared/evidence', testId: 'nav-shared-evidence' },
  '/evidence/standard-evidence-catalog/requirement-to-evidence-mapping': { route: 'shared/mapping', testId: 'nav-shared-mapping' },
  '/evidence/standard-evidence-catalog/evidence-instructions': { route: 'shared/rules', testId: 'nav-shared-rules' },

  '/admin/users-roles/user-management': { route: 'platform/users', testId: 'nav-platform-users' },
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
  onboard: { sprint: 'Sprint 3 — Engagement & Muster I', dates: '14 – 25 Dec 2026', backend: 'muster-api /api/engagements, /api/parties, /api/contracts; ces-tenant registry', port: 4000 },
  assess: { sprint: 'Sprint 3–4 — Muster I & II', dates: '14 Dec 2026 – 8 Jan 2027', backend: 'muster-api /api/discovery, /api/interview, /api/sessions, /api/hil, scoring; ces-eo assessment (authoritative status)', port: 4000 },
  plan: { sprint: 'Sprint 4 — Muster II & Readiness', dates: '28 Dec 2026 – 8 Jan 2027', backend: 'muster-api /api/plan/compile, /api/plan/push; ces-eo POA&M generator', port: 4000 },
  remediate: { sprint: 'Sprint 5 — Stamper & AdminOps MVP', dates: '11 – 22 Jan 2027', backend: 'ces-stamper API (:5002 / GUI :3000) and ces-ao API (:5003 / :3001); approvals via EO approver tokens' },
  evidence: { sprint: 'Sprint 6 — EvidenceOps & AI MVP', dates: '25 Jan – 5 Feb 2027', backend: 'ces-eo (:5004 / :4002) collectors, reviews, catalog; ces-ec (:4001) write-once uploads' },
  monitor: { sprint: 'Sprint 6 — EvidenceOps & AI MVP', dates: '25 Jan – 5 Feb 2027', backend: 'ces-eo scheduler, drift, leaver flow (ces-ao), access review' },
  prepare: { sprint: 'Sprint 6 — EvidenceOps & AI MVP', dates: '25 Jan – 5 Feb 2027', backend: 'ces-eo SSP / POA&M / SPRS / evidence packager / assessor view' },
  admin: { sprint: 'Sprint 1 — Foundation', dates: '16 – 27 Nov 2026', backend: 'muster-api /api/users, /api/audit-events, /api/users/roles (RBAC-01)', port: 4000 },
};
