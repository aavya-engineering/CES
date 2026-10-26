// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// requirementMeta.tsx — S1.2: the editable metadata of a requirement (priority,
// modules, implementation guidance; doc 26 D2) and the "Edit Requirement
// Weight" drawer from the SPRS mockup. The SPRS weight itself is shown locked:
// it is set by the DoD Assessment Methodology, not by CES users.
import { useEffect, useState } from 'react';
import { sharedApi, type ItemView, type ModuleId, type RequirementMeta } from '@/shared/api/sharedApi';
import { describeFailure } from './governedState';
import { MODULE_LABEL, PRIORITY_LABEL, PRIORITY_TONE, metaFor } from './requirementMetaData';
import { Drawer, GovernanceBar } from './governed';
import { SPRS_META, type RequirementRow } from './referenceData';

export function PriorityPill({ meta }: { meta: RequirementMeta | null }) {
  if (!meta?.priority) return <span className="muted">—</span>;
  return (
    <span className="pill" data-tone={PRIORITY_TONE[meta.priority]}>
      {PRIORITY_LABEL[meta.priority]}
    </span>
  );
}

export function ModulePills({ meta }: { meta: RequirementMeta | null }) {
  if (!meta?.modules.length) return <span className="muted">—</span>;
  return (
    <span className="method-tags">
      {meta.modules.map((m) => (
        <span key={m} className="pill" data-mod={m}>
          {MODULE_LABEL[m]}
        </span>
      ))}
    </span>
  );
}

export function EditRequirementDrawer({
  row,
  view,
  onClose,
  onSaved,
}: {
  row: RequirementRow;
  view: ItemView<RequirementMeta> | undefined;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const start = metaFor(view, true);
  const [priority, setPriority] = useState<RequirementMeta['priority']>(start?.priority ?? null);
  const [modules, setModules] = useState<ModuleId[]>(start?.modules ?? []);
  const [guidance, setGuidance] = useState(start?.implementation_guidance ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [priority, modules, guidance]);

  const save = async () => {
    setBusy(true);
    const data: RequirementMeta = { control_id: row.control_id, priority, modules, implementation_guidance: guidance.trim() };
    const r = view ? await sharedApi.saveDraft('requirement_meta', row.control_id, data) : await sharedApi.create('requirement_meta', data);
    setBusy(false);
    if (!r.ok) return setError(describeFailure(r));
    onSaved(`Draft v${r.data.version} saved for ${row.control_id}. Another administrator publishes it.`);
  };
  const toggle = (m: ModuleId) => setModules((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));

  return (
    <Drawer
      title="Edit Requirement Weight"
      subtitle="Assign priority, module applicability and guidance for a requirement. The SPRS weight is set by the DoD methodology."
      onClose={onClose}
      testId="req-edit-drawer"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy} data-testid="req-edit-save">
            {busy ? 'Saving…' : 'Save draft'}
          </button>
        </>
      }
    >
      <section className="form-card">
        <h3>Requirement Information</h3>
        <dl className="kv kv-form">
          <dt>Requirement ID</dt>
          <dd>{row.control_id}</dd>
          <dt>Requirement Title</dt>
          <dd>{row.practice}</dd>
          <dt>Source Standard</dt>
          <dd>NIST SP 800-171 Rev. 2</dd>
          <dt>Control Family</dt>
          <dd>
            {row.family} - {row.family_name}
          </dd>
        </dl>
      </section>
      <section className="form-card">
        <h3>Weight Configuration</h3>
        <div className="form-row">
          SPRS Weight
          <div className="locked" data-testid="req-edit-weight">
            <span aria-hidden="true">🔒</span> {row.unscored ? '0 · not scored (SSP prerequisite)' : `${row.weight} point${row.weight === 1 ? '' : 's'}`}
            {row.partial ? ` · ${row.partial.weight} if partly met` : ''}
          </div>
          <span className="hint">Locked: DoD Assessment Methodology v{SPRS_META.version}. Changing it would produce a wrong SPRS score.</span>
        </div>
        <fieldset className="form-row radio-row">
          <legend>Priority</legend>
          {(['high', 'medium', 'low'] as const).map((p) => (
            <label key={p}>
              <input type="radio" name="priority" checked={priority === p} onChange={() => setPriority(p)} data-testid={`req-edit-priority-${p}`} /> {PRIORITY_LABEL[p]}
            </label>
          ))}
          <label>
            <input type="radio" name="priority" checked={priority === null} onChange={() => setPriority(null)} /> Not set
          </label>
        </fieldset>
      </section>
      <section className="form-card">
        <h3>Module Applicability</h3>
        <p className="hint">Select the CES modules where this requirement is applicable.</p>
        <div className="check-grid">
          {(Object.keys(MODULE_LABEL) as ModuleId[]).map((m) => (
            <label key={m}>
              <input type="checkbox" checked={modules.includes(m)} onChange={() => toggle(m)} data-testid={`req-edit-module-${m}`} />{' '}
              <span className="pill" data-mod={m}>
                {MODULE_LABEL[m]}
              </span>
            </label>
          ))}
        </div>
      </section>
      <section className="form-card">
        <h3>Additional Details</h3>
        <label className="form-row">
          Implementation Guidance
          <textarea
            className="input"
            rows={4}
            maxLength={1000}
            value={guidance}
            placeholder="Enter implementation guidance or notes…"
            onChange={(e) => setGuidance(e.target.value)}
            data-testid="req-edit-guidance"
          />
          <span className="hint" style={{ textAlign: 'right' }}>
            {guidance.length} / 1000
          </span>
        </label>
      </section>
      {view && <GovernanceBar kind="requirement_meta" view={view} onChanged={onSaved} />}
      {error && (
        <p className="note" data-tone="bad" role="alert" data-testid="req-edit-error">
          {error}
        </p>
      )}
    </Drawer>
  );
}
