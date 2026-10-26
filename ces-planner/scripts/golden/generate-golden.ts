// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MONO-2026A
// See LICENSE and TERMS.md.

/**
 * MG-04 — headless Planner golden generator (feasibility spike).
 *
 * Runs the Planner chain without a browser, from a scrubbed fixture input:
 *   SI answers → SI Baseline → RR Question Set → RR answers → Readiness Posture
 *   → (TCP answers → Tenant Config Profile) → Gap Set → Task Catalog
 *   → Mission Plan + Tenant Manifest (+ Infrastructure Manifest when TCP present)
 *   → cross-artifact validation (Planner) and the ces-shared contract (what muster-api
 *     and Stamper enforce).
 *
 * The call order and arguments mirror src/features/mpt/hooks/useMissionPlanGenerator.ts
 * (the only orchestration Planner has). Goldens are written as canonical JSON so a
 * re-run on the same input is byte-identical.
 *
 * Usage (from ces-planner/):
 *   npx tsx scripts/golden/generate-golden.ts <fixture-dir>            # write goldens
 *   npx tsx scripts/golden/generate-golden.ts <fixture-dir> --check    # exit 1 on any diff
 *
 * Not yet covered (see scripts/golden/README.md): CUI boundary, BTC confirmation,
 * policy inputs / policy documents, proposal (pricing — MS-01), reports.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, installDeterminism } from './lib/determinism';

interface FixtureInput {
  fixture_id: string;
  intent: string;
  clock: string;
  seed: number;
  ces_id: string;
  plan_mode: 'build_new' | 'harden_existing' | 'migrate' | 'hybrid';
  si_answers: Record<string, unknown>;
  rr: {
    /** Answer used for every RR question not matched below. */
    default: string;
    /** By practice family prefix of the question's first mapped requirement, e.g. "AC", "IA". */
    by_family?: Record<string, string>;
    /** By RR question id — wins over by_family. */
    by_question?: Record<string, string>;
  };
  /** TCP answers by question id; omit or null for "no tenant config profile". */
  tcp_answers?: Record<string, unknown> | null;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const PLANNER_ROOT = resolve(HERE, '..', '..');
const DATA_DIR = join(PLANNER_ROOT, 'public', 'data');

function parseArgs(argv: string[]) {
  const positional = argv.filter((a) => !a.startsWith('--'));
  if (positional.length !== 1) {
    console.error('usage: generate-golden.ts <fixture-dir> [--check] [--verbose]');
    process.exit(2);
  }
  return {
    fixtureDir: resolve(positional[0]),
    check: argv.includes('--check'),
    verbose: argv.includes('--verbose'),
  };
}

/**
 * KNOWN PLANNER DEFECT (reported to BHD as PL-01; not fixed here).
 * generateSIBaseline (src/features/sit/services/baselineGenerator.ts, `dependencies`
 * block) builds dependencies from a fixed field list and drops SIT-020
 * infrastructure_model, SIT-021 license_tier and SIT-022 user_count, although the
 * SI bank maps them there and gap/task/manifest/plan generators read them. Every
 * consumer then falls back to its own default (m365_azure in four places,
 * m365_sentinel in infraManifestGenerator), so the answer has no effect in Planner.
 * Muster already carries the three answers through after the same call
 * (ces-muster src/features/plan/siBaselineAdapter.ts, buildSiBaselineFromAnswers).
 * The golden must reflect the intended reference, so the harness applies the same
 * carry. Remove this once Planner's generator emits the fields.
 */
