// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// evidenceValidation.ts — Sprint 6 slice "Collect Evidence": the deterministic
// evidence validation engine. Pure functions over an evidence item and the
// published CES-Shared catalogue (archetypes, requirement→archetype mappings,
// EVR rules). Two layers:
//   1. built-in checks — completeness, integrity, format, requirement↔archetype
//      mapping, acceptable form, currency, period, ownership, classification;
//   2. published EVR rules whose applies_to matches the item: their
//      `conditions` (fixed vocabulary — BHD decision a: rule logic is data) are
//      evaluated here; `signals` are tenant reads that EvidenceOps / Stamper
//      runs perform, so a signal-only rule is reported as "runtime" not failed.
// Nothing here reads a tenant or executes anything.

import { createHash } from 'node:crypto';

export type Strength = 'weak' | 'adequate' | 'strong';
export interface Check { id: string; label: string; ok: boolean; blocking: boolean; note?: string }
export interface RuleResult { code: string; name: string; outcome: 'met' | 'not_met' | 'partial' | 'runtime' | 'not_applicable'; message: string; conditions: { check: string; value: string; ok: boolean | null }[] }
export interface ValidationReport { checked_at: string; passed: boolean; strength: Strength; checks: Check[]; rules: RuleResult[]; mapping: { type: 'required' | 'recommended' | 'none'; expected_strength: Strength | null } }

export interface Archetype { code: string; name: string; domain: string; acceptable_forms: string[]; assessor_methods: string[] }
export interface Mapping { control_id: string; archetype_code: string; mapping_type: 'required' | 'recommended'; expected_strength: Strength | null }
export interface Rule { code: string; name: string; rule_type?: string; logic: { conditions: { check: string; value: string }[]; signals?: unknown[]; operator: 'AND' | 'OR' }; applies_to: { requirements: string[]; archetypes: string[] }; output: { outcomes: string[]; evidence_strength: Strength[]; message: string } }
export interface Catalogue { archetypes: Archetype[]; mappings: Mapping[]; rules: Rule[] }

export interface EvidenceLike {
  requirement_ids: string[];
  archetype_code: string | null;
  form: string | null;
  title: string;
  kind: string;
  content_type: string | null;
  size_bytes: number;
  sha256: string | null;
  content?: Buffer | Uint8Array | null;
  metadata?: Record<string, unknown> | null;
  collected_at: Date | string;
  period_start?: Date | string | null;
  period_end?: Date | string | null;
  owner: string | null;
  classification: string;
  status: string;
  reviewed_by?: string | null;
}

