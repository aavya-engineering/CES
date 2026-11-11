// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// LifecycleScaffoldPage.tsx — Sprint 1 Foundation: the honest placeholder for a
// lifecycle page whose screen is not built yet. It tells the viewer what the
// page is for (from the BHD navigation workbook), which sprint delivers it,
// which engine API it will call, and what the viewer's role may do here.

import { BUILT, SECTION_PLAN } from '../lifecycle/builtRoutes';
import { LIFECYCLE_PAGES } from '../lifecycle/navigation';
import { actionsFor, ROLE_LABEL, toPlatformRole } from '../lifecycle/rbac';
import { lifecyclePath, lifecycleRoute, type LifecycleRouteId, type MusterView, type RouteId, type Viewer } from '../nav';
import { PageHeader, Stat } from '../ui';

const MODULE_LABEL: Record<string, string> = {
  'ces-shared': 'CES-Shared',
  muster: 'Muster',
  'stamper/adminops': 'Stamper / AdminOps',
  evidenceops: 'EvidenceOps',
  platform: 'Platform services',
};

export default function LifecycleScaffoldPage({ route, viewer, go }: { route: LifecycleRouteId; viewer: Viewer; go: (r: RouteId, v?: MusterView) => void }) {
  const page = LIFECYCLE_PAGES.get(lifecyclePath(route));
  if (!page) return null;
  const { section, group, item } = page;
  const plan = SECTION_PLAN[section.key];
  const role = viewer.kind === 'signed-in' ? viewer.role : null;
  const pr = role ? toPlatformRole(role) : null;
  const actions = role ? actionsFor(role, section.key, group.key) : [];
  const siblings = group.items.filter((i) => i.path !== item.path);

  return (
    <div className="pg" data-testid="page-lifecycle-scaffold" data-path={item.path}>
      <PageHeader icon="◫" title={item.label} lede={item.description || `${group.label} · ${section.label}`} />
      <div className="stats">
        <Stat icon="◧" value={section.label} label="Lifecycle stage" />
        <Stat icon="⚙" value={MODULE_LABEL[section.module] ?? section.module} label="Engine module" />
        <Stat icon="◷" value={plan.sprint.split(' — ')[0]} label="Planned in" sub={`${plan.sprint.split(' — ')[1] ?? ''} · ${plan.dates}`} tone="muster" />
        <Stat icon="⚖" value={pr ? ROLE_LABEL[pr] : 'Offline'} label="Your access" sub={actions.length ? actions.join(' · ') : 'no access'} tone={actions.length ? 'good' : 'warn'} />
      </div>
      <div className="card card-pad">
        <h2 className="card-title">Status</h2>
        <p>
          This screen is part of the unified lifecycle navigation agreed with BHD (navigation workbook, 10 Nov 2026) and is scheduled for <strong>{plan.sprint}</strong>. The engine API it
          will call already exists: <code>{plan.backend}</code>. Nothing on this page reads or writes a tenant.
        </p>
        {siblings.length > 0 && (
          <>
            <h2 className="card-title">Also in {group.label}</h2>
            <div className="quick-links">
              {siblings.map((s) => (
                <button key={s.path} type="button" className="quick-link" onClick={() => (BUILT[s.path] ? go(BUILT[s.path].route, BUILT[s.path].view) : go(lifecycleRoute(s.path)))} data-testid={`scaffold-link-${s.key}`}>
                  <span aria-hidden="true">›</span>
                  <span>
                    <strong>{s.label}</strong>
                    {s.description ? <small>{s.description}</small> : null}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
