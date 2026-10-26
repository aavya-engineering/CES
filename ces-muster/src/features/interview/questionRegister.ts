// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// MG-28 — the question register.
//
// Every question Muster can put to a person is listed here with: the output
// field(s) its answer feeds, the derivation sources tried before asking, and
// why it cannot (yet) be derived. Shift-package rule D4: no fixed question
// count, but every remaining question is justified. A question node or
// Situation-tab input with no row here fails CI (questionRegister.test.ts).
//
// Rows for graph nodes take `feeds` from the node itself (plan_input.field, or
// the readiness requirements it scores), so the register cannot drift from the
// graph. Situation-tab inputs are not graph nodes; their rows are explicit and
// carry an `anchor` (a code token in AssessmentPage.tsx) that the test checks.
//
// Adding a question: add the node (or input), then a row here. Removing one:
// delete its row. Regenerate docs/question-register.md with
// `npm run register:generate`.

import { QUESTION_GRAPH, type QuestionNode } from './questionGraph';

/** Where a question lives. */
export type QuestionSource =
  | 'readiness'
  | 'boundary'
  | 'si'
  | 'tcp'
  | 'provisioning'
  | 'situation';

/** What Muster tries before it asks. */
export type DerivationSource = 'discovery' | 'inference' | 'si-derivation' | 'archetype' | 'default';

/**
 * Why the question is still asked.
 * - intent: a customer decision or goal; not observable anywhere.
 * - not-in-tenant: a fact that exists, but outside the Microsoft tenant.
 * - human-attestation: must be supplied or confirmed by a named person (secrets,
 *   approver identity, CUI boundary confirmation — MU-FR-07, MU-FR-12).
 * - operator-session: metadata about how this assessment session is run.
 * - derived-fallback: already derived when its sources speak; asked only when
 *   they are silent.
 * - candidate: could be derived from the tenant; `candidate` names the
 *   backlog item that will remove or reduce it.
 */
export type RegisterReason =
  | 'intent'
  | 'not-in-tenant'
  | 'human-attestation'
  | 'operator-session'
  | 'derived-fallback'
  | 'candidate';

export interface RegisterRow {
  id: string;
  source: QuestionSource;
  text: string;
  feeds: string[];
  tried: DerivationSource[];
  reason: RegisterReason;
  /** Backlog item that would remove or reduce the question (e.g. 'MG-13'). */
  candidate?: string;
  note: string;
  /** Situation inputs only: a code token that must appear in AssessmentPage.tsx. */
  anchor?: string;
}

type Entry = Pick<RegisterRow, 'tried' | 'reason' | 'candidate' | 'note'>;

const RR_ENTRY: Entry = {
  tried: ['discovery', 'archetype'],
  reason: 'derived-fallback',
  candidate: 'MG-02',
  note:
    'Pruned when a non-unknown discovery fact or archetype default covers its mapped requirements; asked otherwise. ' +
    'MG-02 adds expected-value predicates so a covering read means compliant, and MG-07 replaces the 25 static ' +
    'nodes with the 165 filtered activities.',
};

const BOUNDARY_ENTRY: Entry = {
  tried: ['discovery', 'inference'],
  reason: 'human-attestation',
  note:
    'Discovery only drafts the CUI boundary (boundaryInference); a named person must confirm it (MU-FR-07). ' +
    'Feeds TM boundary_zones and MP boundary_context once MG-08 builds cui_boundary_output.',
};

const MG13: Pick<Entry, 'reason' | 'candidate'> = { reason: 'candidate', candidate: 'MG-13' };
const MG14: Pick<Entry, 'reason' | 'candidate'> = { reason: 'candidate', candidate: 'MG-14' };

