// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// evidenceCatalog.ts — the BHD evidence catalog in muster-api (2026-11-11).
//
// One row per NIST SP 800-171A *Examine* object (definition_id `AC.L2-3.1.1#E01`,
// form_id, objective_ids, tier, production). This is the format Mark asked the
// evidence-analysis contractor for ("one row per NIST object, with the
// objective and evidence-type ids") and what lets CES show an assessor coverage
// per assessment objective. Data is vendored from the ces-contractor kit
// (src/vendored/ces-shared/data/evidence-catalog/README.md); every release file
// is validated against the kit's JSON Schema at load.
//
// Rules kept: the examine text is NIST word for word (the validator refuses a
// row that differs); a definition never sets status (status_effect = none);
// catalog = reference data, no tenant rows.

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import SCHEMA from '../vendored/ces-shared/data/evidence-catalog/evidence-catalog.schema.json';
import RELEASES from '../vendored/ces-shared/data/evidence-catalog/catalog-releases.json';
import RELEASE_0 from '../vendored/ces-shared/data/evidence-catalog/evidence-catalog-release-0.json';
import EXAMINE from '../vendored/ces-shared/data/evidence-catalog/nist-800-171a-examine-lists.json';
import OBJECTIVES from '../vendored/ces-shared/data/evidence-catalog/objective-coverage-buckets.json';
import { CONTROL_REFS } from '../routes/assessments.js';

export interface EvidenceDefinition {
  definition_id: string; requirement_id: string; nist_ref: string; examine_index: number; examine_text: string;
  form_id: string; form_title: string; legacy_alias?: string; emx_ids: string[]; emx_proposed_new?: string[];
  objective_ids: string[]; tier: 'must_have' | 'nice_to_have'; production: 'signal' | 'capture' | 'rendered' | 'attested';
  status_effect: string; collection_guidance?: string; status: 'draft' | 'released' | 'retired'; gcc_high_checked?: boolean;
}
export interface CatalogRelease { catalog_version: string; released_on: string; definitions: EvidenceDefinition[]; change_log?: unknown; approved_by_role?: string }
export interface ExamineEntry { requirement_id: string; requirement_text: string; examine: string[] }
export interface ObjectiveEntry { objective_id: string; control: string; statement: string; bucket: string; bucket_meaning: string; runnable_reads_for_control: number }

const RELEASE_FILES: Record<string, unknown> = { 'evidence-catalog-release-0.json': RELEASE_0 };

/** `3.1.1` for `AC.L1-3.1.1` / `AC.L2-3.1.1` / `3.1.1`. */
export const toNistRef = (id: string): string => { const m = id.match(/(3\.\d{1,2}\.\d{1,2})$/); return m ? m[1] : id; };

type ReleaseValidator = ((data: unknown) => boolean) & { errors?: { instancePath: string; message?: string }[] | null };
let validateRelease: ReleaseValidator | undefined;
export function releaseValidator(): ReleaseValidator {
  if (!validateRelease) { const ajv = new Ajv2020({ allErrors: true }); addFormats(ajv); validateRelease = ajv.compile(SCHEMA as object) as unknown as ReleaseValidator; }
  return validateRelease;
}

export interface EvidenceCatalog {
  releases: { release: number; date: string; catalog_file: string; catalog_version: string; definitions: number }[];
  definitions: EvidenceDefinition[];
  byNist: Map<string, EvidenceDefinition[]>;
  byId: Map<string, EvidenceDefinition>;
  examine: Map<string, ExamineEntry>;
  objectives: Map<string, ObjectiveEntry[]>; // by NIST ref
  objectiveById: Map<string, ObjectiveEntry>;
}

let cache: EvidenceCatalog | undefined;
/** Loads, validates and indexes the catalog once per process. Throws if a release does not validate. */
export function loadCatalog(): EvidenceCatalog {
  if (cache) return cache;
  const log = RELEASES as { releases: { release: number; date: string; catalog_file: string; catalog_version: string; definitions: number }[] };
  const byId = new Map<string, EvidenceDefinition>();
  for (const r of [...log.releases].sort((a, b) => a.release - b.release)) {
    const file = RELEASE_FILES[r.catalog_file];
    if (!file) throw new Error(`evidence catalog: release file ${r.catalog_file} is listed but not vendored`);
    const v = releaseValidator();
    if (!v(file)) throw new Error(`evidence catalog: ${r.catalog_file} does not validate: ${(v.errors ?? []).slice(0, 3).map((e) => `${e.instancePath} ${e.message}`).join('; ')}`);
    for (const d of (file as CatalogRelease).definitions) byId.set(d.definition_id, d); // later release replaces earlier
  }
  const definitions = [...byId.values()].sort((a, b) => a.definition_id.localeCompare(b.definition_id));
  const byNist = new Map<string, EvidenceDefinition[]>();
  for (const d of definitions) byNist.set(d.nist_ref, [...(byNist.get(d.nist_ref) ?? []), d]);
  const examine = new Map<string, ExamineEntry>((EXAMINE as { requirements: ExamineEntry[] }).requirements.map((e) => [e.requirement_id, e]));
  const objectives = new Map<string, ObjectiveEntry[]>();
  const objectiveById = new Map<string, ObjectiveEntry>();
  for (const o of (OBJECTIVES as { objectives: ObjectiveEntry[] }).objectives) { const k = toNistRef(o.control); objectives.set(k, [...(objectives.get(k) ?? []), o]); objectiveById.set(o.objective_id, o); }
  cache = { releases: log.releases, definitions, byNist, byId, examine, objectives, objectiveById };
  return cache;
}

