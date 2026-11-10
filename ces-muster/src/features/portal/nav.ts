// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// nav.ts — UI-02 / Sprint 1 Foundation: the portal's navigation model.
//
// Pure data + pure functions: which sections and items a viewer sees. The
// sidebar only HIDES what a role cannot use; muster-api still enforces every
// rule (muster-api/src/lib/permissions.ts).
//
// Sprint 1 Foundation (2026-11-10): a signed-in viewer gets the LIFECYCLE
// navigation from "CES Navigation.xlsx" (Shared Foundation → Onboard → Assess →
// Plan → Remediate → Collect Evidence → Monitor → Prepare for Assessment →
// Administration), filtered by lifecycle/rbac.ts. Pages that already have a
// screen open it (lifecycle/builtRoutes.ts); the rest open an honest scaffold
// (`lc/<section>/<group>/<item>`) that says which sprint builds it and which
// engine API it will call. The offline (no account) viewer keeps the Muster-only
// navigation of Sprint 1.

import { BUILT } from './lifecycle/builtRoutes';
import { LIFECYCLE_NAV, LIFECYCLE_PAGES, type LifecycleSection } from './lifecycle/navigation';
import { canView, toPlatformRole } from './lifecycle/rbac';

export type MusterView = 'assessment' | 'discovery' | 'readiness' | 'plan' | 'contracts' | 'quick-session' | 'help' | 'rollup' | 'result';

export type StaticRouteId =
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

/** A lifecycle scaffold route: `lc` + the page path from navigation.ts (`lc/assess/discovery/sync-status`). */
export type LifecycleRouteId = `lc/${string}`;

export type RouteId = StaticRouteId | LifecycleRouteId;

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
  /** Sub-group heading inside a section (lifecycle group label). */
  group?: string;
  /** Icon name from icons.tsx (NavIcon). */
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

export const lifecycleRoute = (path: string): LifecycleRouteId => `lc/${path.replace(/^\//, '')}`;
export const lifecyclePath = (route: LifecycleRouteId): string => '/' + route.slice(3);
export const isLifecycleRoute = (r: string): r is LifecycleRouteId => r.startsWith('lc/') && LIFECYCLE_PAGES.has('/' + r.slice(3));

const SECTION_ICON: Record<string, string> = {
  shared: 'shared', onboard: 'engagements', assess: 'muster', plan: 'plan', remediate: 'stamper', evidence: 'evidenceops', monitor: 'readiness', prepare: 'contracts', admin: 'platform',
};
const SECTION_MOD: Record<string, NavSection['mod']> = { onboard: 'muster', assess: 'muster', plan: 'muster', remediate: 'stamper', evidence: 'evidenceops', monitor: 'evidenceops', prepare: 'evidenceops' };

function itemFor(section: LifecycleSection, path: string, label: string, groupLabel?: string): NavItem {
  const built = BUILT[path];
  const testId = built?.testId ?? `nav-lc-${path.replace(/^\//, '').replace(/\//g, '-')}`;
  if (built) return { label, route: built.route, view: built.view, group: groupLabel, testId, icon: SECTION_ICON[section.key] };
  return { label, route: lifecycleRoute(path), planned: true, group: groupLabel, testId, icon: SECTION_ICON[section.key] };
}

/** Lifecycle sections for a signed-in role (sidebar order = lifecycle order). */
export function lifecycleNavFor(role: string): NavSection[] {
  const out: NavSection[] = [];
  for (const section of LIFECYCLE_NAV) {
    if (!canView(role, section.key)) continue;
    const items: NavItem[] = [];
    for (const group of section.groups) {
      if (!canView(role, section.key, group.key)) continue;
      if (group.items.length === 0) {
        // A group without pages (Overview, Audit Log) is a page itself.
        items.push(itemFor(section, group.path, group.label));
        continue;
      }
      for (const item of group.items) items.push(itemFor(section, item.path, item.label, group.label));
    }
    if (!items.length) continue;
    out.push({ id: section.key, label: section.label, icon: SECTION_ICON[section.key] ?? 'overview', mod: SECTION_MOD[section.key], items });
  }
  return out;
}