/** One entry per graph node id. Feeds come from the node. */
export const GRAPH_ENTRIES: Record<string, Entry> = {
  // ── Readiness (RR) nodes ────────────────────────────────────────────────
  'iam-001': RR_ENTRY, 'iam-002': RR_ENTRY, 'iam-003': RR_ENTRY, 'iam-004': RR_ENTRY, 'iam-005': RR_ENTRY,
  'ep-001': RR_ENTRY, 'ep-002': RR_ENTRY, 'ep-003': RR_ENTRY, 'ep-004': RR_ENTRY,
  'pol-001': RR_ENTRY, 'pol-002': RR_ENTRY, 'pol-003': RR_ENTRY, 'pol-004': RR_ENTRY,
  'mon-001': RR_ENTRY, 'mon-002': RR_ENTRY, 'mon-003': RR_ENTRY, 'mon-004': RR_ENTRY,
  'dp-001': RR_ENTRY, 'dp-002': RR_ENTRY, 'dp-003': RR_ENTRY, 'dp-004': RR_ENTRY,
  'ir-001': RR_ENTRY, 'ir-002': RR_ENTRY, 'ir-003': RR_ENTRY, 'ir-004': RR_ENTRY,

  // ── CUI boundary drafts ─────────────────────────────────────────────────
  'bnd-001': BOUNDARY_ENTRY, 'bnd-002': BOUNDARY_ENTRY, 'bnd-003': BOUNDARY_ENTRY,

  // ── SI Baseline plan inputs ─────────────────────────────────────────────
  'G-01': { tried: ['si-derivation'], reason: 'derived-fallback', note: 'Derived by SI_DERIVATIONS when its inputs are present; asked otherwise.' },
  'G-02': { tried: ['si-derivation'], reason: 'derived-fallback', note: 'Derived by SI_DERIVATIONS when its inputs are present; asked otherwise.' },
  'G-03': { tried: [], reason: 'not-in-tenant', note: 'CUI categories are business knowledge; sensitivity labels could hint at them but cannot establish them.' },
  'G-04': { tried: [], reason: 'not-in-tenant', note: 'ITAR/EAR/privacy constraints are contractual, not tenant state.' },
  'G-05': { tried: [], reason: 'intent', note: 'Self-assessment vs certification is a customer decision.' },
  'G-06': { tried: [], reason: 'intent', note: 'Certification timing goal is a customer goal.' },
  'G-07': { tried: ['default'], reason: 'candidate', candidate: 'MG-08', note: 'Boundary strategy can follow from the confirmed CUI boundary once MG-08 builds cui_boundary_output.' },
  'G-08': { tried: ['si-derivation'], reason: 'derived-fallback', note: 'Derived by SI_DERIVATIONS when its inputs are present; asked otherwise.' },
  'S-11': { tried: ['default'], ...MG13, note: 'Current licensed users are discoverable; the target-state estimate may still need confirmation.' },
  'S-12': { tried: [], reason: 'intent', note: 'Intended collaboration mode is a target-state choice.' },
  'S-13': { tried: ['si-derivation'], reason: 'derived-fallback', note: 'Derived by SI_DERIVATIONS when its inputs are present; asked otherwise.' },
  'S-16': { tried: [], reason: 'intent', note: 'Evidence posture target is a customer goal.' },
  'S-20': { tried: ['si-derivation'], reason: 'derived-fallback', note: 'Derived from selected stacks / cloud environment; asked otherwise.' },
  'S-24': { tried: [], reason: 'intent', note: 'POA&M policy posture is a customer decision.' },
  'S-25': { tried: ['default'], ...MG13, note: 'Mobile device presence is observable from Intune enrollment.' },
  'S-26': { tried: [], reason: 'not-in-tenant', note: 'Wireless networks are not Microsoft 365 tenant state.' },
  'S-27': { tried: ['default'], ...MG13, note: 'Removable-media posture is observable from Intune device configuration.' },
  'S-28': { tried: ['default'], ...MG13, note: 'Remote-access posture is observable from Conditional Access.' },
  'S-29': { tried: ['default'], ...MG13, note: 'Nonlocal maintenance posture is partly observable from CA / device configuration.' },
  'S-30': { tried: ['default'], ...MG14, note: 'CUI-to-endpoint posture is partly observable from CA session controls and app protection.' },
  'SIT-020': { tried: ['si-derivation'], reason: 'derived-fallback', candidate: 'MG-05', note: 'Derived today, but defaults to m365_azure for any cloud stack; MG-05 infers it from Azure/Sentinel discovery.' },
  'SIT-021': { tried: ['si-derivation'], reason: 'derived-fallback', candidate: 'MG-13', note: 'Derived when stacks name a tier; MG-13 reads licence SKUs.' },
  'SIT-022': { tried: ['default'], ...MG13, note: 'Licensed user count is observable from the tenant.' },
  'SIT-023': { tried: [], reason: 'not-in-tenant', note: 'FedRAMP package IDs belong to the CSP, not the tenant.' },
  'SIT-024': { tried: [], reason: 'not-in-tenant', note: 'Physical facility count is not tenant state.' },
  'SIT-025': { tried: [], reason: 'not-in-tenant', note: 'Customer-owned equipment count is not tenant state.' },

  // ── TCP plan inputs ─────────────────────────────────────────────────────
  'TCP.TI.004': { tried: ['si-derivation', 'default'], ...MG14, note: 'Cloud environment is observable from the tenant (MG-14).' },
  'TCP.LIC.001': { tried: ['default'], ...MG14, note: 'Primary SKU is observable from subscribed SKUs.' },
  'TCP.IA.004': { tried: ['default'], ...MG14, note: 'Identity provider is observable from domain federation settings.' },
  'TCP.IA.005': { tried: ['default'], ...MG14, note: 'Directory sync is observable from the organization object.' },
  'TCP.PA.004': { tried: ['default'], ...MG14, note: 'PIM use is observable from role-management settings.' },
  'TCP.GA.004': { tried: ['default'], ...MG14, note: 'Group strategy is partly observable from group inventory.' },
  'TCP.DM.001': { tried: ['default'], ...MG14, note: 'Enrollment type is observable from Intune enrollment configuration.' },

  // ── Stamper provisioning inputs ─────────────────────────────────────────
  'TCP.MU.001': { tried: [], reason: 'human-attestation', note: 'Approver identity is named by the customer (MU-FR-12).' },
  'TCP.MU.002': { tried: [], reason: 'human-attestation', note: 'Terms-of-use file is supplied by the customer (MU-FR-12).' },
  'TCP.MU.003': { tried: [], reason: 'human-attestation', note: 'Initial-password policy is a secret reference; never discovered (MU-FR-12).' },
};

