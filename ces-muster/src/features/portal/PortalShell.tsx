// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// PortalShell.tsx — UI-02: sidebar + top bar around every signed-in or offline
// screen (Aavya mockups). Sidebar items come from nav.ts and are filtered by
// role; the top bar holds breadcrumbs, help, theme and the account menu.
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { navFor, routesFor, ROUTE_TITLES, type MusterView, type NavItem, type RouteId, type Viewer } from './nav';
import { CesShield } from '@/features/auth/icons';
import { ChevronDown, ChevronRight, CircleHelp, Menu } from 'lucide-react';
import { NavIcon } from './icons';
import GlobalSearch from './GlobalSearch';
import NotificationsBell from './NotificationsBell';
import './portalTheme.css';

export interface PortalUser {
  name: string | null;
  email: string | null;
  roleLabel: string;
}

function initials(user: PortalUser): string {
  const src = (user.name ?? user.email ?? '?').trim();
  const parts = src.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

const MUSTER_VIEW_TITLE: Partial<Record<MusterView, string>> = {
  assessment: 'Situation',
  discovery: 'Discovery',
  readiness: 'Readiness',
  plan: 'Plan',
  contracts: 'Contracts',
  'quick-session': 'Quick Session',
  help: 'Help',
  rollup: 'Rollup',
  result: 'Result',
};

const NAV_HIDDEN_KEY = 'ces-nav-hidden';
function readNavHidden(): boolean {
  try {
    return localStorage.getItem(NAV_HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}
/** Same breakpoint as portalTheme.css: below it the panel is a drawer. */
const narrow = () => typeof window !== 'undefined' && window.innerWidth <= 960;

const GROUP_ICON: Record<string, string> = {
  'Reference Data': 'reference-data',
  'Standard Evidence & Evaluation Rules': 'standard-evidence',
  'Contract Validation': 'contract-validation',
};

/** Consecutive items that share a wireframe sub-group heading. */
function groupItems(items: NavItem[]): { group?: string; items: NavItem[] }[] {
  const out: { group?: string; items: NavItem[] }[] = [];
  for (const i of items) {
    const last = out[out.length - 1];
    if (last && last.group === i.group && i.group) last.items.push(i);
    else out.push({ group: i.group, items: [i] });
  }
  return out;
}

export default function PortalShell({
  viewer,
  user,
  route,
  musterView,
  onGo,
  onSignOut,
  onSignIn,
  themeToggle,
  userId,
  children,
}: {
  viewer: Viewer;
  user: PortalUser | null;
  route: RouteId;
  musterView: MusterView;
  onGo: (route: RouteId, view?: MusterView) => void;
  onSignOut: () => void;
  onSignIn: () => void;
  themeToggle: ReactNode;
  /** Signed-in user id (for "awaiting your approval" — never your own drafts). */
  userId?: string | null;
  children: ReactNode;
}) {
  const sections = navFor(viewer);
  const allowed = useMemo(() => routesFor(viewer), [viewer]);
  // A top-bar search remounts the page, so it reads the new query even when it is already open.
  const [searchNonce, setSearchNonce] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [navOpen, setNavOpen] = useState(false);
  // S1.9: the menu button hides / shows the navigation panel on wide screens (remembered on this device).
  const [navHidden, setNavHiddenState] = useState(() => readNavHidden());
  const setHidden = (v: boolean) => {
    setNavHiddenState(v);
    try {
      localStorage.setItem(NAV_HIDDEN_KEY, v ? '1' : '0');
    } catch {
      /* storage blocked */
    }
  };
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menuOpen]);

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const isCurrent = (i: NavItem) => !i.shortcut && i.route === route && (i.route !== 'muster' || i.view === musterView);
  const go = (r: RouteId, v?: MusterView) => {
    setNavOpen(false);
    // S1.10: choosing the page you are on (e.g. "110 Requirements" while its
    // Create form is open) returns to that page's start, like a fresh visit.
    if (r === route && r !== 'muster') setSearchNonce((n) => n + 1);
    onGo(r, v);
  };
  const crumbs = route === 'muster' ? ['Muster', MUSTER_VIEW_TITLE[musterView] ?? ''] : ROUTE_TITLES[route];

  return (
    <div className="portal" data-nav-open={navOpen} data-nav-hidden={navHidden || undefined} data-testid="portal">
      <aside className="portal-sidebar" aria-label="CES navigation">
        <button type="button" className="portal-brand" onClick={() => go('home')}>
          <CesShield size={38} tone="light" />
          <span>
            <span className="portal-brand-name">CES</span>
            <span className="portal-brand-sub">Compliance Evidence System</span>
          </span>
        </button>
        <nav>
          {sections.map((s) => {
            if (s.route) {
              return (
                <div key={s.id} className="portal-nav-section">
                  <button type="button" className="portal-nav-head" aria-current={route === s.route ? 'page' : undefined} onClick={() => go(s.route!)} data-testid={`nav-${s.id}`} style={route === s.route ? { background: 'var(--portal-sidebar-active)' } : undefined}>
                    <span className="portal-icon" aria-hidden="true"><NavIcon name={s.icon} size={18} /></span>
                    {s.label}
                  </button>
                </div>
              );
            }
            const single = s.items.length === 1 && !!s.mod && s.id !== 'muster';
            if (single) {
              const item = s.items[0];
              return (
                <div key={s.id} className="portal-nav-section">
                  <button type="button" className="portal-nav-head" aria-current={isCurrent(item) ? 'page' : undefined} onClick={() => go(item.route, item.view)} data-testid={item.testId} style={isCurrent(item) ? { background: 'var(--portal-sidebar-active)' } : undefined}>
                    <span className="portal-icon" data-mod={s.mod} aria-hidden="true"><NavIcon name={s.icon} size={18} /></span>
                    {s.label}
                    <ChevronRight className="chev" size={16} aria-hidden="true" />
                  </button>
                </div>
              );
            }
            const open = !collapsed.has(s.id);
            const listId = `nav-list-${s.id}`;
            return (
              <div key={s.id} className="portal-nav-section">
                <button
                  type="button"
                  className="portal-nav-head"
                  aria-expanded={open}
                  aria-controls={listId}
                  onClick={() => toggle(s.id)}
                  data-testid={`nav-section-${s.id}`}
                >
                  <span className="portal-icon" data-mod={s.mod} aria-hidden="true"><NavIcon name={s.icon} size={18} /></span>
                  {s.label}
                  <ChevronDown className="chev" size={16} aria-hidden="true" />
                </button>
                {open && (
                  <ul id={listId} className="portal-nav-items">
                    {groupItems(s.items).map((g) => {
                      const link = (i: NavItem) => (
                        <li key={i.testId}>
                          <button type="button" className="portal-nav-item" data-sub={g.group ? 'true' : undefined} aria-current={isCurrent(i) ? 'page' : undefined} onClick={() => go(i.route, i.view)} data-testid={i.testId}>
                            <span className="portal-nav-item-icon" aria-hidden="true">
                              <NavIcon name={i.icon} size={17} />
                            </span>
                            <span className="portal-nav-item-label">{i.label}</span>
                            {i.planned && <span className="soon">Planned</span>}
                          </button>
                        </li>
                      );
                      if (!g.group) return g.items.map(link);
                      const gid = `${s.id}:${g.group}`;
                      const gOpen = !collapsed.has(gid) || g.items.some(isCurrent);
                      return (
                        <li key={gid} className="portal-nav-group">
                          <button type="button" className="portal-nav-subhead" aria-expanded={gOpen} onClick={() => toggle(gid)} data-testid={`nav-group-${g.group.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
                            {gOpen ? <ChevronDown className="chev" size={14} aria-hidden="true" /> : <ChevronRight className="chev" size={14} aria-hidden="true" />}
                            <span className="portal-nav-item-icon" aria-hidden="true">
                              <NavIcon name={GROUP_ICON[g.group]} size={17} />
                            </span>
                            {g.group}
                          </button>
                          {gOpen && <ul className="portal-nav-items">{g.items.map(link)}</ul>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="portal-main">
        <header className="portal-topbar">
          <button
            type="button"
            className="portal-menu-btn"
            aria-label={narrow() ? 'Open navigation' : navHidden ? 'Show navigation panel' : 'Hide navigation panel'}
            aria-expanded={narrow() ? navOpen : !navHidden}
            onClick={() => (narrow() ? setNavOpen((v) => !v) : setHidden(!navHidden))}
            data-testid="nav-toggle"
          >
            <Menu size={22} aria-hidden="true" />
          </button>
          <GlobalSearch go={(r) => { setSearchNonce((n) => n + 1); go(r); }} allowed={allowed} />
          <div className="portal-topbar-right">
            <NotificationsBell viewer={viewer} userId={userId ?? null} go={go} />
            <button type="button" className="portal-icon-btn" aria-label="Help" title="Help" onClick={() => go('help')} data-testid="header-help">
              <CircleHelp size={22} aria-hidden="true" />
            </button>
            {viewer.kind === 'offline' && themeToggle}
            {viewer.kind === 'offline' ? (
              <span className="header-account" data-testid="header-account">
                <span className="pill" data-tone="warn">Working offline</span>
                <button type="button" className="btn btn-primary" onClick={onSignIn} data-testid="header-signin">
                  Sign in
                </button>
              </span>
            ) : (
              user && (
                <div className="portal-user" ref={menuRef}>
                  <button type="button" className="portal-user-btn" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)} data-testid="header-account">
                    <span className="portal-avatar" aria-hidden="true">{initials(user)}</span>
                    <span className="portal-user-text">
                      <span className="portal-user-name">{user.name ?? user.email ?? 'Signed in'}</span>
                      <span className="portal-user-role">{user.roleLabel}</span>
                    </span>
                    <ChevronDown size={18} aria-hidden="true" />
                  </button>
                  {menuOpen && (
                    <div className="portal-user-menu" role="menu">
                      {user.email && <div className="pg-meta" style={{ padding: '6px 10px' }}>{user.email}</div>}
                      <div className="portal-user-menu-row">
                        <span>Theme</span>
                        {themeToggle}
                      </div>
                      <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); go('account/password'); }} data-testid="menu-change-password">
                        Change password
                      </button>
                      <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onSignOut(); }} data-testid="header-signout">
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        </header>
        <main className="portal-content" id="portal-content">
          {route !== 'home' && (
            <nav className="portal-crumbs" aria-label="Breadcrumb">
              {crumbs.filter(Boolean).map((c) => (
                <span key={c}>{c}</span>
              ))}
            </nav>
          )}
          <Fragment key={searchNonce}>{children}</Fragment>
        </main>
      </div>
      {navOpen && <div className="drawer-backdrop" style={{ zIndex: 55 }} onClick={() => setNavOpen(false)} />}
    </div>
  );
}
