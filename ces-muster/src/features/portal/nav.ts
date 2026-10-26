// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// nav.ts — UI-02: the portal's navigation model (Aavya mockups, 2026-10-24).
//
// Pure data + pure functions: which sections and items a viewer sees. The
// sidebar only HIDES what a role cannot use; muster-api still enforces every
// rule (muster-api/src/lib/permissions.ts). Items whose screen is not built
// yet are marked `planned` and open an honest "not built yet" page.

export type MusterView = 'assessment' | 'discovery' | 'readiness' | 'plan' | 'contracts' | 'quick-session' | 'help' | 'rollup' | 'result';

export type RouteId =
  | 'home'
  | 'shared/overview'
  | 'shared/requirements'
  | 'shared/sprs'
  | 'shared/objectives'
  | 'shared/evidence'
  | 'shared/mapping'
  | 'shared/rules'
  | 'shared/contracts'
  | 'shared/tests'
  | 'engagements/tenants'
  | 'engagements/all'
  | 'muster'
  | 'module/stamper'
  | 'module/adminops'
  | 'module/evidenceops'
  | 'platform/users'
  | 'platform/roles'
  | 'platform/audit'
  | 'account/password';

/** Who is looking: offline (no account) or a signed-in role. */
export type Viewer = { kind: 'offline' } | { kind: 'signed-in'; role: string };

export interface NavItem {
  label: string;
  route: RouteId;
  /** For route 'muster': which Muster view to open. */
  view?: MusterView;
  planned?: boolean;
  /** Shortcut to a screen another item owns: never shown as the current page. */
  shortcut?: boolean;
  /** S1.4: wireframe sub-group heading inside a section (e.g. "Reference Data"). */
  group?: string;
  testId: string;
}

export interface NavSection {
  id: string;
  label: string;
  icon: string;
  mod?: 'muster' | 'stamper' | 'adminops' | 'evidenceops';
  /** A section with one route and no children (Home). */
  route?: RouteId;
  items: NavItem[];
}

const isAdmin = (v: Viewer) => v.kind === 'signed-in' && v.role === 'platform_admin';
const isSignedIn = (v: Viewer) => v.kind === 'signed-in';

/** Sections a viewer sees, in sidebar order. */
export function navFor(viewer: Viewer): NavSection[] {
  const admin = isAdmin(viewer);
  const sections: NavSection[] = [];

  // A platform administrator has no customer data (BHD role review PB-01): no
  // engagements or modules. S1.8 (doc 28 D-1): Home / Portfolio shows them counts only.
  sections.push({ id: 'home', label: 'Home / Portfolio', icon: '⌂', route: 'home', items: [] });

  sections.push({
    id: 'shared',
    label: 'CES-Shared',
    icon: '◈',
    items: [
      { label: 'Overview', route: 'shared/overview', testId: 'nav-shared-overview' },
      { label: '110 Requirements', route: 'shared/requirements', group: 'Reference Data', testId: 'nav-shared-requirements' },
      { label: 'SPRS Weight Table', route: 'shared/sprs', group: 'Reference Data', testId: 'nav-shared-sprs' },
      { label: 'Assessment Objectives', route: 'shared/objectives', group: 'Reference Data', testId: 'nav-shared-objectives' },
      { label: 'Standard Evidence Catalog', route: 'shared/evidence', group: 'Standard Evidence & Evaluation Rules', testId: 'nav-shared-evidence' },
      { label: 'Requirement-to-Evidence Mapping', route: 'shared/mapping', group: 'Standard Evidence & Evaluation Rules', testId: 'nav-shared-mapping' },
      { label: 'Evaluation Rules', route: 'shared/rules', group: 'Standard Evidence & Evaluation Rules', testId: 'nav-shared-rules' },
      { label: 'Golden Files', route: 'shared/contracts', group: 'Contract Validation', testId: 'nav-shared-contracts' },
      { label: 'Contract Tests', route: 'shared/tests', group: 'Contract Validation', planned: true, testId: 'nav-shared-tests' },
    ],
  });

  if (!admin) {
    sections.push({
      id: 'engagements',
      label: 'Engagements',
      icon: '▤',
      items: [
        { label: 'Tenant Registration', route: 'engagements/tenants', planned: true, testId: 'nav-engagements-tenants' },
        { label: 'All Engagements', route: 'engagements/all', testId: 'nav-engagements-all' },
        { label: 'Create Engagement', route: 'muster', view: 'assessment', shortcut: true, testId: 'nav-engagements-create' },
        { label: 'Engagement Workspace', route: 'muster', view: 'readiness', shortcut: true, testId: 'nav-engagements-workspace' },
      ],
    });
    sections.push({
      id: 'muster',
      label: 'Muster',
      icon: 'M',
      mod: 'muster',
      items: [
        { label: 'Situation', route: 'muster', view: 'assessment', testId: 'nav-muster-situation' },
        { label: 'Discovery', route: 'muster', view: 'discovery', testId: 'nav-muster-discovery' },
        { label: 'Readiness', route: 'muster', view: 'readiness', testId: 'nav-muster-readiness' },
        { label: 'Plan', route: 'muster', view: 'plan', testId: 'nav-muster-plan' },
        { label: 'Contracts', route: 'muster', view: 'contracts', testId: 'nav-muster-contracts' },
        { label: 'Quick Session', route: 'muster', view: 'quick-session', testId: 'nav-muster-quick' },
        { label: 'Help', route: 'muster', view: 'help', testId: 'nav-muster-help' },
      ],
    });
    sections.push(
      { id: 'stamper', label: 'Stamper', icon: 'S', mod: 'stamper', items: [{ label: 'Open Stamper', route: 'module/stamper', testId: 'nav-module-stamper' }] },
      { id: 'adminops', label: 'AdminOps', icon: 'A', mod: 'adminops', items: [{ label: 'Open AdminOps', route: 'module/adminops', testId: 'nav-module-adminops' }] },
      { id: 'evidenceops', label: 'EvidenceOps', icon: 'E', mod: 'evidenceops', items: [{ label: 'Open EvidenceOps', route: 'module/evidenceops', testId: 'nav-module-evidenceops' }] }
    );
  }

  if (isSignedIn(viewer)) {
    const items: NavItem[] = [];
    if (admin) {
      items.push({ label: 'Users', route: 'platform/users', testId: 'nav-platform-users' });
    }
    items.push({ label: 'Roles & Permissions', route: 'platform/roles', testId: 'nav-platform-roles' });
    if (admin) {
      items.push({ label: 'Audit Log', route: 'platform/audit', testId: 'nav-platform-audit' });
    }
    sections.push({ id: 'platform', label: 'Platform / Administration', icon: '⚙', items });
  }
  return sections;
}