/** Situation-tab inputs (AssessmentPage, profile tab). Not graph nodes. */
export const SITUATION_ROWS: RegisterRow[] = [
  { id: 'situation.engagement_kind', source: 'situation', anchor: "'engagement_kind'", text: 'Assessment type (single contractor or prime with subcontractors)', feeds: ['engagement.engagement_kind'], tried: [], reason: 'intent', note: 'Decides roll-up eligibility; an engagement choice.' },
  { id: 'situation.org_name', source: 'situation', anchor: 'setOrgName(', text: 'Organization name', feeds: ['party.name', 'tenant_config_profile tenant identity (tcpAdapter orgName)'], tried: [], reason: 'candidate', candidate: 'MG-16', note: 'Graph /organization returns the display name (MG-16 org metadata).' },
  { id: 'situation.uei', source: 'situation', anchor: 'setUei(', text: 'Unique Entity ID (UEI)', feeds: ['party.uei', 'contracts.party_uei'], tried: [], reason: 'not-in-tenant', note: 'SAM.gov identifier; not tenant state.' },
  { id: 'situation.cage', source: 'situation', anchor: 'setCage(', text: 'CAGE code', feeds: ['party.cage', 'contracts.party_cage'], tried: [], reason: 'not-in-tenant', note: 'DLA identifier; not tenant state.' },
  { id: 'situation.covers_m365', source: 'situation', anchor: "radioRow('covers_m365'", text: 'Does this assessment cover M365/cloud services?', feeds: ['status_payload.covers_m365'], tried: [], reason: 'candidate', candidate: 'MG-19', note: 'Feeds the status payload only (no plan artifact). Discovery of a tenant answers it; review with BHD whether it is still needed.' },
  { id: 'situation.on_prem_ot', source: 'situation', anchor: "'on_prem_ot'", text: 'Does CUI touch on-premises servers or OT/manufacturing systems?', feeds: ['declared stacks (question pruning)', 'status_payload.on_prem_ot'], tried: [], reason: 'not-in-tenant', note: 'On-prem/OT systems are invisible to tenant reads; directory sync is only a hint.' },
  { id: 'situation.employee_count', source: 'situation', anchor: 'setEmployeeCount(', text: 'Employee count band', feeds: ['status_payload.employee_count'], tried: [], reason: 'candidate', candidate: 'MG-13', note: 'Feeds the status payload only. Licensed user count is discoverable; review whether this duplicates SIT-022.' },
  { id: 'situation.has_ssp', source: 'situation', anchor: "radioRow('has_ssp'", text: 'Does the organization have a System Security Plan (SSP)?', feeds: ['status_payload.has_ssp'], tried: [], reason: 'not-in-tenant', note: 'Feeds the status payload only; a document fact outside the tenant.' },
  { id: 'situation.services', source: 'situation', anchor: 'toggleService(', text: 'Which services / stacks are in use?', feeds: ['session.selected_stacks', 'question applicability (applicable_stacks)', 'SI derivations S-20, SIT-020, SIT-021'], tried: [], reason: 'candidate', candidate: 'MG-13', note: 'Service plans and SKUs are discoverable; today the operator ticks them.' },
  { id: 'situation.rm_mode', source: 'situation', anchor: 'data-testid="rm-mode"', text: 'Readiness session kind', feeds: ['readiness_result manifest.mode'], tried: [], reason: 'operator-session', note: 'How this session is run.' },
  { id: 'situation.rm_bhd_name', source: 'situation', anchor: 'data-testid="rm-bhd-name"', text: 'BHD presence (name)', feeds: ['readiness_result manifest'], tried: [], reason: 'operator-session', note: 'Who from BHD attended.' },
  { id: 'situation.rm_auth_tier', source: 'situation', anchor: 'data-testid="rm-auth-tier"', text: 'Auth tier achieved', feeds: ['readiness_result manifest.auth_tier'], tried: [], reason: 'operator-session', note: 'Could be set from the discovery/consent outcome (MG-19); recorded by hand today.' },
  { id: 'situation.rm_tenant_slug', source: 'situation', anchor: 'data-testid="rm-tenant-slug"', text: 'Tenant slug', feeds: ['readiness_result manifest.tenant_slug', 'tenant_config_profile tenant identity', 'plan push target (planCompileService)'], tried: [], reason: 'operator-session', note: 'Typed by hand and not checked against the ces-tenant registry; see architecture change C-05.' },
  { id: 'situation.rm_tenant_kind', source: 'situation', anchor: 'data-testid="rm-tenant-kind"', text: 'Tenant kind (live / simulated)', feeds: ['readiness_result manifest.tenant_kind'], tried: [], reason: 'operator-session', note: 'Belongs to the registered tenant record (TN-FR-01); typed by hand today.' },
  { id: 'situation.rm_operator_name', source: 'situation', anchor: 'data-testid="rm-operator-name"', text: 'Operator name', feeds: ['readiness_result manifest'], tried: [], reason: 'operator-session', note: 'Should come from the signed-in user once sign-in moves to the app level.' },
  { id: 'situation.rm_operator_role', source: 'situation', anchor: 'data-testid="rm-operator-role"', text: 'Operator role', feeds: ['readiness_result manifest'], tried: [], reason: 'operator-session', note: 'Should come from the signed-in user role.' },
  { id: 'situation.archetype', source: 'situation', anchor: 'applyArchetype(', text: 'Which of these looks most like your organization? (optional)', feeds: ['archetype defaults (provenance archetype)'], tried: [], reason: 'intent', note: 'Optional prior; real archetype content comes from BHD (MG-21).' },
];

