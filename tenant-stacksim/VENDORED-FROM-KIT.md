# tenant-stacksim — vendored from BHD's `ces-contractor` kit

Copied byte-for-byte on 2026-11-11 from `ces-contractor-main.zip` (kit cut 2026-11-01),
`ces/tenant-stacksim/`, source commit `cea876a6b9da916d2ecc691ef0d1ba61c9b29ece`
(2026-11-02, see the kit's `SOURCES.json`). `node_modules/` and `dist/` were not copied.

Why it is here: the platform's engine run (`POST /assessments/run`, Assess › Readiness
"Run assessment") walks the Stamper registry's read-only commands against this simulated
GCC High tenant, asserts zero writes on its ledger and builds the readiness-result
envelope. Without the simulator the engine path cannot be exercised locally or in CI.

Run (Node 20+, no runtime dependencies):

    cd tenant-stacksim && npm ci && npm run build
    node bin/stacksim.mjs scenario muster-partial        # or s1-mach, s2-eng, s3-def
    node bin/stacksim.mjs serve m365_azure --slug mp --port 4390

Not a root workspace (own lockfile). Updates come from the kit; do not edit here.
