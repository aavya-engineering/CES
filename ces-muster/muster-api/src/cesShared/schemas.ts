// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// schemas.ts — S1.1 (doc 26): the four kinds of governed CES-Shared content and
// the shape of each. Every draft is validated here before it is stored.
//
// Not editable anywhere: requirement ID, text, family, level and the DoD SPRS
// weight (doc 26 D2). requirement_meta holds only Aavya/BHD-added metadata.
import { z } from 'zod';

export const KINDS = ['requirement_meta', 'archetype', 'mapping', 'rule', 'custom_requirement'] as const;
export type Kind = (typeof KINDS)[number];

export const MODULES = ['muster', 'stamper', 'adminops', 'evidenceops'] as const;
export const METHODS = ['examine', 'interview', 'test'] as const;
export const STRENGTHS = ['weak', 'adequate', 'strong'] as const;
/** BHD decision b: the four CES control states; no needs_review. */
export const OUTCOMES = ['met', 'not_met', 'partial', 'not_assessed'] as const;

const text = (max: number) => z.string().trim().max(max);
const CONTROL_ID = /^[A-Z]{2}\.L[12]-3\.\d{1,2}\.\d{1,2}$/;
/** BHD P2-13: archetype codes are upper case. */
const ARCHETYPE_CODE = /^EMX-[A-Z0-9]+-\d{3}$/;
const RULE_CODE = /^EVR-[A-Z0-9][A-Z0-9.-]{1,40}$/;

/** S1.9: a requirement this item may point at — one of the 110, or an organisation-defined one. */
const ANY_REQ_ID = /^[A-Z][A-Z0-9.-]{1,29}$/;
const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** S1.9 (Create Requirement mockup): fields both kinds of requirement can carry. All optional, so older drafts stay valid. */
const requirementExtras = {
  assessment_criteria: text(1000).optional(),
  related: z.array(z.string().regex(ANY_REQ_ID)).max(20).optional(),
  dependent: z.array(z.string().regex(ANY_REQ_ID)).max(20).optional(),
  references: z.array(z.string().trim().url().max(500).refine((u) => /^https?:\/\//.test(u), 'Use an http(s) link')).max(10).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  effective_date: ISO_DATE.nullable().optional(),
};

export const requirementMetaSchema = z
  .object({
    control_id: z.string().regex(CONTROL_ID),
    priority: z.enum(['high', 'medium', 'low']).nullable(),
    modules: z.array(z.enum(MODULES)).max(4),
    implementation_guidance: text(1000),
    ...requirementExtras,
  })
  .strict();

/**
 * S1.9: an organisation-defined requirement (not one of the 110). It has no
 * SPRS weight and never changes the SPRS score. Its ID must not be one of
 * the 110 (checked in the service).
 */
export const customRequirementSchema = z
  .object({
    control_id: z.string().trim().regex(ANY_REQ_ID, 'Use letters, digits, dots and dashes, starting with a letter (e.g. ORG-AC-01)'),
    title: text(200).min(3),
    family: z.string().regex(/^[A-Z]{2}$/),
    priority: z.enum(['high', 'medium', 'low']),
    description: text(2000).min(3),
    source_standard: text(120).min(1),
    source_section: text(40),
    modules: z.array(z.enum(MODULES)).max(4),
    implementation_guidance: text(1000),
    ...requirementExtras,
  })
  .strict();

export const archetypeSchema = z
  .object({
    code: z.string().regex(ARCHETYPE_CODE, 'Use EMX-<DOMAIN>-<3 digits>, upper case'),
    name: text(160).min(3),
    domain: z.string().regex(/^[A-Z][A-Z_]{1,30}$/),
    description: text(2000).min(3),
    assessor_methods: z.array(z.enum(METHODS)).min(1).max(3),
    acceptable_forms: z.array(text(200).min(1)).max(20),
    collection_notes: text(2000),
    retention_notes_template: text(2000),
  })
  .strict();

export const mappingSchema = z
  .object({
    control_id: z.string().regex(CONTROL_ID),
    archetype_code: z.string().regex(ARCHETYPE_CODE),
    mapping_type: z.enum(['required', 'recommended']),
    expected_strength: z.enum(STRENGTHS).nullable(),
    assessor_methods: z.array(z.enum(METHODS)).max(3),
    rationale: text(2000),
    truth_tag: z.enum(['FACT', 'INFERENCE', 'OPEN_QUESTION']).nullable(),
    anti_patterns: z.array(text(300).min(1)).max(20),
  })
  .strict();

/**
 * Rule logic is DATA from a fixed vocabulary, never code (BHD decision a):
 * the signals to read (same shape as control-signal-registry.json), the evaluator that
 * EvidenceOps runs, and simple evidence conditions. Nothing here executes.
 */
export const ruleSchema = z
  .object({
    code: z.string().regex(RULE_CODE, 'Use EVR-<domain>-<seq>'),
    name: text(160).min(3),
    rule_type: z.enum(['signal_check', 'evidence_presence', 'evidence_attribute', 'document_review']),
    cmmc_level: z.union([z.literal(1), z.literal(2)]),
    category: text(80),
    description: text(2000).min(3),
    tags: z.array(text(40).min(1)).max(20),
    effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    effective_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    logic: z
      .object({
        evaluator: text(80).nullable(),
        signals: z
          .array(
            z
              .object({
                type: text(40).min(1),
                endpoint: text(300).min(1).optional(),
                required: z.boolean().optional(),
                filter: text(300).optional(),
                variables: z.array(text(80).min(1)).max(20).optional(),
              })
              .strict()
          )
          .max(20),
        conditions: z
          .array(
            z
              .object({
                check: z.enum(['evidence_present', 'evidence_current_within_days', 'attribute_present', 'approved_by_owner']),
                value: text(200),
              })
              .strict()
          )
          .max(20),
        operator: z.enum(['AND', 'OR']),
      })
      .strict(),
    applies_to: z
      .object({
        requirements: z.array(z.string().regex(CONTROL_ID)).max(110),
        archetypes: z.array(z.string().regex(ARCHETYPE_CODE)).max(50),
      })
      .strict(),
    output: z
      .object({
        outcomes: z.array(z.enum(OUTCOMES)).min(1),
        evidence_strength: z.array(z.enum(STRENGTHS)).max(3),
        message: text(500),
      })
      .strict(),
  })
  .strict()
  .refine((r) => !r.effective_from || !r.effective_to || r.effective_from <= r.effective_to, {
    message: 'effective_to is before effective_from',
    path: ['effective_to'],
  });

export const SCHEMAS = {
  requirement_meta: requirementMetaSchema,
  archetype: archetypeSchema,
  mapping: mappingSchema,
  rule: ruleSchema,
  custom_requirement: customRequirementSchema,
} as const;

export type ItemData = {
  requirement_meta: z.infer<typeof requirementMetaSchema>;
  archetype: z.infer<typeof archetypeSchema>;
  mapping: z.infer<typeof mappingSchema>;
  rule: z.infer<typeof ruleSchema>;
  custom_requirement: z.infer<typeof customRequirementSchema>;
};

/** The stable key of an item, derived from its data (never sent separately). */
export function keyOf(kind: Kind, data: Record<string, unknown>): string {
  switch (kind) {
    case 'requirement_meta':
    case 'custom_requirement':
      return String(data.control_id);
    case 'archetype':
    case 'rule':
      return String(data.code);
    case 'mapping':
      return `${data.control_id}::${data.archetype_code}`;
  }
}

export function isKind(v: unknown): v is Kind {
  return typeof v === 'string' && (KINDS as readonly string[]).includes(v);
}
