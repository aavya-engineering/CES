// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// LifecycleAccessMatrix.tsx — Sprint 1 Foundation: the section-level access
// table (8 roles × lifecycle stages) shown on Roles & Permissions, from
// lifecycle/rbac.ts. Read-only in Sprint 1; editing is a governed release.

import { LIFECYCLE_NAV } from '../lifecycle/navigation';
import { actionsFor, PLATFORM_ROLES, ROLE_LABEL, SOD_RULES, type Action } from '../lifecycle/rbac';

const SHORT: Record<Action, string> = { view: 'V', edit: 'E', approve: 'A', execute: 'X', admin: '★' };

const ROWS: { label: string; section: (typeof LIFECYCLE_NAV)[number]['key']; group?: string }[] = [
  { label: 'Shared Foundation', section: 'shared' },
  { label: 'Onboard', section: 'onboard' },
  { label: 'Assess', section: 'assess' },
  { label: 'Plan', section: 'plan' },
  { label: 'Remediate › Stamper', section: 'remediate', group: 'configuration-management-stamper' },
  { label: 'Remediate › AdminOps', section: 'remediate', group: 'administrative-operations-adminops' },
  { label: 'Remediate › Tracking', section: 'remediate', group: 'remediation-tracking' },
  { label: 'Collect Evidence', section: 'evidence' },
  { label: 'Monitor', section: 'monitor' },
  { label: 'Prepare for Assessment', section: 'prepare' },
  { label: 'Prepare › Assessor Workspace', section: 'prepare', group: 'assessor-workspace' },
  { label: 'Administration', section: 'admin' },
];

export default function LifecycleAccessMatrix() {
  return (
    <section className="card" data-testid="lifecycle-access-matrix">
      <div className="card-bar">
        <h2 className="card-title">Lifecycle access by role</h2>
        <span className="muted">V view · E edit · A approve · X execute · ★ administer. Stamper is visible to the BHD operator only; the platform administrator holds no customer data (BHD PB-01).</span>
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">Stage</th>
              {PLATFORM_ROLES.map((r) => (
                <th key={r} scope="col" className="center">
                  {ROLE_LABEL[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label}>
                <th scope="row">{row.label}</th>
                {PLATFORM_ROLES.map((r) => {
                  const a = actionsFor(r, row.section, row.group);
                  return (
                    <td key={r} className="center" data-testid={`access-${row.section}${row.group ? '-' + row.group : ''}-${r}`}>
                      {a.length ? a.map((x) => SHORT[x]).join(' ') : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card-pad">
        <h3 className="card-title">Separation of duties</h3>
        <ul>
          {SOD_RULES.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
