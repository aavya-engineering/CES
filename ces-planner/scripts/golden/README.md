<!--
SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
SPDX-License-Identifier: LicenseRef-BHD-Proprietary
CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
Ref: BHD-CES-MONO-2026A. See LICENSE and TERMS.md.
-->

# Planner golden generator (MG-04 parity harness — Planner side)

**Status:** feasibility spike, fixture (a) only. Branch `MG-04-golden-generator`. Not pushed.

## What it does

Runs the Planner plan chain **without a browser**, from a scrubbed fixture input, and writes the outputs as canonical JSON ("goldens"):

```
SI answers ─► SI Baseline ─► RR Question Set ─► RR answers (rule) ─► Readiness Posture
TCP answers ─► Tenant Config Profile ─┐
                                      ▼
            Gap Set ─► Task Catalog ─► Mission Plan + Tenant Manifest (+ Infrastructure Manifest)
                                      ─► validateArtifactAlignment (must pass)
                                      ─► ces-shared contract: ManualMissionPlanSchema,
                                         TenantManifestSchema, InfraManifestSchema (must pass —
                                         this is what muster-api and Stamper enforce)
```

The call order and arguments copy `src/features/mpt/hooks/useMissionPlanGenerator.ts`, Planner's only orchestration. Generator code is imported unchanged; nothing under `src/` is modified.

Muster must produce the same Mission Plan, Tenant Manifest and Infrastructure Manifest for the same customer (BHD parity rule). The Muster-side comparator is the next step (see "Not done yet").

## Commands

Run from `ces-planner/` (or with `-w ces-planner` from the repo root):

| Command | Effect |
|---|---|
| `npm run golden:generate` | Regenerate goldens for fixture (a) |
| `npm run golden:check` | Regenerate in memory; exit 1 if any golden differs, is missing, or is stale |
| `npx vite-node scripts/golden/generate-golden.ts -- <fixture-dir> [--check] [--verbose]` | Any fixture; `--verbose` shows Planner's console output |

`vite-node` is used (not `tsx`) because Planner modules read Vite's `import.meta.env` (for example `src/shared/config.ts`, pulled in by `taskCompiler` → `loeRateStore`). `vite-node` ships with `vitest`, which Planner already depends on.

CI: `.github/workflows/ci.yml` runs `golden:check` after the full suite. A Planner change that alters plan output must regenerate goldens in the same PR, so the output change is visible in review.

## Determinism

- Clock pinned to the fixture's `clock`, `Math.random` seeded with `seed` (`lib/determinism.ts`), installed **before** Planner modules load. Planner ids come from `Date.now()` + `Math.random()` (`src/shared/utils/idGenerator.ts`).
- `TZ=UTC` is forced. Planner's `planHelpers.addDays` does local-time arithmetic, so milestone `target_date` values shift by one day across a DST change in US time zones (found by this harness; see PL-03 below).
- JSON keys are sorted; files end with a newline.
- Verified: `golden:check` passes under TZ=UTC, America/Chicago, America/New_York and Asia/Kolkata; changing SIT-020 to `m365_only` makes the check fail (contract issues PL-05; before the contract check was added, 4 files differed and the infrastructure manifest was reported as no longer produced).

## Fixtures

| Fixture | Intent | Status |
|---|---|---|
| `a-gcch-cui-harden` | GCC High, CUI present (basic + export-controlled, ITAR), C3PAO certification, harden existing, Sentinel (SIT-020 explicit) | Spike — needs BHD review of intent |
| `b-no-cui` | No CUI | TBD (Wave 2) |
| `c-m365-only` | `m365_only` — no infrastructure manifest expected (MG-05) | TBD (Wave 2); blocked by PL-05 until the contract REQ lands |
| `d-build-new` | New build | TBD (Wave 2) |

Fixture rules (MS-03, MS-05, MS-06):

