// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

/**
 * Contracts — full CRUD UI for the 14-field Contract entity.
 * API: GET|POST /api/contracts, PUT|DELETE /api/contracts/:id
 * Offline notice when API is unreachable.
 *
 * For individual_contractor engagements, prime_ref is null —
 * contracts attach directly to the contractor party.
 * [validate with BHD — confirm prime_ref null semantics and party_id resolution]
 */
import { useState, useEffect } from 'react';
import { api } from '@/shared/api/musterApi';
import type { Contract, EngagementKind } from '@/shared/types/engagement';
import { validateContractForm, type ContractFormData, type ContractFormErrors } from './contractValidation';

interface ContractsPageProps {
  engagementKind: EngagementKind | null;
  /** Current party ID — used when creating contracts. */
  partyId: string | null;
  /** QA 2026-11-13: muster-api requires engagement_id on create (it was never sent → 400 → "server unreachable"). */
  engagementId?: string | null;
}

/** What muster-api stores (prisma Contract): the form's start/end dates are pop_start/pop_end. */
interface ApiContract {
  id: string;
  party_id: string;
  engagement_id: string;
  contract_number: string;
  program_name: string;
  cmmc_level_required: number;
  cage_code?: string | null;
  uei?: string | null;
  contracting_office?: string | null;
  pop_start?: string | null;
  pop_end?: string | null;
}
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : undefined);
function fromApi(c: ApiContract): Contract {
  return {
    id: c.id,
    contract_number: c.contract_number,
    program_name: c.program_name,
    cmmc_level_required: c.cmmc_level_required as 1 | 2 | 3,
    party_id: c.party_id,
    prime_ref: null,
    start_date: day(c.pop_start),
    end_date: day(c.pop_end),
    cage_code: c.cage_code ?? undefined,
    uei: c.uei ?? undefined,
    contracting_office: c.contracting_office ?? undefined,
  };
}
const FIELD_LABEL: Record<string, string> = { contract_number: 'Contract number', program_name: 'Program name', cmmc_level_required: 'CMMC level', party_id: 'party', engagement_id: 'engagement', pop_start: 'Start date', pop_end: 'End date', cage_code: 'CAGE code', uei: 'UEI' };
function saveFailure(r: { status: number; error?: string; details?: { path: string; message: string }[] }): string {
  if (r.status === 0) return 'Could not reach muster-api — check that it is running, then try again.';
  if (r.status === 403) return 'Your role cannot change contracts.';
  if (r.details?.length) return `Not saved — ${r.details.map((d) => `${FIELD_LABEL[d.path] ?? d.path}: ${d.message}`).join('; ')}.`;
  return r.error ?? `Not saved — muster-api answered ${r.status}.`;
}

const EMPTY_FORM: ContractFormData = {
  contract_number: '',
  program_name: '',
  cmmc_level_required: '',
  prime_ref: null,
  start_date: '',
  end_date: '',
  value_usd: '',
  cage_code: '',
  uei: '',
  contracting_office: '',
  classification_level: '',
  notes: '',
};

type FormMode = 'none' | 'create' | 'edit';

