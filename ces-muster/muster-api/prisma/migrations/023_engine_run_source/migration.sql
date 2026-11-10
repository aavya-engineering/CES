-- 023_engine_run_source — engine wiring (2026-11-10): an assessment run may now
-- be produced by the discovery engine itself (POST /assessments/run → registry
-- walk against the simulator or, behind the Live gate, the tenant), not only
-- imported from a readiness-result record or a delivered artifact.
ALTER TYPE "AssessmentSource" ADD VALUE IF NOT EXISTS 'engine_run';