1. **Synthetic only.** No real customer names, domains, tenant ids or files. `plan-data/` and reference-customer paths are never used. Domains use `.example`; GUIDs are obviously fake.
2. **Non-default answers.** Wherever Muster derives or defaults a value, the fixture answers something else, so a parity pass cannot come from both sides falling back to the same default. Autofill output is not used (it returns bank recommendations — Muster's defaults).
3. **Explicit SIT-020.** Every fixture states its infrastructure model.
4. Each fixture's `input.json` carries an `intent` paragraph; BHD signs off fixture (a) before it becomes the yardstick.

`input.json` fields: `clock`, `seed`, `ces_id`, `plan_mode`, `si_answers` (by SI question id), `rr` (`default`, `by_family` on the first mapped requirement's family, `by_question`), `tcp_answers` (by TCP question id, or null).

Not in fixtures yet: CUI boundary, BTC confirmation, policy inputs (policy documents), evidence items. Each is passed as `null`, exactly as Planner does when none is selected.

## Planner findings from the spike (for BHD)

| ID | Finding | Evidence | Harness handling |
|---|---|---|---|
| PL-01 | `generateSIBaseline` drops SIT-020 `infrastructure_model`, SIT-021 `license_tier`, SIT-022 `user_count`; consumers fall back to inconsistent defaults (`m365_azure` in gapCompiler, taskCompiler, manifestGenerator, manualPlanGenerator; `m365_sentinel` in infraManifestGenerator). In Planner the SIT-020 answer has no effect | `src/features/sit/services/baselineGenerator.ts` `dependencies` block (lines ~107–123); Muster already compensates in `siBaselineAdapter.ts` `buildSiBaselineFromAnswers` | Harness applies the same carry as Muster (`carryDroppedDependencies`). Recommend fixing in Planner, then removing the carry |
| PL-02 | RR answers can never produce `met`: each requirement starts `unknown` and `mergeStatuses` keeps `unknown` unless another answer is `partial`/`not_met`. Already pinned by `postureGenerator.characterization.test.ts` | `src/features/rrt/services/postureGenerator.ts` `mapToRequirementResults`, `mergeStatuses` | None. Fixture (a) posture: 0 met / 64 partial / 25 not met / 39 unknown. BHD to confirm intended |
| PL-03 | Milestone dates depend on the machine's time zone (DST) | `src/features/mpt/services/planHelpers.ts` `addDays` uses `setDate/getDate` on a UTC-parsed date | Harness forces `TZ=UTC`. Suggested fix: `setUTCDate/getUTCDate`. Same root cause as Muster's `generateFixtures.test.ts` passing only under America/Chicago |
| PL-04 | Mission Plan still contains `outputs.cost_proposal_sow` (pricing) | `manualPlanGenerator.ts` `buildInlineCostProposal` | Golden keeps Planner output as is; `allow-list.json` proposes ignoring the block on the Muster side (D1 / MS-01) |
| PL-05 | An `m365_only` plan fails the ces-shared contract: steps carry `gap_classifications: 'manual_alternative'`, which `GapClassificationEnum` does not allow. Stamper's `PlanTranslator` would throw; muster-api rejects the push | `ces-shared/src/types/mission-plan.bodies.ts` `GapClassificationEnum`; `gapCompiler.ts` `classifyInfrastructureGaps`. Fixture (a) with SIT-020 = `m365_only`: 9 contract issues | Generator fails on contract issues. Fix proposed on ces-mono branch `REQ-ces-shared-gap-classification-enum`; ces-muster `docs/requirements/REQ-ces-shared-gap-classification-enum.md`. Blocks fixture (c) and Muster MG-05 |

## Size

Fixture (a) goldens are about 3.8 MB, mostly `mission-plan.json` (`outputs.human_readable_mission_plan`, ~2.6 MB). Four fixtures would be about 15 MB. **BHD decision:** commit full goldens (reviewable diffs, current approach) or commit digests only and regenerate in CI.

## Not done yet (next MG-04 steps)

1. Muster-side comparator: run Muster's pipeline on the same synthetic customer and diff MP/TM/IM against these goldens, applying `allow-list.json`. Needs a mapping from fixture answers to Muster inputs (stacksim tenant state + interview answers).
2. Fixtures (b)–(d).
3. CUI boundary and BTC inputs in fixtures.
4. Replace real-customer references in Muster tests (MS-05).