export default function ContractsPage({ engagementKind, partyId, engagementId }: ContractsPageProps) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formMode, setFormMode] = useState<FormMode>('none');
  const [formData, setFormData] = useState<ContractFormData>(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [errors, setErrors] = useState<ContractFormErrors>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState('');

  const isIndividualContractor = engagementKind === 'individual_contractor';

  const loadContracts = async () => {
    setLoading(true);
    setOffline(false);
    const result = await api.get<ApiContract[]>(partyId ? `/contracts?party_id=${encodeURIComponent(partyId)}` : '/contracts');
    if (!result.ok) {
      setOffline(true);
    } else {
      setContracts(result.data.map(fromApi));
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadContracts();
  }, []);

  const openCreate = () => {
    setFormData({
      ...EMPTY_FORM,
      party_id: partyId ?? undefined,
      prime_ref: isIndividualContractor ? null : undefined,
    });
    setErrors({});
    setEditId(null);
    setFormMode('create');
    setSubmitError('');
  };

  const openEdit = (c: Contract) => {
    setFormData({
      contract_number: c.contract_number,
      program_name: c.program_name,
      cmmc_level_required: c.cmmc_level_required,
      party_id: c.party_id,
      prime_ref: c.prime_ref,
      start_date: c.start_date ?? '',
      end_date: c.end_date ?? '',
      value_usd: c.value_usd ?? '',
      cage_code: c.cage_code ?? '',
      uei: c.uei ?? '',
      contracting_office: c.contracting_office ?? '',
      classification_level: c.classification_level ?? '',
      notes: c.notes ?? '',
    });
    setErrors({});
    setEditId(c.id);
    setFormMode('edit');
    setSubmitError('');
  };

  const cancelForm = () => {
    setFormMode('none');
    setEditId(null);
    setErrors({});
    setSubmitError('');
  };

  const handleField = (field: keyof ContractFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // QA 2026-11-13: a message goes away once its field is filled in.
    if (field in errors) setErrors((prev) => ({ ...prev, [field]: undefined }));
    if (field === 'start_date' || field === 'end_date') setErrors((prev) => ({ ...prev, end_date: undefined }));
  };

  const submitForm = async () => {
    const errs = validateContractForm(formData);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setSubmitError('');

    const toDate = (d?: string) => (d ? `${d}T00:00:00.000Z` : null);
    const payload = {
      contract_number: String(formData.contract_number ?? '').trim(),
      program_name: String(formData.program_name ?? '').trim(),
      cmmc_level_required: Number(formData.cmmc_level_required),
      party_id: partyId ?? formData.party_id,
      engagement_id: engagementId ?? undefined,
      prime_ref: isIndividualContractor ? null : (formData.prime_ref ?? null),
      pop_start: toDate(formData.start_date),
      pop_end: toDate(formData.end_date),
      cage_code: formData.cage_code?.trim() || null,
      uei: formData.uei?.trim() || null,
      contracting_office: formData.contracting_office?.trim() || null,
      cui_categories: [],
    };

    if (formMode === 'create') {
      const result = await api.post<ApiContract>('/contracts', payload);
      if (!result.ok) {
        setSubmitError(saveFailure(result));
        return;
      }
      setContracts((prev) => [...prev, fromApi(result.data)]);
    } else if (formMode === 'edit' && editId) {
      const patch: Partial<typeof payload> = { ...payload };
      delete patch.party_id;
      delete patch.engagement_id;
      const result = await api.put<ApiContract>(`/contracts/${editId}`, patch);
      if (!result.ok) {
        setSubmitError(saveFailure(result));
        return;
      }
      setContracts((prev) => prev.map((c) => (c.id === editId ? fromApi(result.data) : c)));
    }

    // QA 2026-11-13: the form clears after a save.
    setFormData(EMPTY_FORM);
    setFormMode('none');
    setEditId(null);
  };

  const confirmDelete = (id: string) => setDeleteConfirmId(id);

  const executeDelete = async (id: string) => {
    const result = await api.delete(`/contracts/${id}`);
    if (!result.ok) {
      setSubmitError(result.status === 403 ? 'Only a BHD operator can delete a contract.' : saveFailure(result));
    } else {
      setContracts((prev) => prev.filter((c) => c.id !== id));
    }
    setDeleteConfirmId(null);
  };

  return (
    <div className="page">
      <div className="ces-titleblock" style={{ marginBottom: 16 }}>
        <span className="tb-title">Contracts</span>
        {isIndividualContractor && (
          <span className="tb-designator">INDIVIDUAL CONTRACTOR</span>
        )}
      </div>

      {isIndividualContractor && (
        <p className="eyebrow" style={{ marginBottom: 12 }}>
          Contracts attach directly to this contractor party (no prime reference).{' '}
          {/* [validate with BHD] */}
        </p>
      )}

      {offline && (
        <div className="callout-warning" data-testid="contracts-offline-notice">
          API unreachable — contract data not loaded. Check your connection and{' '}
          <button
            style={{ background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: 0, color: 'inherit', font: 'inherit' }}
            onClick={() => void loadContracts()}
          >
            retry
          </button>
          .
        </div>
      )}

      {submitError && (
        <p className="form-error" data-testid="contracts-submit-error">
          {submitError}
        </p>
      )}

      {!offline && !loading && formMode === 'none' && !partyId && (
        <p className="callout-warning" style={{ marginBottom: 12 }} data-testid="contracts-no-party">
          Contracts belong to the party of an engagement. Open or begin an assessment under Situation first; then add its contracts here.
        </p>
      )}
      {!offline && !loading && formMode === 'none' && (
        <button
          className="btn btn-primary"
          data-testid="contracts-add-btn"
          onClick={openCreate}
          disabled={!partyId}
          title={partyId ? undefined : 'Begin an assessment first'}
          style={{ marginBottom: 16 }}
        >
          + Add Contract
        </button>
      )}

      {loading && <p>Loading contracts…</p>}

      {!loading && !offline && contracts.length === 0 && formMode === 'none' && (
        <p style={{ color: 'var(--co-text-muted)', fontSize: 14 }}>No contracts on file.</p>
      )}

      {!loading && !offline && contracts.length > 0 && formMode === 'none' && (
        <table className="data-table" data-testid="contracts-table">
          <thead>
            <tr>
              <th>Contract #</th>
              <th>Program</th>
              <th>CMMC Lvl</th>
              {!isIndividualContractor && <th>Prime Ref</th>}
              <th>Start</th>
              <th>End</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c.id} data-testid={`contract-row-${c.id}`}>
                <td>{c.contract_number}</td>
                <td>{c.program_name}</td>
                <td>{c.cmmc_level_required}</td>
                {!isIndividualContractor && <td>{c.prime_ref ?? '—'}</td>}
                <td>{c.start_date ?? '—'}</td>
                <td>{c.end_date ?? '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button
                    className="btn"
                    onClick={() => openEdit(c)}
                    style={{ marginRight: 8 }}
                    aria-label={`Edit contract ${c.contract_number}`}
                  >
                    Edit
                  </button>
                  {deleteConfirmId === c.id ? (
                    <>
                      <button
                        className="btn"
                        style={{ color: 'var(--co-violation)', marginRight: 4 }}
                        onClick={() => void executeDelete(c.id)}
                        aria-label={`Confirm delete contract ${c.contract_number}`}
                      >
                        Confirm
                      </button>
                      <button className="btn" onClick={() => setDeleteConfirmId(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn"
                      onClick={() => confirmDelete(c.id)}
                      aria-label={`Delete contract ${c.contract_number}`}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(formMode === 'create' || formMode === 'edit') && (
        <section data-testid="contract-form">
          <h3 style={{ marginBottom: 12, fontSize: 15, fontWeight: 700 }}>
            {formMode === 'create' ? 'New Contract' : 'Edit Contract'}
          </h3>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '1 1 200px' }}>
              <label className="field-label">
                Contract Number <span className="req">*</span>
                <input
                  type="text"
                  value={String(formData.contract_number ?? '')}
                  onChange={(e) => handleField('contract_number', e.target.value)}
                  placeholder="W911NF-24-C-0001"
                  data-testid="contract-number-input"
                />
              </label>
              {errors.contract_number && (
                <p className="form-error">{errors.contract_number}</p>
              )}
            </div>

            <div className="field" style={{ flex: '1 1 200px' }}>
              <label className="field-label">
                Program Name <span className="req">*</span>
                <input
                  type="text"
                  value={String(formData.program_name ?? '')}
                  onChange={(e) => handleField('program_name', e.target.value)}
                  placeholder="CUI Cyber Program"
                  data-testid="program-name-input"
                />
              </label>
              {errors.program_name && (
                <p className="form-error">{errors.program_name}</p>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '0 0 140px' }}>
              <label className="field-label">
                CMMC Level Required <span className="req">*</span>
                <select
                  value={String(formData.cmmc_level_required ?? '')}
                  onChange={(e) => handleField('cmmc_level_required', e.target.value)}
                  data-testid="cmmc-level-select"
                >
                  <option value="">Select…</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </select>
              </label>
              {errors.cmmc_level_required && (
                <p className="form-error">{errors.cmmc_level_required}</p>
              )}
            </div>

            {!isIndividualContractor && (
              <div className="field" style={{ flex: '1 1 200px' }}>
                <label className="field-label">
                  Prime Reference
                  <input
                    type="text"
                    value={String(formData.prime_ref ?? '')}
                    onChange={(e) => handleField('prime_ref', e.target.value)}
                    placeholder="Prime contract #"
                  />
                </label>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '1 1 140px' }}>
              <label className="field-label">
                Start Date
                <input
                  type="date"
                  value={String(formData.start_date ?? '')}
                  onChange={(e) => handleField('start_date', e.target.value)}
                />
              </label>
            </div>
            <div className="field" style={{ flex: '1 1 140px' }}>
              <label className="field-label">
                End Date
                <input
                  type="date"
                  value={String(formData.end_date ?? '')}
                  min={String(formData.start_date ?? '') || undefined}
                  onChange={(e) => handleField('end_date', e.target.value)}
                  aria-invalid={errors.end_date ? true : undefined}
                />
              </label>
              {errors.end_date && <p className="form-error">{errors.end_date}</p>}
            </div>
          </div>
          <p className="eyebrow" style={{ margin: '-6px 0 10px' }}>Period of performance. Contract value, classification and notes are not stored by CES and are no longer asked for.</p>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: '1 1 140px' }}>
              <label className="field-label">
                CAGE Code
                <input
                  type="text"
                  value={String(formData.cage_code ?? '')}
                  onChange={(e) => handleField('cage_code', e.target.value)}
                  placeholder="5-char CAGE"
                />
              </label>
            </div>
            <div className="field" style={{ flex: '1 1 160px' }}>
              <label className="field-label">
                UEI
                <input
                  type="text"
                  value={String(formData.uei ?? '')}
                  onChange={(e) => handleField('uei', e.target.value)}
                  placeholder="12-char UEI"
                />
              </label>
            </div>
          </div>

          <div className="field">
            <label className="field-label">
              Contracting Office
              <input
                type="text"
                value={String(formData.contracting_office ?? '')}
                onChange={(e) => handleField('contracting_office', e.target.value)}
                placeholder="e.g., ACC-Aberdeen"
              />
            </label>
          </div>


          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            <button
              className="btn btn-primary"
              onClick={() => void submitForm()}
              data-testid="contract-submit-btn"
            >
              {formMode === 'create' ? 'Create Contract' : 'Save Changes'}
            </button>
            <button className="btn" onClick={cancelForm}>
              Cancel
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
