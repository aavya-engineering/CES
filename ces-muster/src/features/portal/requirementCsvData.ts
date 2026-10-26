// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// requirementCsvData.ts — S1.2: CSV for the 110 Requirements page.
// Export: the rows on screen with their metadata. Import: priority, modules and
// guidance only (locked fields are ignored), validated and previewed before
// any draft is written.
import type { ItemView, ModuleId, RequirementMeta } from '@/shared/api/sharedApi';
import type { RequirementRow } from './referenceData';
import { nistOf } from './requirementMetaData';

const MODULES: ModuleId[] = ['muster', 'stamper', 'adminops', 'evidenceops'];
export const CSV_HEADER = ['control_id', 'nist_ref', 'family', 'level', 'type', 'sprs_weight', 'priority', 'modules', 'implementation_guidance', 'practice'];

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
  | { line: number; controlId: string; status: 'change'; data: RequirementMeta; isNew: boolean }
  | { line: number; controlId: string; status: 'unchanged' }
  | { line: number; controlId: string; status: 'error'; message: string };

/** Validates an import against the 110 requirements and the current metadata. */
export function planImport(text: string, known: Set<string>, existing: Map<string, ItemView<RequirementMeta>>): { lines: ImportLine[]; headerError: string | null } {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''));
  if (!rows.length) return { lines: [], headerError: 'The file is empty.' };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (n: string) => head.indexOf(n);
  if (col('control_id') < 0) return { lines: [], headerError: 'The first row must name the columns and include control_id.' };
  const seen = new Set<string>();
  const lines: ImportLine[] = rows.slice(1).map((r, i) => {
    const line = i + 2;
    const get = (n: string) => (col(n) >= 0 ? (r[col(n)] ?? '').trim() : undefined);
    const controlId = get('control_id') ?? '';
    if (!known.has(controlId)) return { line, controlId, status: 'error', message: 'Unknown requirement ID' };
    if (seen.has(controlId)) return { line, controlId, status: 'error', message: 'Listed twice' };
    seen.add(controlId);
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
    const data: RequirementMeta = { control_id: controlId, priority: priority as RequirementMeta['priority'], modules: [...new Set(modules)] as ModuleId[], implementation_guidance: guidance };
    const same = cur && cur.priority === data.priority && cur.implementation_guidance === data.implementation_guidance && JSON.stringify([...cur.modules].sort()) === JSON.stringify([...data.modules].sort());
    if (same || (!cur && !data.priority && !data.modules.length && !data.implementation_guidance)) return { line, controlId, status: 'unchanged' };
    return { line, controlId, status: 'change', data, isNew: !view };
  });
  return { lines, headerError: null };
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
