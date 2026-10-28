// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// RequirementFormPage.tsx — S1.9 (mockup "Create Requirement", demo feedback
// 2026-10-27): one full-page form for
//   create       a new organisation-defined requirement (custom_requirement)
//   edit-custom  an organisation-defined requirement (ID fixed once created)
//   edit-base    one of the 110: ID, title, family, description and source are
//                locked (decision D2); priority, modules, guidance, criteria,
//                status, dates and links are saved as requirement metadata.
// Every save is a draft; a second platform administrator publishes it.
import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ChevronUp, FilePlus2, Plus, Search, ShieldCheck, X } from 'lucide-react';
import { sharedApi, type CustomRequirement, type ItemView, type ModuleId, type RequirementMeta } from '@/shared/api/sharedApi';
import { FAMILIES, type RequirementRow } from '../referenceData';
import { MODULE_LABEL, PRIORITY_LABEL, nistOf } from '../requirementMetaData';
import { actorLabel, useSharedViewer } from '../governedState';

export type RequirementFormMode =
  | { mode: 'create' }
  | { mode: 'edit-custom'; view: ItemView<CustomRequirement> }
  | { mode: 'edit-base'; row: RequirementRow; view?: ItemView<RequirementMeta> };

export interface PickableRequirement {
  id: string;
  title: string;
}

const MODULES: ModuleId[] = ['muster', 'stamper', 'adminops', 'evidenceops'];
const familyName = (code: string) => FAMILIES.find((f) => f.abbreviation === code)?.name ?? '';
const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

function Counter({ value, max }: { value: string; max: number }) {
  return (
    <span className="field-count" aria-hidden="true">
      {value.length} / {max}
    </span>
  );
}

function Panel({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="card form-panel" data-testid={testId}>
      <button type="button" className="form-panel-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <h2>{title}</h2>
        <ChevronUp size={18} aria-hidden="true" style={{ transform: open ? undefined : 'rotate(180deg)' }} />
      </button>
      {open && <div className="form-panel-body">{children}</div>}
    </section>
  );
}

