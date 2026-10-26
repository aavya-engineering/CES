# REQ: ces-shared: the plan-step gap classification enum rejects values the Planner emits

**Filed by:** ces-muster (MG-05, 2026-10-23)
**Target module:** ces-shared (contract owner: BHD)
**Priority:** P1 — blocks MG-05. Without it, every plan for an `m365_only` customer is rejected on push.

## Finding
`ces-shared/src/types/mission-plan.bodies.ts` declares
`GapClassificationEnum = configure | customize | manual | auto_generate`, used by
`ManualStepSchema.gap_classifications`. The Planner gap compiler (vendored in Muster) can also emit
`manual_alternative`, `control_not_available` and `scoped_out`
(`ces-planner/src/features/mpt/types.ts` `GapClassification`). For `infrastructure_model = m365_only`,
`gapCompiler.classifyInfrastructureGaps` returns `['manual_alternative']` for the infrastructure controls.

Effect: `ManualMissionPlanSchema` rejects every `m365_only` Mission Plan. muster-api's push route
answers 400, and Stamper's `PlanTranslator.translateCore` throws
`Mission plan validation failed: …gap_classifications…: Invalid enum value`.

It stayed hidden because Muster derived `m365_azure` by default and Planner's SI generator drops
SIT-020 (so Planner always plans for Azure). MG-05 stops inferring `m365_azure`; an unconfirmed model
now plans `m365_only`, which exposes the gap.

Evidence (2026-10-23, local):
- MG-05 branch with ces-shared at `master`: muster-api suite 16 failed (push, results and contract tests,
  all on `steps.N.gap_classifications.1 … received 'manual_alternative'`).
- Stamper suites `SharedMissionPlanDelegation` and `ExecutionResultsVocabulary` fail the same way when they
  read Muster's regenerated fixture.
- MG-04 harness: Planner's own plan for fixture (a) with SIT-020 = `m365_only` fails the contract on 9 steps.

## Ask
Extend `GapClassificationEnum` to the Planner's full set:
`configure | customize | manual | auto_generate | manual_alternative | control_not_available | scoped_out`.

Stamper gives meaning only to `auto_generate` (`PlanTranslator.determineEngine`); the other values pass
through to directive args, so the change does not alter Stamper behaviour for existing plans.

A ready change is on ces-mono branch `REQ-ces-shared-gap-classification-enum` (enum + tests; the new tests
fail on the old enum). With it: muster-api suite 454 passed on MG-05; the two Stamper suites above pass.

Related, not changed: the Planner JSON schema (`CES MPT Manual Mission Plan schema.json`) lists 4 values at
step level and 7 at control level. Planner does not call `validateManualMissionPlan` at runtime today.

## What Muster does meanwhile
Nothing — the contract is not loosened or re-declared in Muster (see `muster-api/src/contracts/missionPlan.contract.ts`).
MG-05 must not merge before this REQ, or before BHD decides to block the push for an unconfirmed
infrastructure model instead of defaulting to `m365_only`.
