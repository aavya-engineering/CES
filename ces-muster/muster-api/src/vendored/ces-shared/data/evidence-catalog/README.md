# Evidence catalog — vendored from BHD's `ces-contractor` kit (cut 2026-11-01)

Copied byte-for-byte on 2026-11-11 from `ces-contractor-main.zip`:

| File | Origin in the kit | Purpose |
|---|---|---|
| `evidence-catalog.schema.json` | `ces/ces-shared/src/data/` | JSON Schema 2020-12 for a catalog release |
| `catalog-releases.json` | `ces/ces-muster/src/features/plan/engine/data/evidence-catalog/` | release log (one entry per governed release) |
| `evidence-catalog-release-0.json` | same | release 0 — AC 3.1.1 worked example, 14 definitions (BHD package 2026-10-26) |
| `nist-800-171a-examine-lists.json` | same | NIST SP 800-171A *Examine* lists for all 110 requirements, word for word |
| `objective-coverage-buckets.json` | same | 320 assessment objectives with BHD's read-coverage bucket (A/B/C…) |

Do not edit here. New releases arrive from BHD (Mark's "catalog rows" batches); append them to
`catalog-releases.json` and add the release file. `scripts/validate-catalog-rows.ts` checks a batch
before it is accepted (schema, NIST text word for word, one form id, objective ids belong to the
requirement). Loader: `src/services/evidenceCatalog.ts`.
