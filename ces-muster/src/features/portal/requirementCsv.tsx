// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// requirementCsv.tsx — S1.2: "Import / Update" drawer and the CSV export action
// for the 110 Requirements page (helpers in requirementCsvData.ts).
import { useMemo, useState } from 'react';
import { sharedApi, type CustomRequirement, type ItemView, type RequirementMeta } from '@/shared/api/sharedApi';
import { Drawer } from './governed';
import { REQUIREMENTS } from './referenceData';
import { TEMPLATE_HEADER, downloadRequirementTemplate, planImport } from './requirementCsvData';


const KNOWN = new Set(REQUIREMENTS.map((r) => r.control_id));

export function ImportMetaDrawer({
  existing,
  customExisting = new Map(),
  onClose,
  onDone,
}: {
  existing: Map<string, ItemView<RequirementMeta>>;
  customExisting?: Map<string, ItemView<CustomRequirement>>;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState<string[]>([]);
  const plan = useMemo(() => (text.trim() ? planImport(text, KNOWN, existing, customExisting) : null), [text, existing, customExisting]);
  const changes = plan?.lines.filter((l) => l.status === 'change') ?? [];
  const errors = plan?.lines.filter((l) => l.status === 'error') ?? [];

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setText(await file.text());
  };
  const apply = async () => {
    setBusy(true);
    const failed: string[] = [];
    for (const l of changes) {
      if (l.status !== 'change') continue;
      const r = l.isNew ? await sharedApi.create(l.kind, l.data) : await sharedApi.saveDraft(l.kind, l.controlId, l.data);
      if (!r.ok) failed.push(`${l.controlId}: ${r.message}`);
    }
    setBusy(false);
    if (failed.length) return setFailures(failed);
    onDone(`${changes.length} draft${changes.length === 1 ? '' : 's'} saved from the import. Another administrator publishes them.`);
  };

  return (
    <Drawer
      title="Bulk import requirements"
      subtitle="For the 110: priority, modules, guidance, assessment criteria, status and effective date (ID, text, family, level and SPRS weight are locked). Any other ID with a title adds or updates an organisation-defined requirement."
      onClose={onClose}
      testId="req-import-drawer"
      wide
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={busy || !changes.length || errors.length > 0} onClick={apply} data-testid="req-import-apply">
            {busy ? 'Saving…' : `Save ${changes.length} draft${changes.length === 1 ? '' : 's'}`}
          </button>
        </>
      }
    >
      <p className="hint">
        Columns: <code>{TEMPLATE_HEADER.join(', ')}</code>. Modules are separated by ";" (muster;stamper). A file from <strong>Export</strong> can be edited and imported back.{' '}
        <button type="button" className="row-btn" onClick={downloadRequirementTemplate}>
          Download the template
        </button>
      </p>
      <label className="form-row">
        CSV file
        <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} data-testid="req-import-file" />
      </label>
      <label className="form-row">
        Or paste CSV
        <textarea className="input" rows={6} value={text} onChange={(e) => setText(e.target.value)} data-testid="req-import-text" />
      </label>
      {plan?.headerError && (
        <p className="note" data-tone="bad" role="alert">
          {plan.headerError}
        </p>
      )}
      {plan && !plan.headerError && (
        <>
          <p data-testid="req-import-summary">
            <strong>{changes.length}</strong> to change · {plan.lines.filter((l) => l.status === 'unchanged').length} unchanged · <strong>{errors.length}</strong> with errors
          </p>
          {errors.length > 0 && <p className="note" data-tone="bad">Fix the rows with errors; nothing is saved while any remain.</p>}
          <div className="table-wrap" style={{ maxHeight: 280 }}>
            <table className="tbl tbl-compact" data-testid="req-import-preview">
              <thead>
                <tr>
                  <th scope="col">Line</th>
                  <th scope="col">Requirement</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {plan.lines
                  .filter((l) => l.status !== 'unchanged')
                  .map((l) => (
                    <tr key={l.line}>
                      <td>{l.line}</td>
                      <td>{l.controlId || '—'}</td>
                      <td>
                        {l.status === 'error' ? (
                          <span className="pill" data-tone="bad">
                            {l.message}
                          </span>
                        ) : l.status === 'change' ? (
                          <>
                            {l.kind === 'custom_requirement' ? (l.isNew ? 'New organisation-defined · ' : 'Update organisation-defined · ') : ''}
                            {l.data.priority ?? 'no priority'} · {l.data.modules.join(', ') || 'no modules'}
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {failures.length > 0 && (
        <p className="note" data-tone="bad" role="alert">
          Some drafts were not saved: {failures.join('; ')}
        </p>
      )}
    </Drawer>
  );
}