// ---------------------------------------------------------------- coverage
export interface EvidenceLike { id: string; status: string; requirement_ids: string[]; objective_ids: string[]; archetype_code?: string | null; metadata?: { definition_id?: string } | null; title?: string }

export interface ExamineCoverageRow { examine_index: number; examine_text: string; definition: EvidenceDefinition | null; items: { id: string; status: string; title?: string }[]; state: 'covered' | 'pending' | 'missing' | 'undefined' }
export interface ObjectiveCoverageRow { objective_id: string; statement: string; bucket: string; definitions: string[]; items: { id: string; status: string }[]; state: 'covered' | 'pending' | 'missing' }
export interface RequirementCoverage { requirement_id: string; nist_ref: string; requirement_text: string | null; examine: ExamineCoverageRow[]; objectives: ObjectiveCoverageRow[]; summary: { examine_total: number; examine_defined: number; examine_covered: number; objectives_total: number; objectives_covered: number } }

const ACCEPTED = new Set(['validated', 'approved', 'accepted']);
const PENDING = new Set(['draft', 'submitted', 'in_review']);
const stateOf = (items: { status: string }[]): 'covered' | 'pending' | 'missing' => items.some((i) => ACCEPTED.has(i.status)) ? 'covered' : items.some((i) => PENDING.has(i.status)) ? 'pending' : 'missing';

/** An item evidences a definition when filed against it (metadata.definition_id) or when its archetype is one of the definition's EMX ids. */
function itemsForDefinition(d: EvidenceDefinition, items: EvidenceLike[]) {
  return items.filter((i) => i.metadata?.definition_id === d.definition_id || (i.archetype_code && d.emx_ids.includes(i.archetype_code)));
}

export function requirementCoverage(requirementId: string, items: EvidenceLike[], cat = loadCatalog()): RequirementCoverage {
  const nist = toNistRef(requirementId);
  const ex = cat.examine.get(nist);
  const defs = cat.byNist.get(nist) ?? [];
  const mine = items.filter((i) => i.requirement_ids.some((r) => toNistRef(r) === nist));
  const examine: ExamineCoverageRow[] = (ex?.examine ?? []).map((text, idx) => {
    const d = defs.find((x) => x.examine_index === idx + 1) ?? null;
    const its = d ? itemsForDefinition(d, mine).map((i) => ({ id: i.id, status: i.status, title: i.title })) : [];
    return { examine_index: idx + 1, examine_text: text, definition: d, items: its, state: d ? stateOf(its) : 'undefined' };
  });
  const objectives: ObjectiveCoverageRow[] = (cat.objectives.get(nist) ?? []).map((o) => {
    const viaDef = defs.filter((d) => d.objective_ids.includes(o.objective_id));
    const its = mine.filter((i) => i.objective_ids.includes(o.objective_id) || viaDef.some((d) => itemsForDefinition(d, [i]).length)).map((i) => ({ id: i.id, status: i.status }));
    return { objective_id: o.objective_id, statement: o.statement, bucket: o.bucket, definitions: viaDef.map((d) => d.definition_id), items: its, state: stateOf(its) };
  });
  return {
    requirement_id: requirementId, nist_ref: nist, requirement_text: ex?.requirement_text ?? null, examine, objectives,
    summary: { examine_total: examine.length, examine_defined: examine.filter((e) => e.definition).length, examine_covered: examine.filter((e) => e.state === 'covered').length, objectives_total: objectives.length, objectives_covered: objectives.filter((o) => o.state === 'covered').length },
  };
}

/** 110 rows for the Evidence overview: how much of each requirement's examine list is defined and evidenced. */
export function catalogSummary(items: EvidenceLike[], cat = loadCatalog()) {
  return CONTROL_REFS.map((c) => { const r = requirementCoverage(c.control_id, items, cat); return { requirement_id: c.control_id, nist_ref: r.nist_ref, ...r.summary }; });
}

// ---------------------------------------------------------------- validator (Mark's "check each batch by script")
export interface RowFinding { row: number; definition_id: string | null; severity: 'fix' | 'tidy'; code: string; message: string; suggested_fix?: string }

