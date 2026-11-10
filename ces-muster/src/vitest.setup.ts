// vitest.setup.ts — test-environment fixes (2026-11-10).
// 1) The plan goldens (src/features/plan/__fixtures__) were generated in a US
//    time zone; target dates are derived from local dates, so pin the zone or
//    the "fixture freshness" test is off by one day on IST machines.
// 2) jsdom has no scrollIntoView; RequirementFormPage calls it after a failed
//    validation (demoFeedback.test) — stub it so the unhandled error goes away.
process.env.TZ = 'America/New_York';
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}
