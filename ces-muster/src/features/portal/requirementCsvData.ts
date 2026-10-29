// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// requirementCsvData.ts — S1.2: CSV for the 110 Requirements page.
// Export: the rows on screen with their metadata. Import, validated and
// previewed before any draft is written:
//  - a row for one of the 110: priority, modules, guidance and (S1.9)
//    assessment criteria, status and effective date; locked fields are ignored;
//  - S1.9: any other ID with a title creates or updates an
//    organisation-defined requirement.
import type { CustomRequirement, ItemView, ModuleId, RequirementMeta } from '@/shared/api/sharedApi';
import type { RequirementRow } from './referenceData';
import { nistOf } from './requirementMetaData';

const MODULES: ModuleId[] = ['muster', 'stamper', 'adminops', 'evidenceops'];
export const CSV_HEADER = ['control_id', 'nist_ref', 'family', 'level', 'type', 'sprs_weight', 'priority', 'modules', 'implementation_guidance', 'practice'];

/** QA 2026-10-29 #4/#5: the table export uses the column names the user sees and
 * only the columns that are visible. Keys match the 110 Requirements grid. */
export type ExportColumn = 'id' | 'title' | 'family' | 'securityFamily' | 'type' | 'priority' | 'modules' | 'weight';
export const EXPORT_COLUMNS: { key: ExportColumn; label: string }[] = [
  { key: 'id', label: 'Req ID' },
  { key: 'title', label: 'Requirement Title' },
  { key: 'family', label: 'Control Family' },
  { key: 'securityFamily', label: 'Security Family' },
  { key: 'type', label: 'Type' },
  { key: 'priority', label: 'Priority' },
  { key: 'modules', label: 'Used In Modules' },
  { key: 'weight', label: 'Weight' },
];
/** Table header → import key, so a view export can be re-imported unchanged. */
const HEADER_ALIASES: Record<string, string> = {
  'req id': 'control_id',
  'requirement id': 'control_id',
  'requirement title': 'practice',
  'control family': 'family',
  'used in modules': 'modules',
  weight: 'sprs_weight',
  'sprs weight': 'sprs_weight',
  'implementation guidance': 'implementation_guidance',
  'assessment criteria': 'assessment_criteria',
};
const PRIORITY_LABEL: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };
const MODULE_LABEL: Record<string, string> = { muster: 'Muster', stamper: 'Stamper', adminops: 'AdminOps', evidenceops: 'EvidenceOps' };