/** Checks a batch of catalog rows the way the kit's review does: schema, NIST text word for word, one form id, objective ids belong to the requirement, unique ids. */
export function validateCatalogRows(rows: unknown[], cat = loadCatalog()): { findings: RowFinding[]; ok: number; total: number } {
  const findings: RowFinding[] = [];
  const seen = new Map<string, number>();
  const v = releaseValidator();
  rows.forEach((raw, i) => {
    const row = i + 1;
    const r = (raw ?? {}) as Partial<EvidenceDefinition> & Record<string, unknown>;
    const id = typeof r.definition_id === 'string' ? r.definition_id : null;
    // 1. schema — validate as a one-row release so the item schema applies.
    const probe = { ...PROBE_HEADER, definitions: [raw] };
    if (!v(probe)) for (const e of (v.errors ?? []).filter((x) => x.instancePath.startsWith('/definitions')).slice(0, 6)) findings.push({ row, definition_id: id, severity: 'fix', code: 'schema', message: `${e.instancePath.replace(/^\/definitions\/0/, '') || '/'} ${e.message ?? 'invalid'}` });
    if (!id) { findings.push({ row, definition_id: null, severity: 'fix', code: 'id_missing', message: 'definition_id missing', suggested_fix: '<REQ>#E<nn> from requirement_id and examine_index' }); return; }
    if (seen.has(id)) findings.push({ row, definition_id: id, severity: 'fix', code: 'id_duplicate', message: `definition_id repeats row ${seen.get(id)}` }); else seen.set(id, row);
    const nist = r.nist_ref ?? (r.requirement_id ? toNistRef(r.requirement_id) : null);
    const ex = typeof nist === 'string' ? cat.examine.get(nist) : undefined;
    if (!ex) { findings.push({ row, definition_id: id, severity: 'fix', code: 'requirement_unknown', message: `requirement ${r.requirement_id ?? nist ?? '?'} is not a NIST SP 800-171 r2 requirement` }); return; }
    if (r.requirement_id && toNistRef(r.requirement_id) !== nist) findings.push({ row, definition_id: id, severity: 'fix', code: 'requirement_mismatch', message: `requirement_id ${r.requirement_id} and nist_ref ${nist} disagree` });
    if (!id.startsWith(`${r.requirement_id}#`)) findings.push({ row, definition_id: id, severity: 'fix', code: 'id_requirement', message: `definition_id does not start with requirement_id ${r.requirement_id}` });
    // 2. NIST word for word
    const idx = typeof r.examine_index === 'number' ? r.examine_index : null;
    const expected = idx ? ex.examine[idx - 1] : undefined;
    if (!expected) findings.push({ row, definition_id: id, severity: 'fix', code: 'examine_index', message: `examine_index ${idx ?? '?'} is outside ${nist}'s list (${ex.examine.length} objects)` });
    else if (r.examine_text !== expected) {
      const near = ex.examine.findIndex((t) => norm(t) === norm(String(r.examine_text ?? '')));
      findings.push({ row, definition_id: id, severity: near >= 0 && near !== idx! - 1 ? 'fix' : (norm(expected) === norm(String(r.examine_text ?? '')) ? 'tidy' : 'fix'), code: near >= 0 && near !== idx! - 1 ? 'examine_wrong_slot' : 'examine_text', message: near >= 0 && near !== idx! - 1 ? `text is NIST object ${near + 1} of ${nist}, not ${idx}` : `examine_text is not NIST word for word`, suggested_fix: expected });
    }
    // 3. one form id
    if (!r.form_id || typeof r.form_id !== 'string') findings.push({ row, definition_id: id, severity: 'fix', code: 'form_missing', message: 'form_id (document-type id) missing' });
    else if (/[,;|/]/.test(r.form_id) || /\s/.test(r.form_id.trim())) findings.push({ row, definition_id: id, severity: 'fix', code: 'form_multiple', message: `form_id "${r.form_id}" holds more than one id`, suggested_fix: 'one document type per row; add a second row for the other' });
    // 4. objective ids belong to the requirement; EMX ids well-formed
    const objs = Array.isArray(r.objective_ids) ? r.objective_ids : [];
    const own = new Set((cat.objectives.get(ex.requirement_id) ?? []).map((o) => o.objective_id));
    for (const o of objs) if (!own.has(o)) findings.push({ row, definition_id: id, severity: 'fix', code: 'objective_foreign', message: `objective ${o} does not belong to ${nist}` });
    if (!objs.length && !(r.emx_ids as string[] | undefined)?.length) findings.push({ row, definition_id: id, severity: 'tidy', code: 'ids_empty', message: 'objective_ids and emx_ids both empty — add a short note or fill them in' });
    for (const e of (Array.isArray(r.emx_ids) ? r.emx_ids : []) as string[]) if (!/^EMX-[A-Z0-9]+-\d{3}$/.test(e)) findings.push({ row, definition_id: id, severity: 'tidy', code: 'emx_format', message: `emx id "${e}" is not EMX-<AREA>-<nnn>` });
  });
  const bad = new Set(findings.filter((f) => f.severity === 'fix').map((f) => f.row));
  return { findings, ok: rows.length - bad.size, total: rows.length };
}
/** Header of the kit's release 0 minus its definitions — the batch validator wraps rows in it so the item schema applies. */
const PROBE_HEADER = (() => { const { definitions: _d, ...h } = RELEASE_0 as CatalogRelease; return h; })();
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
