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
  | 'shared/registry'
  | 'shared/compat'
  | 'shared/interfaces'
  | 'store/adminops'
  | 'store/tokens'
  | 'store/passkeys'
  | 'store/integrity'
  | 'engagements/tenants'
  | 'engagements/all'
  | 'muster'
  | 'module/stamper'
  | 'module/adminops'
  | 'module/evidenceops'
  | 'platform/users'
  | 'platform/roles'
  | 'platform/audit'
  | 'account/password'
  | 'help';

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
  /** S1.9: icon name from icons.tsx (NavIcon). */
  icon?: string;
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
  sections.push({ id: 'home', label: 'Home', icon: 'home', route: 'home', items: [] });

  sections.push({
    id: 'shared',
    label: 'CES-Shared',
    icon: 'shared',
    items: [
      { label: 'Overview', route: 'shared/overview', testId: 'nav-shared-overview', icon: 'overview' },
      { label: '110 Requirements', route: 'shared/requirements', group: 'Reference Data', testId: 'nav-shared-requirements', icon: 'requirements' },
      { label: 'SPRS Weight Table', route: 'shared/sprs', group: 'Reference Data', testId: 'nav-shared-sprs', icon: 'sprs' },
      { label: 'Assessment Objectives', route: 'shared/objectives', group: 'Reference Data', testId: 'nav-shared-objectives', icon: 'objectives' },
      { label: 'Standard Evidence Catalog', route: 'shared/evidence', group: 'Standard Evidence & Evaluation Rules', testId: 'nav-shared-evidence', icon: 'catalog' },
      { label: 'Requirement-to-Evidence Mapping', route: 'shared/mapping', group: 'Standard Evidence & Evaluation Rules', testId: 'nav-shared-mapping', icon: 'mapping' },
      { label: 'Evaluation Rules', route: 'shared/rules', group: 'Standard Evidence & Evaluation Rules', testId: 'nav-shared-rules', icon: 'rules' },
      // S1.9: groups added from the Create Requirement mockup (decision 2026-10-27: new
      // sidebar, Standard Evidence & Evaluation Rules kept). Screens not built are "Planned".
      { label: 'Contract Registry', route: 'shared/registry', planned: true, testId: 'nav-shared-registry', icon: 'registry' },
      { label: 'Golden Files', route: 'shared/contracts', group: 'Contract Validation', testId: 'nav-shared-contracts', icon: 'golden' },
      { label: 'Contract Tests', route: 'shared/tests', group: 'Contract Validation', planned: true, testId: 'nav-shared-tests', icon: 'tests' },
      { label: 'Version Compatibility', route: 'shared/compat', group: 'Contract Validation', planned: true, testId: 'nav-shared-compat', icon: 'compat' },
      { label: 'Interfaces', route: 'shared/interfaces', planned: true, testId: 'nav-shared-interfaces', icon: 'interfaces' },
      // Evidence Store holds customer evidence and operator security events: not for a
      // platform administrator (BHD role review, doc 28 D-1).
      ...(admin
        ? []
        : [
            { label: 'AdminOps Evidence', route: 'store/adminops' as const, group: 'Evidence Store', planned: true, testId: 'nav-store-adminops', icon: 'adminops' },
            { label: 'Approver Token Mints', route: 'store/tokens' as const, group: 'Evidence Store', planned: true, testId: 'nav-store-tokens', icon: 'tokens' },
            { label: 'Operator Passkey Events', route: 'store/passkeys' as const, group: 'Evidence Store', planned: true, testId: 'nav-store-passkeys', icon: 'passkeys' },
            { label: 'Storage Integrity', route: 'store/integrity' as const, group: 'Evidence Store', planned: true, testId: 'nav-store-integrity', icon: 'integrity' },
          ]),
    ],
  });

  if (!admin) {
    sections.push({
      id: 'muster',
      label: 'Muster',
      icon: 'muster',
      mod: 'muster',
      items: [
        { label: 'Situation', route: 'muster', view: 'assessment', testId: 'nav-muster-situation', icon: 'situation' },
        { label: 'Discovery', route: 'muster', view: 'discovery', testId: 'nav-muster-discovery', icon: 'discovery' },
        { label: 'Readiness', route: 'muster', view: 'readiness', testId: 'nav-muster-readiness', icon: 'readiness' },
        { label: 'Plan', route: 'muster', view: 'plan', testId: 'nav-muster-plan', icon: 'plan' },
        { label: 'Contracts', route: 'muster', view: 'contracts', testId: 'nav-muster-contracts', icon: 'contracts' },
        { label: 'Quick Session', route: 'muster', view: 'quick-session', testId: 'nav-muster-quick', icon: 'quick' },
        { label: 'Help', route: 'muster', view: 'help', testId: 'nav-muster-help', icon: 'help' },
      ],
    });
    sections.push(
      { id: 'stamper', label: 'Stamper', icon: 'stamper', mod: 'stamper', items: [{ label: 'Open Stamper', route: 'module/stamper', testId: 'nav-module-stamper', icon: 'stamper' }] },
      { id: 'adminops', label: 'AdminOps', icon: 'adminops', mod: 'adminops', items: [{ label: 'Open AdminOps', route: 'module/adminops', testId: 'nav-module-adminops', icon: 'adminops' }] },
      { id: 'evidenceops', label: 'EvidenceOps', icon: 'evidenceops', mod: 'evidenceops', items: [{ label: 'Open EvidenceOps', route: 'module/evidenceops', testId: 'nav-module-evidenceops', icon: 'evidenceops' }] }
    );
    // S1.9: the new mockup lists Engagements after the four modules.
    sections.push({
      id: 'engagements',
      label: 'Engagements',
      icon: 'engagements',
      items: [
        { label: 'Tenant Registration', route: 'engagements/tenants', planned: true, testId: 'nav-engagements-tenants', icon: 'tenants' },
        { label: 'All Engagements', route: 'engagements/all', testId: 'nav-engagements-all', icon: 'engagements-all' },
        { label: 'Create Engagement', route: 'muster', view: 'assessment', shortcut: true, testId: 'nav-engagements-create', icon: 'engagement-create' },
        { label: 'Engagement Workspace', route: 'muster', view: 'readiness', shortcut: true, testId: 'nav-engagements-workspace', icon: 'workspace' },
      ],
    });
  }

  if (isSignedIn(viewer)) {
    const items: NavItem[] = [];
    if (admin) {
      items.push({ label: 'Users', route: 'platform/users', testId: 'nav-platform-users', icon: 'users' });
    }
    items.push({ label: 'Roles & Permissions', route: 'platform/roles', testId: 'nav-platform-roles', icon: 'roles' });
    if (admin) {
      items.push({ label: 'Audit Log', route: 'platform/audit', testId: 'nav-platform-audit', icon: 'audit' });
    }
    sections.push({ id: 'platform', label: 'Platform / Administration', icon: 'platform', items });
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
  set.add('help');
  return set;
}