/** Sections a viewer sees, in sidebar order. */
export function navFor(viewer: Viewer): NavSection[] {
  const sections: NavSection[] = [];
  sections.push({ id: 'home', label: 'Home', icon: 'home', route: 'home', items: [] });

  if (isSignedIn(viewer) && toPlatformRole(viewer.role)) {
    sections.push(...lifecycleNavFor(viewer.role));
    return sections;
  }

  // Offline viewer (no account): the Sprint-1 Muster-only navigation.
  sections.push({
    id: 'shared',
    label: 'Shared Foundation',
    icon: 'shared',
    items: [
      { label: 'Overview', route: 'shared/overview', testId: 'nav-shared-overview', icon: 'overview' },
      { label: '110 Requirements', route: 'shared/requirements', group: 'Reference Data', testId: 'nav-shared-requirements', icon: 'requirements' },
      { label: 'SPRS Weight Table', route: 'shared/sprs', group: 'Reference Data', testId: 'nav-shared-sprs', icon: 'sprs' },
      { label: 'Assessment Objectives', route: 'shared/objectives', group: 'Reference Data', testId: 'nav-shared-objectives', icon: 'objectives' },
      { label: 'Standard Evidence Catalog', route: 'shared/evidence', group: 'Standard Evidence & Evaluation Rules', testId: 'nav-shared-evidence', icon: 'catalog' },
      { label: 'Requirement-to-Evidence Mapping', route: 'shared/mapping', group: 'Standard Evidence & Evaluation Rules', testId: 'nav-shared-mapping', icon: 'mapping' },
    ],
  });
  if (!isAdmin(viewer)) {
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

/** Where a viewer lands after sign-in (doc 18 §3.3). Everyone signed in lands on Home. */
export function defaultRoute(viewer: Viewer): RouteId {
  if (viewer.kind === 'offline') return 'muster';
  return 'home';
}

export const ROUTE_TITLES: Record<StaticRouteId, string[]> = {
  home: ['Home'],
  'shared/overview': ['Shared Foundation', 'Overview'],
  'shared/requirements': ['Shared Foundation', 'Reference Data', '110 Requirements'],
  'shared/sprs': ['Shared Foundation', 'Reference Data', 'SPRS Weight Table'],
  'shared/objectives': ['Assess', 'Compliance Assessment', 'Assessment Objectives'],
  'shared/evidence': ['Collect Evidence', 'Standard Evidence Catalog', 'Standard Evidence Documents'],
  'shared/mapping': ['Collect Evidence', 'Standard Evidence Catalog', 'Requirement-to-Evidence Mapping'],
  'shared/rules': ['Collect Evidence', 'Standard Evidence Catalog', 'Evidence Instructions'],
  'shared/contracts': ['Shared Foundation', 'Contract Validation', 'Golden Files'],
  'shared/tests': ['Shared Foundation', 'Contract Validation', 'Contract Tests'],
  'shared/registry': ['Shared Foundation', 'Contract Registry'],
  'shared/compat': ['Shared Foundation', 'Reference Data', 'Version Compatibility'],
  'shared/interfaces': ['Shared Foundation', 'Interfaces'],
  'store/adminops': ['Shared Foundation', 'Evidence Store', 'AdminOps Evidence'],
  'store/tokens': ['Shared Foundation', 'Evidence Store', 'Approver Token Mints'],
  'store/passkeys': ['Shared Foundation', 'Evidence Store', 'Operator Passkey Events'],
  'store/integrity': ['Shared Foundation', 'Evidence Store', 'Storage Integrity'],
  'engagements/tenants': ['Onboard', 'Tenant Management', 'Register Tenant'],
  'engagements/all': ['Onboard', 'Engagement Management', 'All Engagements'],
  muster: ['Muster'],
  'module/stamper': ['Remediate', 'Configuration Management – Stamper'],
  'module/adminops': ['Remediate', 'Administrative Operations – AdminOps'],
  'module/evidenceops': ['Collect Evidence', 'Evidence Dashboard'],
  'platform/users': ['Administration', 'Users & Roles', 'User Management'],
  'platform/roles': ['Administration', 'Users & Roles', 'Role Management'],
  'platform/audit': ['Administration', 'Audit Log'],
  'account/password': ['Account', 'Change Password'],
  help: ['Help'],
};

/** Breadcrumb titles for any route, static or lifecycle. */
export function routeTitle(route: RouteId): string[] {
  if (isLifecycleRoute(route)) {
    const page = LIFECYCLE_PAGES.get(lifecyclePath(route));
    if (page) return page.group.items.length ? [page.section.label, page.group.label, page.item.label] : [page.section.label, page.group.label];
  }
  return ROUTE_TITLES[route as StaticRouteId] ?? ['CES'];
}

export function isRouteId(value: string): value is RouteId {
  return Object.prototype.hasOwnProperty.call(ROUTE_TITLES, value) || isLifecycleRoute(value);
}