/**
 * Profile-tab controls that are deliberately NOT questions. Listed so the
 * completeness test can tell them apart from unregistered questions.
 */
export const NOT_QUESTIONS: Array<{ anchor: string; why: string }> = [
  { anchor: 'setAdaptiveEnabled(', why: 'Operator toggle for adaptive ordering; captures no customer fact.' },
];

function sourceOf(node: QuestionNode): QuestionSource {
  if (node.cluster === 'boundary') return 'boundary';
  if (node.plan_input?.contract === 'si_baseline') return 'si';
  if (node.plan_input?.contract === 'tenant_config_profile') return 'tcp';
  if (node.plan_input) return 'provisioning';
  return 'readiness';
}

function feedsOf(node: QuestionNode): string[] {
  if (node.plan_input) return [`${node.plan_input.contract}: ${node.plan_input.field}`];
  if (node.cluster === 'boundary') return ['cui_boundary draft (MU-FR-24)'];
  return node.mapped_requirements.map((r) => `readiness posture + SPRS: ${r}`);
}

export interface RegisterBuild {
  rows: RegisterRow[];
  /** Graph node ids with no entry. */
  missing: string[];
  /** Entries whose id is not a graph node. */
  orphans: string[];
}

export function buildQuestionRegister(graph: QuestionNode[] = QUESTION_GRAPH): RegisterBuild {
  const ids = new Set(graph.map((n) => n.id));
  const missing = graph.filter((n) => !GRAPH_ENTRIES[n.id]).map((n) => n.id);
  const orphans = Object.keys(GRAPH_ENTRIES).filter((id) => !ids.has(id));
  const nodeRows: RegisterRow[] = graph
    .filter((n) => GRAPH_ENTRIES[n.id])
    .map((n) => ({ id: n.id, source: sourceOf(n), text: n.text, feeds: feedsOf(n), ...GRAPH_ENTRIES[n.id] }));
  return { rows: [...SITUATION_ROWS, ...nodeRows], missing, orphans };
}

