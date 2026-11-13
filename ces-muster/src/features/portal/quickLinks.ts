// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// quickLinks.ts — QA 2026-11-13: Home "Quick Links" / "Modules" targets per viewer.
import type { MusterView, RouteId } from './nav';

/** QA 2026-11-13 (org admin: "module navigation not working"): each Quick Link
 * opens the first of its candidate routes the viewer may reach; a module the
 * role cannot open (Stamper is BHD-only) is not offered at all. Without an
 * `allowed` set (tests, legacy callers) the first candidate is used. */
export function quickLinksFor(allowed: Set<RouteId> | undefined, admin: boolean): { mod?: string; t: string; s: string; route: RouteId; view?: MusterView }[] {
  const pick = (routes: RouteId[]): RouteId | null => (allowed ? routes.find((r) => allowed.has(r)) ?? null : routes[0]);
  const defs: { mod?: string; t: string; s: string; routes: RouteId[]; view?: MusterView }[] = admin
    ? [
        { t: 'CES-Shared Overview', s: 'Reference data and rules', routes: ['shared/overview'] },
        { t: 'Users', s: 'Accounts and roles', routes: ['platform/users'] },
      ]
    : [
        { mod: 'muster', t: 'Muster', s: 'Assess & Plan', routes: ['muster', 'assess/readiness', 'onboard/organizations'], view: 'assessment' },
        { mod: 'stamper', t: 'Stamper', s: 'Configure & Verify', routes: ['module/stamper', 'remediate/stamper'] },
        { mod: 'adminops', t: 'AdminOps', s: 'Govern Changes', routes: ['module/adminops', 'remediate/adminops'] },
        { mod: 'evidenceops', t: 'EvidenceOps', s: 'Prove & Maintain', routes: ['module/evidenceops', 'evidence/overview'] },
      ];
  const out: { mod?: string; t: string; s: string; route: RouteId; view?: MusterView }[] = [];
  for (const d of defs) {
    const route = pick(d.routes);
    if (route) out.push({ mod: d.mod, t: d.t, s: d.s, route, ...(route === 'muster' && d.view ? { view: d.view } : {}) });
  }
  return out;
}
