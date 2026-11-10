// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// runCaptures.ts — turn an engine run's raw captures into Collect-Evidence
// items (2026-11-10). Shared by discovery runs today and by Stamper /
// AdminOps runner results later (`source = stamper | adminops`).
//
// Rules kept from the BHD engine: raw output is never inlined into an
// observation — it lives in a capture file, so the evidence item carries the
// capture content + SHA-256 and the observation keeps only the pointer.
// Captures are classified `internal` (tenant configuration, not CUI) and start
// as `draft`: a person still submits and a different person reviews.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { withTenant } from '../lib/prisma.js';
import { audit } from '../lib/audit.js';
import { sha256Of } from './evidenceValidation.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface CaptureObservation { control_id: string; objective_ids?: string[]; ran_entry_ids?: string[]; raw_capture_ref?: string; derived_posture: string; confidence?: string }

export interface CaptureInput {
  actor: { sub: string; role: string; tenant_id: string };
  engagementId: string;
  assessmentRunId: string;
  source: 'discovery' | 'stamper' | 'adminops';
  outDir: string;
  observations: CaptureObservation[];
  label: string;
  /** Captures above this size are recorded by reference (file name + hash) without content. Default 1 MB. */
  maxInlineBytes?: number;
  readFile?: (abs: string) => Buffer | null;
}

export interface CaptureSummary { created: number; skipped_no_ref: number; missing_files: number; item_ids: string[] }

/** A capture already in memory (runner results post them inline). */
export interface BufferCapture { ref: string; content: Buffer; content_type?: string; requirement_ids: string[]; objective_ids?: string[]; entries?: string[]; note?: string }

export interface BufferCaptureInput {
  actor: { sub: string; role: string; tenant_id: string };
  engagementId: string;
  source: 'discovery' | 'stamper' | 'adminops';
  label: string;
  captures: BufferCapture[];
  /** Links: an assessment run (discovery) or a remediation run (stamper / adminops → EvidenceItem.run_id). */
  assessmentRunId?: string;
  remediationRunId?: string;
  maxInlineBytes?: number;
}

const defaultRead = (abs: string): Buffer | null => (existsSync(abs) ? readFileSync(abs) : null);

/** Core: one draft evidence item per capture; SHA-256 always, content inline up to maxInlineBytes. */
export async function createCaptureItems(db: Db, input: BufferCaptureInput): Promise<string[]> {
  const maxInline = input.maxInlineBytes ?? 1024 * 1024;
  const ids: string[] = [];
  for (const c of input.captures) {
    const requirement_ids = [...new Set(c.requirement_ids)].sort();
    const entries = c.entries ?? [];
    const inline = c.content.byteLength <= maxInline;
    const item: { id: string } = await withTenant(input.actor.tenant_id, (t: Db) => t.evidenceItem.create({ data: {
      tenant_id: input.actor.tenant_id, engagement_id: input.engagementId,
      requirement_ids, objective_ids: [...new Set(c.objective_ids ?? [])].sort(), archetype_code: 'configuration_export', form: 'export',
      title: `${entries[0] ?? requirement_ids[0] ?? path.basename(c.ref)} — ${input.source} capture`,
      description: `${input.label}. ${c.note ?? `Capture for ${requirement_ids.join(', ') || 'the run'}.`}`,
      kind: 'config_capture', source: input.source,
      file_name: path.basename(c.ref), content_type: c.content_type ?? 'text/plain', size_bytes: c.content.byteLength,
      sha256: sha256Of(c.content), content: inline ? c.content : null,
      metadata: { assessment_run_id: input.assessmentRunId ?? null, remediation_run_id: input.remediationRunId ?? null, capture_ref: c.ref, ran_entry_ids: entries, inline },
      run_id: input.remediationRunId ?? null,
      collected_at: new Date(), classification: 'internal', status: 'draft', version: 1, created_by: input.actor.sub,
    } }), db);
    ids.push(item.id);
  }
  if (ids.length) await audit(db, { action: 'evidence.capture', actor: input.actor, target_type: input.remediationRunId ? 'remediation_run' : 'assessment_run', target_id: input.remediationRunId ?? input.assessmentRunId ?? input.engagementId, tenant_id: input.actor.tenant_id, detail: { engagement_id: input.engagementId, source: input.source, created: ids.length } });
  return ids;
}

/** Discovery path: observations point at capture files under the run folder; the same file referenced by several observations is written once. */
export async function captureRunEvidence(db: Db, input: CaptureInput): Promise<CaptureSummary> {
  const read = input.readFile ?? defaultRead;
  const byRef = new Map<string, CaptureObservation[]>();
  let skipped = 0;
  for (const o of input.observations) {
    if (!o.raw_capture_ref) { skipped += 1; continue; }
    byRef.set(o.raw_capture_ref, [...(byRef.get(o.raw_capture_ref) ?? []), o]);
  }
  let missing = 0;
  const root = path.resolve(input.outDir);
  const captures: BufferCapture[] = [];
  for (const [ref, obs] of byRef) {
    const abs = path.resolve(root, ref);
    if (!abs.startsWith(root + path.sep)) { missing += 1; continue; } // a capture ref never escapes the run folder
    const buf = read(abs);
    if (!buf) { missing += 1; continue; }
    captures.push({ ref, content: buf, requirement_ids: obs.map((o) => o.control_id), objective_ids: obs.flatMap((o) => o.objective_ids ?? []), entries: [...new Set(obs.flatMap((o) => o.ran_entry_ids ?? []))], note: `Read-only capture for ${[...new Set(obs.map((o) => o.control_id))].sort().join(', ')}; posture ${[...new Set(obs.map((o) => o.derived_posture))].join('/')}.` });
  }
  const ids = await createCaptureItems(db, { actor: input.actor, engagementId: input.engagementId, source: input.source, label: input.label, captures, assessmentRunId: input.assessmentRunId, maxInlineBytes: input.maxInlineBytes });
  return { created: ids.length, skipped_no_ref: skipped, missing_files: missing, item_ids: ids };
}