/** Every route the viewer may open (used to refuse a typed-in URL hash). */
export function routesFor(viewer: Viewer): Set<RouteId> {
  const set = new Set<RouteId>();
  for (const s of navFor(viewer)) {
    if (s.route) set.add(s.route);
    for (const i of s.items) set.add(i.route);
  }
  if (isSignedIn(viewer)) set.add('account/password');
  return set;
}

/** Where a viewer lands after sign-in (doc 18 §3.3). */
export function defaultRoute(viewer: Viewer): RouteId {
  if (viewer.kind === 'offline') return 'muster';
  if (viewer.role === 'platform_admin') return 'platform/users';
  return 'home';
}

export const ROUTE_TITLES: Record<RouteId, string[]> = {
  home: ['Home / Portfolio'],
  'shared/overview': ['CES-Shared', 'Overview'],
  'shared/requirements': ['CES-Shared', 'Reference Data', '110 Requirements'],
  'shared/sprs': ['CES-Shared', 'Reference Data', 'SPRS Weight Table'],
  'shared/objectives': ['CES-Shared', 'Reference Data', 'Assessment Objectives'],
  'shared/evidence': ['CES-Shared', 'Standard Evidence & Evaluation Rules', 'Standard Evidence Catalog'],
  'shared/mapping': ['CES-Shared', 'Standard Evidence & Evaluation Rules', 'Requirement-to-Evidence Mapping'],
  'shared/rules': ['CES-Shared', 'Standard Evidence & Evaluation Rules', 'Evaluation Rules'],
  'shared/contracts': ['CES-Shared', 'Contract Validation', 'Golden Files'],
  'shared/tests': ['CES-Shared', 'Contract Validation', 'Contract Tests'],
  'engagements/tenants': ['Engagements', 'Tenant Registration'],
  'engagements/all': ['Engagements', 'All Engagements'],
  muster: ['Muster'],
  'module/stamper': ['Stamper'],
  'module/adminops': ['AdminOps'],
  'module/evidenceops': ['EvidenceOps'],
  'platform/users': ['Platform / Administration', 'Users'],
  'platform/roles': ['Platform / Administration', 'Roles & Permissions'],
  'platform/audit': ['Platform / Administration', 'Audit Log'],
  'account/password': ['Account', 'Change Password'],
};

export function isRouteId(value: string): value is RouteId {
  return Object.prototype.hasOwnProperty.call(ROUTE_TITLES, value);
}