export function requirementsViewCsv(rows: readonly RequirementRow[], metaOf: (id: string) => RequirementMeta | null, columns: readonly ExportColumn[]): string {
  const cols = EXPORT_COLUMNS.filter((c) => columns.includes(c.key));
  const lines = [cols.map((c) => c.label).map(cell).join(',')];
  for (const r of rows) {
    const m = metaOf(r.control_id);
    const value: Record<ExportColumn, unknown> = {
      id: r.control_id,
      title: r.practice,
      family: `${r.family} - ${r.family_name}`,
      securityFamily: r.family_name,
      type: nistOf(r.nist_ref)?.requirement_type ?? '',
      priority: m?.priority ? PRIORITY_LABEL[m.priority] ?? m.priority : '',
      modules: (m?.modules ?? []).map((x) => MODULE_LABEL[x] ?? x).join('; '),
      weight: r.weight,
    };
    lines.push(cols.map((c) => cell(value[c.key])).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

export function exportRequirementsView(rows: readonly RequirementRow[], metaOf: (id: string) => RequirementMeta | null, columns: readonly ExportColumn[]) {
  download(requirementsViewCsv(rows, metaOf, columns), `ces-110-requirements-${new Date().toISOString().slice(0, 10)}.csv`);
}

function download(text: string, name: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
/** S1.9: columns of the bulk-import template. */
export const TEMPLATE_HEADER = ['control_id', 'title', 'family', 'priority', 'description', 'source_standard', 'source_section', 'modules', 'implementation_guidance', 'assessment_criteria', 'status', 'effective_date'];
const CUSTOM_ID = /^[A-Z][A-Z0-9.-]{1,29}$/;
const FAMILY_CODES = ['AC', 'AT', 'AU', 'CM', 'IA', 'IR', 'MA', 'MP', 'PS', 'PE', 'RA', 'CA', 'SC', 'SI'];

function cell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function requirementsCsv(rows: readonly RequirementRow[], metaOf: (id: string) => RequirementMeta | null): string {
  const lines = [CSV_HEADER.join(',')];
  for (const r of rows) {
    const m = metaOf(r.control_id);
    lines.push(
      [r.control_id, r.nist_ref, r.family, `L${r.cmmc_level}`, nistOf(r.nist_ref)?.requirement_type ?? '', r.weight, m?.priority ?? '', (m?.modules ?? []).join(';'), m?.implementation_guidance ?? '', r.practice]
        .map(cell)
        .join(',')
    );
  }
  return lines.join('\r\n') + '\r\n';
}

/** RFC 4180-style parser (quotes, doubled quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

export type ImportLine =
  | { line: number; controlId: string; status: 'change'; kind: 'requirement_meta'; data: RequirementMeta; isNew: boolean }
  | { line: number; controlId: string; status: 'change'; kind: 'custom_requirement'; data: CustomRequirement; isNew: boolean }
  | { line: number; controlId: string; status: 'unchanged' }
  | { line: number; controlId: string; status: 'error'; message: string };

/** Validates an import against the 110 requirements and the current metadata. */
export function planImport(
  text: string,
  known: Set<string>,
  existing: Map<string, ItemView<RequirementMeta>>,
  customExisting: Map<string, ItemView<CustomRequirement>> = new Map()
): { lines: ImportLine[]; headerError: string | null } {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''));
  if (!rows.length) return { lines: [], headerError: 'The file is empty.' };
  const head = rows[0].map((h) => h.trim().toLowerCase()).map((h) => HEADER_ALIASES[h] ?? h);
  const col = (n: string) => head.indexOf(n);
  if (col('control_id') < 0) return { lines: [], headerError: 'The first row must name the columns and include control_id.' };
  const seen = new Set<string>();
  const lines: ImportLine[] = rows.slice(1).map((r, i) => {
    const line = i + 2;
    const get = (n: string) => (col(n) >= 0 ? (r[col(n)] ?? '').trim() : undefined);
    const controlId = (get('control_id') ?? '').toUpperCase();
    if (seen.has(controlId)) return { line, controlId, status: 'error', message: 'Listed twice' };
    seen.add(controlId);
    if (!known.has(controlId)) return planCustom(line, controlId, get, customExisting);
    const view = existing.get(controlId);
    const cur = view?.draft?.data ?? view?.current ?? null;
    const p = get('priority');
    const priority = p === undefined ? cur?.priority ?? null : p === '' ? null : p.toLowerCase();
    if (priority !== null && !['high', 'medium', 'low'].includes(priority)) return { line, controlId, status: 'error', message: `Priority "${p}" must be High, Medium, Low or empty` };
    const mods = get('modules');
    const modules = mods === undefined ? cur?.modules ?? [] : mods.split(/[;|]/).map((m) => m.trim().toLowerCase()).filter(Boolean);
    const bad = modules.filter((m) => !MODULES.includes(m as ModuleId));
    if (bad.length) return { line, controlId, status: 'error', message: `Unknown module "${bad[0]}"` };
    const guidance = get('implementation_guidance') ?? cur?.implementation_guidance ?? '';
    if (guidance.length > 1000) return { line, controlId, status: 'error', message: 'Guidance is longer than 1000 characters' };
    const extras = readExtras(get, cur);
    if ('error' in extras) return { line, controlId, status: 'error', message: extras.error };
    const data: RequirementMeta = { ...(cur ?? {}), control_id: controlId, priority: priority as RequirementMeta['priority'], modules: [...new Set(modules)] as ModuleId[], implementation_guidance: guidance, ...extras };
    const same = cur && JSON.stringify(normalise(cur)) === JSON.stringify(normalise(data));
    if (same || (!cur && !data.priority && !data.modules.length && !data.implementation_guidance && !data.assessment_criteria)) return { line, controlId, status: 'unchanged' };
    return { line, controlId, status: 'change', kind: 'requirement_meta', data, isNew: !view };
  });
  return { lines, headerError: null };
}

type Get = (n: string) => string | undefined;

/** Stable comparison: sorted modules, no undefined keys. */
function normalise(d: object): object {
  const o = JSON.parse(JSON.stringify(d)) as Record<string, unknown>;
  if (Array.isArray(o.modules)) o.modules = [...(o.modules as string[])].sort();
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
}

/** S1.9: assessment criteria, status and effective date (kept from the current item when the column is absent). */
function readExtras(get: Get, cur: { assessment_criteria?: string; status?: 'active' | 'inactive'; effective_date?: string | null } | null): { assessment_criteria?: string; status?: 'active' | 'inactive'; effective_date?: string | null } | { error: string } {
  const out: { assessment_criteria?: string; status?: 'active' | 'inactive'; effective_date?: string | null } = {};
  const crit = get('assessment_criteria');
  if (crit !== undefined) {
    if (crit.length > 1000) return { error: 'Assessment criteria is longer than 1000 characters' };
    out.assessment_criteria = crit;
  } else if (cur?.assessment_criteria !== undefined) out.assessment_criteria = cur.assessment_criteria;
  const st = get('status');
  if (st !== undefined && st !== '') {
    const v = st.toLowerCase();
    if (v !== 'active' && v !== 'inactive') return { error: `Status "${st}" must be Active or Inactive` };
    out.status = v;
  } else if (cur?.status) out.status = cur.status;
  const eff = get('effective_date');
  if (eff !== undefined) {
    if (eff && !/^\d{4}-\d{2}-\d{2}$/.test(eff)) return { error: `Effective date "${eff}" must be YYYY-MM-DD` };
    out.effective_date = eff || null;
  } else if (cur?.effective_date !== undefined) out.effective_date = cur.effective_date;
  return out;
}

/** S1.9: a row for an ID that is not one of the 110 creates or updates an organisation-defined requirement. */
function planCustom(line: number, controlId: string, get: Get, existing: Map<string, ItemView<CustomRequirement>>): ImportLine {
  const view = existing.get(controlId);
  const cur = view?.draft?.data ?? view?.current ?? null;
  const title = get('title') ?? cur?.title;
  if (!title) return { line, controlId, status: 'error', message: 'Not one of the 110. To add an organisation-defined requirement, fill the title column' };
  if (!CUSTOM_ID.test(controlId)) return { line, controlId, status: 'error', message: 'ID must be 2–30 capital letters, digits, dots or dashes' };
  const family = (get('family') ?? cur?.family ?? '').toUpperCase();
  if (!FAMILY_CODES.includes(family)) return { line, controlId, status: 'error', message: `Family "${family}" must be one of the 14 codes (AC, AT, AU …)` };
  const priority = (get('priority') ?? cur?.priority ?? '').toLowerCase();
  if (!['high', 'medium', 'low'].includes(priority)) return { line, controlId, status: 'error', message: 'Priority must be High, Medium or Low' };
  const description = get('description') ?? cur?.description ?? '';
  if (title.length < 3 || title.length > 200) return { line, controlId, status: 'error', message: 'Title must be 3–200 characters' };
  if (description.length < 3 || description.length > 2000) return { line, controlId, status: 'error', message: 'Description must be 3–2000 characters' };
  const mods = get('modules');
  const modules = mods === undefined ? cur?.modules ?? [] : mods.split(/[;|]/).map((m) => m.trim().toLowerCase()).filter(Boolean);
  const bad = modules.filter((m) => !MODULES.includes(m as ModuleId));
  if (bad.length) return { line, controlId, status: 'error', message: `Unknown module "${bad[0]}"` };
  const extras = readExtras(get, cur);
  if ('error' in extras) return { line, controlId, status: 'error', message: extras.error };
  const data: CustomRequirement = {
    ...(cur ?? {}),
    control_id: controlId,
    title,
    family,
    priority: priority as CustomRequirement['priority'],
    description,
    source_standard: get('source_standard') || cur?.source_standard || 'Organization-defined',
    source_section: get('source_section') ?? cur?.source_section ?? '',
    modules: [...new Set(modules)] as ModuleId[],
    implementation_guidance: get('implementation_guidance') ?? cur?.implementation_guidance ?? '',
    ...extras,
  };
  if (cur && JSON.stringify(normalise(cur)) === JSON.stringify(normalise(data))) return { line, controlId, status: 'unchanged' };
  return { line, controlId, status: 'change', kind: 'custom_requirement', data, isNew: !view };
}

/** S1.9: the bulk-import template, with one example of each kind of row. */
export function requirementTemplateCsv(): string {
  return (
    [
      TEMPLATE_HEADER.join(','),
      ['AC.L1-3.1.1', '', '', 'High', '', '', '', 'muster;adminops', 'Enforce MFA for all users', 'MFA report shows every account enrolled', 'Active', ''].map(cell).join(','),
      ['ORG-PE-01', 'Visitor access log', 'PE', 'Medium', 'Keep a log of visitors to areas where CUI is handled.', 'Organization-defined', '', 'evidenceops', '', 'Log reviewed monthly', 'Active', '2026-11-01'].map(cell).join(','),
    ].join('\r\n') + '\r\n'
  );
}

export function downloadRequirementTemplate() {
  const blob = new Blob([requirementTemplateCsv()], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ces-requirements-import-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function exportRequirementsCsv(rows: readonly RequirementRow[], metaOf: (id: string) => RequirementMeta | null) {
  const blob = new Blob([requirementsCsv(rows, metaOf)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ces-110-requirements-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
