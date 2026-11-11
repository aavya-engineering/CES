// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// validate-catalog-rows.ts — check a batch of BHD evidence-catalog rows before
// it is accepted as a release (Mark's "check each batch by script against the
// NIST examine lists", 2026-11-11).
//
//   npx tsx scripts/validate-catalog-rows.ts <rows.json | release.json | rows.csv> [--out report.csv]
//
// JSON: either a full release file ({definitions: [...]}) or an array of rows.
// CSV: header row with the schema's field names; list fields (emx_ids,
// objective_ids, emx_proposed_new) separated by "|" inside the cell.
// Prints a summary and one line per finding (row, id, fix|tidy, code, message,
// suggested fix); --out writes the same as CSV, the shape Mark's review uses.

import fs from 'node:fs';
import { loadCatalog, validateCatalogRows } from '../src/services/evidenceCatalog.js';

const LIST_FIELDS = new Set(['emx_ids', 'objective_ids', 'emx_proposed_new']);
const NUM_FIELDS = new Set(['examine_index']);
const BOOL_FIELDS = new Set(['gcc_high_checked']);

function parseCsv(text: string): Record<string, unknown>[] {
  const lines: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); lines.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); lines.push(row); }
  const [head, ...body] = lines.filter((l) => l.some((x) => x.trim() !== ''));
  return body.map((cells) => Object.fromEntries(head.map((h, i) => {
    const k = h.trim(); const v = (cells[i] ?? '').trim();
    if (LIST_FIELDS.has(k)) return [k, v ? v.split('|').map((x) => x.trim()).filter(Boolean) : []];
    if (NUM_FIELDS.has(k)) return [k, v === '' ? undefined : Number(v)];
    if (BOOL_FIELDS.has(k)) return [k, v === '' ? undefined : /^(true|yes|1)$/i.test(v)];
    return [k, v === '' ? undefined : v];
  }).filter(([, v]) => v !== undefined)));
}

function main(): number {
  const file = process.argv[2];
  const outIdx = process.argv.indexOf('--out');
  const out = outIdx > 0 ? process.argv[outIdx + 1] : null;
  if (!file) { console.error('usage: npx tsx scripts/validate-catalog-rows.ts <rows.json|release.json|rows.csv> [--out report.csv]'); return 2; }
  const text = fs.readFileSync(file, 'utf8');
  let rows: unknown[];
  if (file.toLowerCase().endsWith('.csv')) rows = parseCsv(text);
  else { const j = JSON.parse(text); rows = Array.isArray(j) ? j : (j.definitions ?? []); }
  const cat = loadCatalog();
  const r = validateCatalogRows(rows, cat);
  const fix = r.findings.filter((f) => f.severity === 'fix').length, tidy = r.findings.length - fix;
  console.log(`${file}: ${r.total} rows — ${r.ok} clean, ${r.total - r.ok} need a fix (${fix} fix, ${tidy} tidy findings). Catalog releases loaded: ${cat.releases.length}, NIST lists: ${cat.examine.size}.`);
  for (const f of r.findings) console.log(`  row ${f.row}\t${f.definition_id ?? '-'}\t${f.severity}\t${f.code}\t${f.message}${f.suggested_fix ? `\t→ ${f.suggested_fix}` : ''}`);
  if (out) {
    const esc = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    fs.writeFileSync(out, ['row,definition_id,severity,code,message,suggested_fix', ...r.findings.map((f) => [f.row, f.definition_id, f.severity, f.code, f.message, f.suggested_fix].map(esc).join(','))].join('\n') + '\n');
    console.log(`report written to ${out}`);
  }
  return fix ? 1 : 0;
}
process.exit(main());