/** Search-and-pick list of requirements, shown as removable chips. */
function RequirementPicker({ label, value, onChange, options, exclude, testId }: { label: string; value: string[]; onChange: (v: string[]) => void; options: PickableRequirement[]; exclude: string; testId: string }) {
  const id = useId();
  const [q, setQ] = useState('');
  const hits = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (n.length < 1) return [];
    return options.filter((o) => o.id !== exclude && !value.includes(o.id) && `${o.id} ${o.title}`.toLowerCase().includes(n)).slice(0, 8);
  }, [q, options, value, exclude]);
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <div className="search-input">
        <input id={id} className="input" placeholder={`Search and select ${label.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} data-testid={testId} autoComplete="off" />
        <Search size={18} aria-hidden="true" />
        {hits.length > 0 && (
          <ul className="pick-list" role="listbox" aria-label={`Matching ${label.toLowerCase()}`}>
            {hits.map((h) => (
              <li key={h.id} role="option" aria-selected="false">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange([...value, h.id]);
                    setQ('');
                  }}
                >
                  <strong>{h.id}</strong> <span>{h.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {value.length > 0 && (
        <ul className="chips" aria-label={`Selected ${label.toLowerCase()}`}>
          {value.map((v) => (
            <li key={v} className="chip">
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))}>
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function RequirementFormPage({ form, options, onBack, onSaved }: { form: RequirementFormMode; options: PickableRequirement[]; onBack: () => void; onSaved: (message: string) => void }) {
  const ids = useId();
  const viewer = useSharedViewer();
  const base = form.mode === 'edit-base' ? form.row : null;
  const customView = form.mode === 'edit-custom' ? form.view : null;
  const customData = customView ? (customView.draft?.data ?? customView.current)! : null;
  const meta = form.mode === 'edit-base' ? (form.view?.draft?.data ?? form.view?.current ?? null) : null;
  const extras = customData ?? meta;

  const [controlId, setControlId] = useState(base?.control_id ?? customData?.control_id ?? '');
  const [title, setTitle] = useState(base?.practice ?? customData?.title ?? '');
  const [family, setFamily] = useState(base?.family ?? customData?.family ?? '');
  const [priority, setPriority] = useState<string>(customData?.priority ?? meta?.priority ?? '');
  const [description, setDescription] = useState(base ? nistOf(base.nist_ref)?.nist_text ?? base.practice : customData?.description ?? '');
  const [sourceStandard, setSourceStandard] = useState(base ? 'NIST SP 800-171 Rev. 2' : customData?.source_standard ?? 'Organization-defined');
  const [sourceSection, setSourceSection] = useState(base?.nist_ref ?? customData?.source_section ?? '');
  const [modules, setModules] = useState<ModuleId[]>(extras?.modules ?? []);
  const [guidance, setGuidance] = useState(extras?.implementation_guidance ?? '');
  const [criteria, setCriteria] = useState(extras?.assessment_criteria ?? '');
  const [status, setStatus] = useState<'active' | 'inactive'>(extras?.status ?? 'active');
  const [effective, setEffective] = useState(extras?.effective_date ?? '');
  const [related, setRelated] = useState<string[]>(extras?.related ?? []);
  const [dependent, setDependent] = useState<string[]>(extras?.dependent ?? []);
  const [references, setReferences] = useState<string[]>(extras?.references ?? []);
  const [refInput, setRefInput] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  // After the first save attempt, field errors follow the fields as the user fixes them.
  const [tried, setTried] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const locked = form.mode === 'edit-base';
  const idLocked = form.mode !== 'create';
  const auditView = form.mode === 'edit-base' ? form.view : customView;
  const firstRow = auditView ? (auditView.published ?? auditView.draft ?? auditView.retired) : null;
  const lastRow = auditView ? (auditView.draft ?? auditView.published ?? auditView.retired) : null;

  const addReference = () => {
    const v = refInput.trim();
    if (!v) return;
    if (!/^https?:\/\/\S+$/.test(v)) return setErrors((e) => ({ ...e, references: 'Enter a link starting with http:// or https://' }));
    if (!references.includes(v)) setReferences([...references, v]);
    setRefInput('');
    setErrors(({ references: _drop, ...rest }) => rest);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!locked) {
      if (!/^[A-Z][A-Z0-9.-]{1,29}$/.test(controlId.trim())) e.controlId = 'Use 2–30 capital letters, digits, dots or dashes, starting with a letter (e.g. ORG-AC-01).';
      else if (form.mode === 'create' && options.some((o) => o.id === controlId.trim())) e.controlId = 'This ID is already used.';
      if (title.trim().length < 3) e.title = 'Enter a title (at least 3 characters).';
      if (!family) e.family = 'Choose a control family.';
      if (!priority) e.priority = 'Choose a priority.';
      if (description.trim().length < 3) e.description = 'Enter a description.';
    }
    return e;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    const e = validate();
    setTried(true);
    setErrors(e);
    setApiError(null);
    if (Object.keys(e).length) return;
    const extra = { assessment_criteria: criteria, related, dependent, references, status, effective_date: effective || null };
    setBusy(true);
    let r;
    if (form.mode === 'edit-base') {
      const data: RequirementMeta = { control_id: base!.control_id, priority: (priority || null) as RequirementMeta['priority'], modules, implementation_guidance: guidance, ...extra };
      r = form.view ? await sharedApi.saveDraft('requirement_meta', base!.control_id, data) : await sharedApi.create('requirement_meta', data);
    } else {
      const data: CustomRequirement = {
        control_id: controlId.trim(),
        title: title.trim(),
        family,
        priority: priority as CustomRequirement['priority'],
        description: description.trim(),
        source_standard: sourceStandard.trim() || 'Organization-defined',
        source_section: sourceSection.trim(),
        modules,
        implementation_guidance: guidance,
        ...extra,
      };
      r = form.mode === 'create' ? await sharedApi.create('custom_requirement', data) : await sharedApi.saveDraft('custom_requirement', data.control_id, data);
    }
    setBusy(false);
    if (!r.ok) {
      setApiError(r.issues?.length ? `${r.message}: ${r.issues.map((i) => `${i.path} — ${i.message}`).join('; ')}` : r.message);
      return;
    }
    onSaved(`${form.mode === 'create' ? 'Requirement created' : 'Changes saved'} as a draft: ${base?.control_id ?? controlId.trim()}. Another platform administrator publishes it.`);
  };

  const shown: Record<string, string> = tried ? { ...validate(), ...(errors.references ? { references: errors.references } : {}) } : errors;
  const err = (k: string) => (shown[k] ? { 'aria-invalid': true as const, 'aria-describedby': `${ids}-${k}-err` } : {});
  const errText = (k: string) =>
    shown[k] && (
      <p id={`${ids}-${k}-err`} className="field-error" role="alert">
        {shown[k]}
      </p>
    );

  const heading = form.mode === 'create' ? 'Create Requirement' : `Edit Requirement — ${base?.control_id ?? controlId}`;
  return (
    <div className="pg" data-testid="page-requirement-form">
      <header className="pg-head">
        <div className="pg-head-icon" aria-hidden="true">
          <FilePlus2 size={32} strokeWidth={1.8} />
        </div>
        <div>
          <h1 className="pg-title">{heading}</h1>
          <p className="pg-lede">
            {form.mode === 'create'
              ? 'Add an organisation-defined requirement to the reference data. The 110 NIST SP 800-171 Rev. 2 requirements are fixed; a new one has no SPRS weight.'
              : locked
                ? 'This is one of the 110 NIST SP 800-171 Rev. 2 requirements: its ID, title, family, description and SPRS weight are fixed. You can change the details below.'
                : 'Change this organisation-defined requirement. Its ID stays the same.'}
          </p>
        </div>
        <div className="pg-head-actions">
          <button type="button" className="btn btn-soft" onClick={onBack} data-testid="req-form-back">
            <ArrowLeft size={18} aria-hidden="true" /> Back to 110 Requirements
          </button>
        </div>
      </header>

      <form className="req-form" onSubmit={submit} noValidate>
        <section className="card form-main" aria-label="Requirement details">
          <h2 className="form-main-title">Requirement Details</h2>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor={`${ids}-id`}>
                Requirement ID <span className="req-star">*</span>
              </label>
              <input id={`${ids}-id`} className="input" value={controlId} onChange={(e) => setControlId(e.target.value.toUpperCase())} disabled={idLocked} placeholder="e.g., ORG-AC-01" data-testid="req-form-id" {...err('controlId')} />
              <span className="field-hint">Unique identifier (e.g., ORG-AC-01). The 110 NIST IDs are reserved.</span>
              {errText('controlId')}
            </div>
            <div className="form-field span-2">
              <label htmlFor={`${ids}-title`}>
                Requirement Title <span className="req-star">*</span>
              </label>
              <input id={`${ids}-title`} className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} disabled={locked} placeholder="Enter requirement title" data-testid="req-form-title" {...err('title')} />
              <Counter value={title} max={200} />
              {errText('title')}
            </div>
            <div className="form-field">
              <label htmlFor={`${ids}-family`}>
                Control Family <span className="req-star">*</span>
              </label>
              <select id={`${ids}-family`} className="select" value={family} onChange={(e) => setFamily(e.target.value)} disabled={locked} data-testid="req-form-family" {...err('family')}>
                <option value="">Select control family</option>
                {FAMILIES.map((f) => (
                  <option key={f.abbreviation} value={f.abbreviation}>
                    {f.abbreviation} - {f.name}
                  </option>
                ))}
              </select>
              <span className="field-hint">CMMC control family (e.g., AC - Access Control)</span>
              {errText('family')}
            </div>
            <div className="form-field">
              <label htmlFor={`${ids}-sec`}>Security Family</label>
              <input id={`${ids}-sec`} className="input" value={familyName(family)} disabled placeholder="Follows the control family" />
              <span className="field-hint">NIST SP 800-171 security family</span>
            </div>
            <div className="form-field">
              <label htmlFor={`${ids}-prio`}>
                Priority {!locked && <span className="req-star">*</span>}
              </label>
              <select id={`${ids}-prio`} className="select" value={priority} onChange={(e) => setPriority(e.target.value)} data-testid="req-form-priority" {...err('priority')}>
                <option value="">{locked ? 'Not set' : 'Select priority'}</option>
                {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <span className="field-hint">High / Medium / Low</span>
              {errText('priority')}
            </div>
            <div className="form-field span-3">
              <label htmlFor={`${ids}-desc`}>
                Requirement Description <span className="req-star">*</span>
              </label>
              <textarea id={`${ids}-desc`} className="input" rows={4} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} disabled={locked} placeholder="Enter detailed requirement description…" data-testid="req-form-description" {...err('description')} />
              <Counter value={description} max={2000} />
              {errText('description')}
            </div>
            <div className="form-field span-15">
              <label htmlFor={`${ids}-std`}>Source Standard</label>
              <input id={`${ids}-std`} className="input" value={sourceStandard} onChange={(e) => setSourceStandard(e.target.value)} disabled={locked} />
            </div>
            <div className="form-field span-15">
              <label htmlFor={`${ids}-sect`}>Source Section</label>
              <input id={`${ids}-sect`} className="input" value={sourceSection} onChange={(e) => setSourceSection(e.target.value)} disabled={locked} placeholder="e.g., 3.1.1" />
              <span className="field-hint">Section number from the source standard</span>
            </div>
            <fieldset className="form-field span-3 module-box">
              <legend>Module Applicability</legend>
              <p className="field-hint">Select the CES modules where this requirement is applicable.</p>
              <div className="module-checks">
                {MODULES.map((m) => (
                  <label key={m} className="module-check">
                    <input type="checkbox" checked={modules.includes(m)} onChange={(e) => setModules(e.target.checked ? [...modules, m] : modules.filter((x) => x !== m))} data-testid={`req-form-module-${m}`} />
                    <span className="pill" data-mod={m}>
                      {MODULE_LABEL[m]}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="form-field span-15">
              <label htmlFor={`${ids}-guide`}>Implementation Guidance</label>
              <textarea id={`${ids}-guide`} className="input" rows={3} maxLength={1000} value={guidance} onChange={(e) => setGuidance(e.target.value)} placeholder="Enter implementation guidance or notes…" data-testid="req-form-guidance" />
              <Counter value={guidance} max={1000} />
            </div>
            <div className="form-field span-15">
              <label htmlFor={`${ids}-crit`}>Assessment Criteria</label>
              <textarea id={`${ids}-crit`} className="input" rows={3} maxLength={1000} value={criteria} onChange={(e) => setCriteria(e.target.value)} placeholder="Enter assessment criteria…" data-testid="req-form-criteria" />
              <Counter value={criteria} max={1000} />
            </div>
            <div className="form-field span-15">
              <label htmlFor={`${ids}-status`}>Status</label>
              <select id={`${ids}-status`} className="select" value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')} data-testid="req-form-status">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <span className="field-hint">Set the requirement status</span>
            </div>
            <div className="form-field span-15">
              <label htmlFor={`${ids}-eff`}>Effective Date</label>
              <input id={`${ids}-eff`} className="input" type="date" value={effective ?? ''} onChange={(e) => setEffective(e.target.value)} data-testid="req-form-effective" />
              <span className="field-hint">Date when this requirement becomes effective</span>
            </div>
          </div>
        </section>

        <div className="form-side">
          <Panel title="Related Information" testId="req-form-related">
            <RequirementPicker label="Related Requirements" value={related} onChange={setRelated} options={options} exclude={controlId} testId="req-form-related-search" />
            <RequirementPicker label="Dependent Requirements" value={dependent} onChange={setDependent} options={options} exclude={controlId} testId="req-form-dependent-search" />
            <div className="form-field">
              <label htmlFor={`${ids}-ref`}>References / External Links</label>
              <div className="ref-row">
                <input
                  id={`${ids}-ref`}
                  className="input"
                  placeholder="Enter reference URL"
                  value={refInput}
                  onChange={(e) => setRefInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addReference();
                    }
                  }}
                  data-testid="req-form-ref"
                />
                <button type="button" className="btn btn-soft btn-icon" aria-label="Add reference" onClick={addReference} data-testid="req-form-ref-add">
                  <Plus size={18} aria-hidden="true" />
                </button>
              </div>
              {errText('references')}
              {references.length > 0 && (
                <ul className="ref-list">
                  {references.map((u) => (
                    <li key={u}>
                      <a href={u} target="_blank" rel="noopener noreferrer">
                        {u}
                      </a>
                      <button type="button" aria-label={`Remove ${u}`} onClick={() => setReferences(references.filter((x) => x !== u))}>
                        <X size={14} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Panel>
          <Panel title="Preview" testId="req-form-preview">
            <dl className="preview-kv">
              <dt>Requirement ID</dt>
              <dd>{controlId || '—'}</dd>
              <dt>Title</dt>
              <dd>{title || '—'}</dd>
              <dt>Control Family</dt>
              <dd>{family ? `${family} - ${familyName(family)}` : '—'}</dd>
              <dt>Security Family</dt>
              <dd>{familyName(family) || '—'}</dd>
              <dt>Priority</dt>
              <dd>{priority ? PRIORITY_LABEL[priority as keyof typeof PRIORITY_LABEL] : '—'}</dd>
              <dt>Source Section</dt>
              <dd>{sourceSection || '—'}</dd>
              <dt>Modules</dt>
              <dd>{modules.length ? modules.map((m) => MODULE_LABEL[m]).join(', ') : '—'}</dd>
              <dt>SPRS weight</dt>
              <dd>{base ? (base.unscored ? 'Not scored' : base.weight) : 'None (organisation-defined)'}</dd>
            </dl>
          </Panel>
          <Panel title="Audit Information" testId="req-form-audit">
            <div className="audit-box">
              <ShieldCheck size={22} aria-hidden="true" />
              <dl className="preview-kv">
                <dt>Created by</dt>
                <dd>{firstRow ? actorLabel(firstRow.created_by, viewer.userId) : '—'}</dd>
                <dt>Created on</dt>
                <dd>{fmt(firstRow?.created_at)}</dd>
                <dt>Last updated by</dt>
                <dd>{lastRow ? actorLabel(lastRow.updated_by, viewer.userId) : '—'}</dd>
                <dt>Last updated on</dt>
                <dd>{fmt(lastRow?.updated_at)}</dd>
              </dl>
            </div>
          </Panel>
        </div>

        <div className="form-footer">
          {apiError && (
            <p className="note" data-tone="bad" role="alert" data-testid="req-form-error">
              {apiError}
            </p>
          )}
          <button type="button" className="btn btn-secondary" onClick={onBack}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="req-form-save">
            {busy ? 'Saving…' : form.mode === 'create' ? 'Create Requirement' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