function carryDroppedDependencies(siBaseline: unknown, raw: Record<string, unknown>): void {
  const deps = (siBaseline as { si_baseline?: { dependencies?: Record<string, unknown> } })
    ?.si_baseline?.dependencies;
  if (!deps) return;
  const infra = raw['SIT-020'];
  if (typeof infra === 'string' && infra && deps.infrastructure_model === undefined) {
    deps.infrastructure_model = infra;
  }
  const tier = raw['SIT-021'];
  if (typeof tier === 'string' && tier && deps.license_tier === undefined) {
    deps.license_tier = tier;
  }
  const users = raw['SIT-022'];
  if (typeof users === 'number' && Number.isFinite(users) && deps.user_count === undefined) {
    deps.user_count = users;
  }
}

function familyOf(requirementId: string | undefined): string | undefined {
  // Requirement ids look like "AC.L2-3.1.1"; the family is the part before the first dot.
  return requirementId?.split('.')[0];
}

async function main() {
  const { fixtureDir, check, verbose } = parseArgs(process.argv.slice(2));
  const input = JSON.parse(readFileSync(join(fixtureDir, 'input.json'), 'utf8')) as FixtureInput;

  // 1. Pin clock + PRNG before any Planner module loads.
  installDeterminism(input.clock, input.seed);
  const realLog = console.log;
  if (!verbose) console.log = () => {};

  // 2. Import Planner services only now.
  const { loadPlanBanks } = await import('./lib/loadBanks');
  const { generateSIBaseline } = await import('../../src/features/sit/services/baselineGenerator');
  const { generateRRQuestionSet } = await import('../../src/features/sit/services/questionSetGenerator');
  const { generateReadinessPosture } = await import('../../src/features/rrt/services/postureGenerator');
  const { generateTenantConfigProfile } = await import('../../src/features/tcp/services/tcpProfileGenerator');
  const { compileGapSet } = await import('../../src/features/mpt/services/gapCompiler');
  const { compileTaskCatalog } = await import('../../src/features/mpt/services/taskCompiler');
  const { generateInfrastructureManifest } = await import('../../src/features/mpt/services/infraManifestGenerator');
  const { generateManualPlan } = await import('../../src/features/mpt/services/manualPlanGenerator');
  const { generateProposal } = await import('../../src/features/mpt/services/proposalGenerator');
  const { generateTenantManifest } = await import('../../src/features/mpt/services/manifestGenerator');
  const { validateArtifactAlignment } = await import('../../src/features/mpt/services/validator');
  const { buildTechRefIndex } = await import('../../src/shared/services/techRefIndex');
  // The canonical cross-module contract (what muster-api and Stamper's PlanTranslator enforce).
  const { ManualMissionPlanSchema, TenantManifestSchema, InfraManifestSchema } = await import(
    '../../../ces-shared/src/types/mission-plan.contract'
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const banks: any = loadPlanBanks(DATA_DIR);
  const capturedAt = new Date().toISOString();

  // 3. SI Baseline from answers (answer_type taken from the bank, as the SIT wizard does).
  const siQuestions = banks.siQuestionBank?.ces?.question_bank?.questions ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const siAnswers: Record<string, any> = {};
  for (const [qid, raw] of Object.entries(input.si_answers)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = siQuestions.find((x: any) => x.id === qid);
    if (!q) throw new Error(`SI answer for unknown question ${qid}`);
    siAnswers[qid] = {
      question_id: qid,
      answer_type: q.answer?.type,
      raw_answer: raw,
      captured_at: capturedAt,
      provenance_class: 'client_assertion',
    };
  }
  const siBaseline = generateSIBaseline(siAnswers, banks.siQuestionBank, 1, input.ces_id);
  carryDroppedDependencies(siBaseline, input.si_answers);

  // 4. RR Question Set (CUI boundary not yet in fixtures → null, as when none is selected).
  const questionSet = await generateRRQuestionSet(
    siBaseline,
    banks.rrQuestionBank,
    1,
    () => {},
    { cmmcRequirements: banks.cmmcRequirements, assessorKB: banks.assessorKB },
    null,
    input.ces_id,
  );

  // 5. RR answers by rule (see fixture README for intent), then Readiness Posture.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qsAny = questionSet as any;
  const rrQuestions = qsAny?.ces?.questions ?? [];
  if (!Array.isArray(rrQuestions) || rrQuestions.length === 0) {
    throw new Error('RR question set has no questions — cannot build posture');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rrAnswers: Record<string, any> = {};
  for (const q of rrQuestions) {
    const mapped: string[] = q.mapped_requirements ?? [];
    const fam = familyOf(mapped[0]);
    const value =
      input.rr.by_question?.[q.question_id] ??
      (fam ? input.rr.by_family?.[fam] : undefined) ??
      input.rr.default;
    rrAnswers[q.question_id] = {
      question_id: q.question_id,
      answer: value,
      provenance_class: 'client_assertion',
      mapped_requirements: mapped,
      assessor_methods_satisfied: q.assessor_methods ?? [],
      expected_evidence_archetypes: q.expected_evidence_archetypes ?? [],
      evidence_ids: [],
    };
  }
  const posture = generateReadinessPosture(rrAnswers, [], questionSet, siBaseline, undefined, undefined, undefined, input.ces_id);

  // 6. Tenant Config Profile (optional).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tenantConfig: any = null;
  if (input.tcp_answers) {
    const sections = banks.tcpQuestionBank.sections ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allTcp = sections.flatMap((s: any) => s.questions ?? []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tcpAnswers: Record<string, any> = {};
    for (const [qid, raw] of Object.entries(input.tcp_answers)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q = allTcp.find((x: any) => x.id === qid);
      if (!q) throw new Error(`TCP answer for unknown question ${qid}`);
      tcpAnswers[qid] = {
        question_id: qid,
        answer_type: q.answer_type,
        raw_answer: raw,
        captured_at: capturedAt,
        provenance_class: 'client_assertion',
      };
    }
    tenantConfig = generateTenantConfigProfile(tcpAnswers, sections, banks.tcpQuestionBank.schema_version || '1.0');
  }

  // 7. Plan chain — same order and arguments as useMissionPlanGenerator.generate().
  const vendorCapabilities = {
    taxonomy: banks.capabilityTaxonomy,
    patterns: banks.implementationPatterns,
    playbook: banks.vendorPlaybook,
  };
  const { gaps, scopeExclusions, controlDispositions, warnings: scopeWarnings } = compileGapSet(
    siBaseline,
    posture,
    banks.cmmcRequirements || { requirements: [] },
    banks.evidenceMatrix || {},
    vendorCapabilities,
    null,
    null,
    banks.fedRAMPInheritanceTable ?? null,
  );
  const techRefIdx = banks.techRef ? buildTechRefIndex(banks.techRef) : undefined;
  const { tasks, controlDispositions: updatedDispositions } = compileTaskCatalog(
    { gaps, scopeExclusions, controlDispositions },
    siBaseline,
    vendorCapabilities,
    banks.assessorKB || {},
    banks.cmmcRequirements || { requirements: [] },
    banks.evidenceArchetypes,
    techRefIdx,
    null,
    banks.evidenceMatrix || {},
    tenantConfig,
    controlDispositions,
  );
  const taskCatalog = { tasks };
  const infraManifest = tenantConfig ? generateInfrastructureManifest(siBaseline, tenantConfig) : null;
  const missionPlan = generateManualPlan(
    siBaseline,
    posture,
    taskCatalog,
    input.plan_mode,
    banks.assessorKB || {},
    vendorCapabilities,
    null,
    null,
    tenantConfig,
    scopeExclusions,
    updatedDispositions,
    scopeWarnings,
    input.ces_id,
  );
  // The proposal is generated only because validateArtifactAlignment needs it; it is
  // not written as a golden (pricing is out of scope per BHD D1 / MS-01).
  const proposal = generateProposal(siBaseline, input.plan_mode, missionPlan, taskCatalog, null, null, tenantConfig, input.ces_id);
  const tenantManifest = generateTenantManifest(
    siBaseline,
    input.plan_mode,
    taskCatalog,
    banks.assessorKB || {},
    null,
    null,
    tenantConfig,
    input.ces_id,
  );
  const validation = validateArtifactAlignment(missionPlan, proposal, tenantManifest, null, null, tenantConfig);

  console.log = realLog;
  if (!validation.valid) {
    console.error(`[golden] ${input.fixture_id}: Planner alignment validation failed:\n  ${validation.errors.join('\n  ')}`);
    process.exit(1);
  }

  // A golden Stamper would reject is not a usable reference: check the shared contract too.
  const contractIssues: string[] = [];
  const checks: Array<[string, { safeParse: (v: unknown) => { success: boolean; error?: { errors: Array<{ path: (string | number)[]; message: string }> } } }, unknown]> = [
    ['mission-plan.json', ManualMissionPlanSchema, missionPlan],
    ['tenant-manifest.json', TenantManifestSchema, tenantManifest],
  ];
  if (infraManifest) checks.push(['infrastructure-manifest.json', InfraManifestSchema, infraManifest]);
  for (const [name, schema, value] of checks) {
    const r = schema.safeParse(value);
    if (!r.success) {
      for (const e of r.error?.errors ?? []) contractIssues.push(`${name} ${e.path.join('.')}: ${e.message}`);
    }
  }
  if (contractIssues.length > 0) {
    console.error(
      `[golden] ${input.fixture_id}: ${contractIssues.length} ces-shared contract issue(s) — Stamper would reject this plan:\n  ${contractIssues.slice(0, 20).join('\n  ')}`,
    );
    process.exit(1);
  }

  // 8. Write or check goldens.
  const outputs: Record<string, unknown> = {
    'si-baseline.json': siBaseline,
    'readiness-posture.json': posture,
    'mission-plan.json': missionPlan,
    'tenant-manifest.json': tenantManifest,
  };
  if (tenantConfig) outputs['tenant-config-profile.json'] = tenantConfig;
  if (infraManifest) outputs['infrastructure-manifest.json'] = infraManifest;

  const goldenDir = join(fixtureDir, 'golden');
  const summary = {
    fixture_id: input.fixture_id,
    rr_questions: rrQuestions.length,
    gaps: gaps.length,
    tasks: tasks.length,
    files: Object.keys(outputs).sort(),
  };

  if (check) {
    const diffs: string[] = [];
    for (const [name, value] of Object.entries(outputs)) {
      const path = join(goldenDir, name);
      if (!existsSync(path)) {
        diffs.push(`${name}: golden missing`);
        continue;
      }
      // Normalise CRLF in case a Windows checkout converted line endings (see .gitattributes).
      const onDisk = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
      if (onDisk !== canonicalJson(value)) diffs.push(`${name}: differs from golden`);
    }
    // A golden the run no longer produces (e.g. no infrastructure manifest for m365_only) is a diff too.
    if (existsSync(goldenDir)) {
      for (const name of readdirSync(goldenDir)) {
        if (name.endsWith('.json') && !(name in outputs)) diffs.push(`${name}: golden exists but was not produced`);
      }
    }
    if (diffs.length > 0) {
      console.error(`[golden] ${input.fixture_id}: ${diffs.length} file(s) differ\n  ${diffs.join('\n  ')}`);
      process.exit(1);
    }
    console.log(`[golden] ${input.fixture_id}: OK ${JSON.stringify(summary)}`);
    return;
  }

  // Rewrite the directory so goldens for artifacts no longer produced do not linger.
  rmSync(goldenDir, { recursive: true, force: true });
  mkdirSync(goldenDir, { recursive: true });
  for (const [name, value] of Object.entries(outputs)) {
    writeFileSync(join(goldenDir, name), canonicalJson(value));
  }
  console.log(`[golden] ${input.fixture_id}: wrote ${JSON.stringify(summary)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