/** Content types an assessor can open without special tooling, per evidence kind. */
export const ALLOWED_TYPES: Record<string, string[]> = {
  document: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/plain', 'text/markdown'],
  screenshot: ['image/png', 'image/jpeg', 'image/webp'],
  export: ['application/json', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain', 'application/xml', 'text/xml'],
  config_capture: ['application/json', 'text/plain', 'text/csv', 'application/xml', 'text/xml'],
  attestation: ['application/pdf', 'text/plain', 'text/markdown', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  log: ['text/plain', 'application/json', 'text/csv', 'application/gzip', 'application/zip'],
  other: [],
};
export const MAX_CURRENCY_DAYS = 365;
export const sha256Of = (buf: Buffer | Uint8Array) => createHash('sha256').update(buf).digest('hex');

const days = (from: Date | string, to = new Date()) => (to.getTime() - new Date(from).getTime()) / 86_400_000;

export function validateEvidence(item: EvidenceLike, cat: Catalogue): ValidationReport {
  const checks: Check[] = [];
  const archetype = item.archetype_code ? cat.archetypes.find((a) => a.code === item.archetype_code) ?? null : null;
  const mappings = cat.mappings.filter((m) => item.requirement_ids.includes(m.control_id) && m.archetype_code === item.archetype_code);
  const mapping = mappings.find((m) => m.mapping_type === 'required') ?? mappings[0] ?? null;
  const hasExternal = !!(item.metadata && typeof item.metadata.external_url === 'string' && item.metadata.external_url);

  checks.push({ id: 'present', label: 'Evidence content present', ok: item.size_bytes > 0 || hasExternal, blocking: true, note: hasExternal ? 'External repository link' : item.size_bytes ? `${item.size_bytes} bytes` : 'No file and no repository link' });
  checks.push({ id: 'integrity', label: 'SHA-256 recorded and matches', ok: hasExternal ? true : !!item.sha256 && (!item.content || sha256Of(item.content) === item.sha256), blocking: true, note: item.sha256 ? item.sha256.slice(0, 16) + '…' : undefined });
  const allowed = ALLOWED_TYPES[item.kind] ?? [];
  checks.push({ id: 'format', label: 'Format acceptable for this kind of evidence', ok: hasExternal || allowed.length === 0 || (!!item.content_type && allowed.includes(item.content_type)), blocking: true, note: item.content_type ?? 'no content type' });
  checks.push({ id: 'requirement', label: 'Mapped to at least one requirement', ok: item.requirement_ids.length > 0, blocking: true });
  checks.push({ id: 'archetype', label: 'Standard evidence archetype chosen', ok: !!archetype, blocking: true, note: archetype ? `${archetype.code} ${archetype.name}` : item.archetype_code ? 'Unknown archetype code' : 'None' });
  checks.push({ id: 'mapping', label: 'Requirement → archetype mapping exists in the catalogue', ok: !!mapping, blocking: false, note: mapping ? `${mapping.mapping_type}${mapping.expected_strength ? ` · expects ${mapping.expected_strength}` : ''}` : 'Not in the published mapping — assessor may ask why this evidence applies' });
  checks.push({ id: 'form', label: 'Declared form is one the archetype accepts', ok: !archetype || archetype.acceptable_forms.length === 0 || (!!item.form && archetype.acceptable_forms.includes(item.form)), blocking: true, note: item.form ?? (archetype?.acceptable_forms.length ? `Choose one of: ${archetype.acceptable_forms.slice(0, 3).join(' / ')}…` : undefined) });
  const age = days(item.collected_at);
  checks.push({ id: 'currency', label: `Collected within ${MAX_CURRENCY_DAYS} days`, ok: age >= -1 && age <= MAX_CURRENCY_DAYS, blocking: true, note: age < -1 ? 'Collected date is in the future' : `${Math.floor(Math.max(age, 0))} day(s) old` });
  const ps = item.period_start ? new Date(item.period_start) : null;
  const pe = item.period_end ? new Date(item.period_end) : null;
  checks.push({ id: 'period', label: 'Coverage period consistent', ok: !ps || !pe || (pe >= ps && pe.getTime() <= Date.now() + 86_400_000), blocking: false, note: ps && pe ? `${ps.toISOString().slice(0, 10)} → ${pe.toISOString().slice(0, 10)}` : 'No period declared' });
  checks.push({ id: 'owner', label: 'Owner named', ok: !!item.owner, blocking: false });
  checks.push({ id: 'classification', label: 'Classification set', ok: ['cui', 'non_cui', 'internal'].includes(item.classification), blocking: true, note: item.classification });
  checks.push({ id: 'title', label: 'Title describes the artefact', ok: item.title.trim().length >= 8, blocking: false });

  const rules: RuleResult[] = [];
  for (const r of cat.rules) {
    const applies = r.applies_to.requirements.some((q) => item.requirement_ids.includes(q)) || (!!item.archetype_code && r.applies_to.archetypes.includes(item.archetype_code));
    if (!applies) continue;
    const conds = r.logic.conditions.map((c) => ({ check: c.check, value: c.value, ok: evalCondition(c, item, age) }));
    const hasSignals = (r.logic.signals?.length ?? 0) > 0;
    if (conds.length === 0) { rules.push({ code: r.code, name: r.name, outcome: hasSignals ? 'runtime' : 'not_applicable', message: hasSignals ? 'Signal check — evaluated by an EvidenceOps / Stamper run against the tenant, not by document validation' : r.output.message, conditions: [] }); continue; }
    const oks = conds.map((c) => c.ok === true);
    const met = r.logic.operator === 'OR' ? oks.some(Boolean) : oks.every(Boolean);
    const partial = !met && oks.some(Boolean);
    rules.push({ code: r.code, name: r.name, outcome: met ? 'met' : partial && r.output.outcomes.includes('partial') ? 'partial' : 'not_met', message: r.output.message, conditions: conds });
  }

  const blockingFail = checks.some((c) => c.blocking && !c.ok);
  const ruleFail = rules.some((r) => r.outcome === 'not_met');
  const allInfo = checks.every((c) => c.ok);
  const strength: Strength = blockingFail || ruleFail ? 'weak' : allInfo && !!mapping && !!item.reviewed_by ? 'strong' : 'adequate';
  return { checked_at: new Date().toISOString(), passed: !blockingFail && !ruleFail, strength, checks, rules, mapping: { type: mapping?.mapping_type ?? 'none', expected_strength: mapping?.expected_strength ?? null } };
}

function evalCondition(c: { check: string; value: string }, item: EvidenceLike, ageDays: number): boolean | null {
  switch (c.check) {
    case 'evidence_present': return item.size_bytes > 0 || !!(item.metadata && item.metadata.external_url);
    case 'evidence_current_within_days': { const n = Number(c.value); return Number.isFinite(n) ? ageDays <= n : null; }
    case 'attribute_present': return !!(item.metadata && item.metadata[c.value] !== undefined && item.metadata[c.value] !== '' && item.metadata[c.value] !== null);
    case 'approved_by_owner': return !!item.reviewed_by && (item.status === 'validated');
    default: return null;
  }
}

/** Coverage: for each requirement, required archetypes vs evidence that passed validation. */
export function coverage(requirementIds: string[], cat: Catalogue, items: { requirement_ids: string[]; archetype_code: string | null; status: string }[]) {
  return requirementIds.map((rid) => {
    const required = cat.mappings.filter((m) => m.control_id === rid && m.mapping_type === 'required').map((m) => m.archetype_code);
    const recommended = cat.mappings.filter((m) => m.control_id === rid && m.mapping_type === 'recommended').map((m) => m.archetype_code);
    const have = items.filter((i) => i.requirement_ids.includes(rid));
    const validated = new Set(have.filter((i) => i.status === 'validated').map((i) => i.archetype_code));
    const submitted = new Set(have.filter((i) => i.status === 'submitted' || i.status === 'draft').map((i) => i.archetype_code));
    const covered = required.filter((a) => validated.has(a));
    const pending = required.filter((a) => !validated.has(a) && submitted.has(a));
    const missing = required.filter((a) => !validated.has(a) && !submitted.has(a));
    return { requirement_id: rid, required: required.length, covered: covered.length, pending: pending.length, missing, recommended: recommended.length, items: have.length, state: required.length === 0 ? (have.length ? 'covered' : 'none_required') : missing.length === 0 && pending.length === 0 ? 'covered' : covered.length + pending.length > 0 ? 'partial' : 'missing' };
  });
}