const REASON_LABEL: Record<RegisterReason, string> = {
  intent: 'Customer intent',
  'not-in-tenant': 'Not in tenant',
  'human-attestation': 'Human attestation',
  'operator-session': 'Operator session',
  'derived-fallback': 'Derived; asked as fallback',
  candidate: 'Candidate for derivation',
};

/** Markdown rendering for docs/question-register.md (kept in sync by test). */
export function renderRegisterMarkdown(build: RegisterBuild = buildQuestionRegister()): string {
  const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const count = (pred: (r: RegisterRow) => boolean) => build.rows.filter(pred).length;
  const lines: string[] = [
    '# Muster question register (MG-28)',
    '',
    'Generated from `src/features/interview/questionRegister.ts` by `npm run register:generate`. Do not edit by hand.',
    '',
    `Questions Muster can ask: **${build.rows.length}** (Situation tab ${count((r) => r.source === 'situation')}, ` +
      `graph nodes ${count((r) => r.source !== 'situation')}). Readiness nodes are asked only when discovery or an archetype does not cover them.`,
    '',
    '| Reason | Count |',
    '|---|---|',
    ...(Object.keys(REASON_LABEL) as RegisterReason[]).map((k) => `| ${REASON_LABEL[k]} | ${count((r) => r.reason === k)} |`),
    '',
    '| ID | Source | Question | Feeds | Tried before asking | Reason | Candidate | Note |',
    '|---|---|---|---|---|---|---|---|',
    ...build.rows.map(
      (r) =>
        `| ${r.id} | ${r.source} | ${esc(r.text)} | ${esc(r.feeds.join('; '))} | ${r.tried.join(', ') || '—'} | ` +
        `${REASON_LABEL[r.reason]} | ${r.candidate ?? ''} | ${esc(r.note)} |`
    ),
    '',
  ];
  return lines.join('\n');
}
