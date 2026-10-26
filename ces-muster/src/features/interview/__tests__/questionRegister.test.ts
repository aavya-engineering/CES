// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// MG-28 — CI gate: every question Muster can ask has a register row.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, test } from 'vitest';
import { QUESTION_GRAPH } from '@/features/interview/questionGraph';
import {
  buildQuestionRegister,
  renderRegisterMarkdown,
  NOT_QUESTIONS,
  SITUATION_ROWS,
} from '@/features/interview/questionRegister';
import { SI_DERIVATIONS } from '@/features/plan/siDerivation';

const ROOT = path.resolve(__dirname, '../../../..');
const PAGE = fs.readFileSync(path.join(ROOT, 'src/features/assessment/AssessmentPage.tsx'), 'utf8');
const DOC = path.join(ROOT, 'docs/question-register.md');

/** The profile (Situation) tab's JSX: from its activeTab guard to the next tab guard. */
function profileSection(src: string): string {
  const start = src.indexOf("activeTab === 'profile'");
  expect(start, 'profile tab guard not found in AssessmentPage.tsx').toBeGreaterThan(-1);
  const next = src.indexOf('activeTab ===', start + 10);
  return next === -1 ? src.slice(start) : src.slice(start, next);
}

/**
 * Inputs on the Situation tab, as code tokens:
 *   radioRow('name'  ·  data-testid="rm-*"  ·  setX(e.target…  ·  onChange={() => fn(
 * The readiness-manifest inputs (setRm*) are identified by their data-testid.
 */
function detectedInputs(section: string): string[] {
  const found = new Set<string>();
  for (const m of section.matchAll(/radioRow\(\s*'([a-z_]+)'/g)) found.add(`'${m[1]}'`);
  for (const m of section.matchAll(/data-testid="(rm-[a-z-]+)"/g)) found.add(`data-testid="${m[1]}"`);
  for (const m of section.matchAll(/\b(set[A-Z]\w*)\(e\.target/g)) if (!m[1].startsWith('setRm')) found.add(`${m[1]}(`);
  for (const m of section.matchAll(/onChange=\{\(\) => (\w+)\(/g)) found.add(`${m[1]}(`);
  return [...found];
}

describe('MG-28 question register', () => {
  const build = buildQuestionRegister();

  test('every question-graph node has a register row, and no row is stale', () => {
    expect(build.missing, 'graph nodes with no register row').toEqual([]);
    expect(build.orphans, 'register rows for nodes that no longer exist').toEqual([]);
    expect(build.rows.filter((r) => r.source !== 'situation')).toHaveLength(QUESTION_GRAPH.length);
  });

  test('every Situation-tab input is registered (or explicitly not a question)', () => {
    const anchors = [...SITUATION_ROWS.map((r) => r.anchor!), ...NOT_QUESTIONS.map((n) => n.anchor)];
    const unregistered = detectedInputs(profileSection(PAGE)).filter((tok) => !anchors.some((a) => a.includes(tok) || tok.includes(a)));
    expect(unregistered, 'Situation inputs without a register row').toEqual([]);
  });

  test('every Situation anchor still exists in AssessmentPage.tsx', () => {
    const stale = [...SITUATION_ROWS.map((r) => r.anchor!), ...NOT_QUESTIONS.map((n) => n.anchor)].filter((a) => !PAGE.includes(a));
    expect(stale, 'anchors that no longer match the page').toEqual([]);
  });

  test('every row names an output field, a reason and a note', () => {
    for (const r of build.rows) {
      expect(r.feeds.length, `${r.id} feeds`).toBeGreaterThan(0);
      expect(r.feeds.every((f) => f.trim().length > 0), `${r.id} feeds`).toBe(true);
      expect(r.note.trim().length, `${r.id} note`).toBeGreaterThan(0);
      expect(r.text.trim().length, `${r.id} text`).toBeGreaterThan(0);
      if (r.reason === 'candidate') expect(r.candidate, `${r.id} candidate`).toMatch(/^MG-\d{2}$/);
      if (r.candidate) expect(r.candidate).toMatch(/^MG-\d{2}$/);
    }
    expect(new Set(build.rows.map((r) => r.id)).size, 'duplicate row ids').toBe(build.rows.length);
  });

  test('SI rows marked derived-fallback are exactly the SI questions SI_DERIVATIONS derives', () => {
    const derived = new Set(SI_DERIVATIONS.map((d) => d.questionId));
    const fallback = build.rows.filter((r) => r.source === 'si' && r.reason === 'derived-fallback').map((r) => r.id);
    expect(new Set(fallback)).toEqual(derived);
  });

  test('plan-input rows feed the field their node sets', () => {
    for (const n of QUESTION_GRAPH.filter((x) => x.plan_input)) {
      const row = build.rows.find((r) => r.id === n.id)!;
      expect(row.feeds[0]).toContain(n.plan_input!.field);
    }
  });

  test('docs/question-register.md is up to date (run npm run register:generate)', () => {
    expect(fs.existsSync(DOC), 'docs/question-register.md is missing').toBe(true);
    expect(fs.readFileSync(DOC, 'utf8')).toBe(renderRegisterMarkdown(build));
  });
});