/** Where a viewer lands after sign-in (doc 18 §3.3). S1.9: everyone signed in lands on Home / Portfolio. */
export function defaultRoute(viewer: Viewer): RouteId {
  if (viewer.kind === 'offline') return 'muster';
  return 'home';
}

export const ROUTE_TITLES: Record<RouteId, string[]> = {
  home: ['Home'],
  'shared/overview': ['CES-Shared', 'Overview'],
  'shared/requirements': ['CES-Shared', 'Reference Data', '110 Requirements'],
  'shared/sprs': ['CES-Shared', 'Reference Data', 'SPRS Weight Table'],
  'shared/objectives': ['CES-Shared', 'Reference Data', 'Assessment Objectives'],
  'shared/evidence': ['CES-Shared', 'Standard Evidence & Evaluation Rules', 'Standard Evidence Catalog'],
  'shared/mapping': ['CES-Shared', 'Standard Evidence & Evaluation Rules', 'Requirement-to-Evidence Mapping'],
  'shared/rules': ['CES-Shared', 'Standard Evidence & Evaluation Rules', 'Evaluation Rules'],
  'shared/contracts': ['CES-Shared', 'Contract Validation', 'Golden Files'],
  'shared/tests': ['CES-Shared', 'Contract Validation', 'Contract Tests'],
  'shared/registry': ['CES-Shared', 'Contract Registry'],
  'shared/compat': ['CES-Shared', 'Contract Validation', 'Version Compatibility'],
  'shared/interfaces': ['CES-Shared', 'Interfaces'],
  'store/adminops': ['CES-Shared', 'Evidence Store', 'AdminOps Evidence'],
  'store/tokens': ['CES-Shared', 'Evidence Store', 'Approver Token Mints'],
  'store/passkeys': ['CES-Shared', 'Evidence Store', 'Operator Passkey Events'],
  'store/integrity': ['CES-Shared', 'Evidence Store', 'Storage Integrity'],
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
  help: ['Help'],
};

export function isRouteId(value: string): value is RouteId {
  return Object.prototype.hasOwnProperty.call(ROUTE_TITLES, value);
}
