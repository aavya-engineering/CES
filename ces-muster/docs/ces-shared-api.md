# CES-Shared API and governed edits (Sprint 1, S1.1)

**Added:** 2026-10-24 by Aavya engineering. **Design:** project doc 26 (decision D1 "governed edits").

## What it is

`muster-api` serves CES-Shared under `/api/v1/ces-shared`:

- **Locked reference data.** The 110 requirements, 14 families, DoD SPRS weights and the 320 objectives are read from the vendored ces-shared files (byte-identical, `src/vendored/cesSharedSync.ts`). There is no write route for them.
- **NIST SP 800-171 Rev 2 text and Basic/Derived type.** These come from `muster-api/src/data/nist-800-171r2.json`, taken from the CMMC L2 workbook (reference only).
- **Governed content** in Postgres (migration 010). There are four kinds:
  - `requirement_meta`: priority, modules, implementation guidance.
  - `archetype`
  - `mapping`
  - `rule`

Every change is a **draft**. A **different** platform administrator publishes it, which creates a new version and retires the old one. Every change writes an append-only `shared_changes` row in the same transaction.

## Rules

| Rule | Where enforced |
|---|---|
| Draft shape validated per kind (strict: unknown fields refused) | `src/cesShared/schemas.ts` |
| Key comes from the data and never changes | service `KEY_CHANGED` |
| No self-approval: the draft's author cannot publish it | service `SELF_APPROVAL` (403) |
| One draft and one published version per item | DB partial unique indexes |
| Published/retired rows are never edited; only drafts are deleted | DB trigger `shared_items_guard` |
| Change log is append-only | DB trigger + no TRUNCATE grant |
| References must exist (requirement IDs, archetype codes) | service `UNKNOWN_REQUIREMENT` / `UNKNOWN_ARCHETYPE` |
| An archetype used by a published mapping cannot be retired | service `IN_USE` (409) |
| Rule logic is data from a fixed vocabulary, never code | `ruleSchema` |

## Routes

All routes need a signed-in user (`Authorization: Bearer …`).
- **Read routes** (`shared.read`) are open to every role.
- **Edit and publish routes** (`shared.edit`, `shared.approve`) are open to `platform_admin` only.

| Method | Path | Purpose |
|---|---|---|
| GET | `/requirements?page&pageSize&search&family&level&type&weight&priority&module` | 110 requirements + published metadata |
| GET | `/requirements/:controlId` | One requirement (+ `metadataDraft` for editors) |
| GET | `/families` | 14 families |
| GET | `/items/:kind` | Items of a kind. Readers see published items only |
| GET | `/items/:kind/:key` | One item: current data, versions, changes |
| POST | `/items/:kind` | Create a draft of a new item (409 if it exists) |
| PUT | `/items/:kind/:key` | Create or update the draft of an existing item |
| DELETE | `/items/:kind/:key/draft` | Discard the draft |
| POST | `/items/:kind/:key/publish` | Publish the draft (not by its author) |
| POST | `/items/:kind/:key/retire` | Retire the published version |
| GET | `/changes?kind&key&limit` | Change log |
| GET | `/summary` | Counts for the Overview page |
| GET | `/export` | Published content as one JSON release for BHD to merge into ces-shared |

Errors use `{ "error": { "code", "message", "details", "requestId" } }`.

## Seed

The seed loads the sources BHD named in its review of Tech Arch V1.0:

- **Archetypes:** 50, from the Evidence Archetype Catalog. Codes are upper-cased.
- **Mappings:** 450, from the Fundamental Requirements Store `evidence_minimum` for the 110 requirements. `must_have` becomes required and `nice_to_have` becomes recommended. Assessor methods come from the Store objectives that list the archetype. Strength, rationale and truth tag are left empty because the source does not have them.
- **Rules:** 107, from `control-signal-registry.json`. Evaluator and signals are copied unchanged.

Requirement metadata is not seeded, because no source holds it.

```bash
npx tsx scripts/build-ces-shared-seed.ts          # rebuild muster-api/src/data/ces-shared-seed.json (CI checks it is current)
cd muster-api && npm run migrate:deploy && npm run seed:ces-shared   # load it (idempotent; never overwrites app edits)
```

## Tests

- `muster-api/tests/cesShared.test.ts` (16 tests). Covers the seed, paging and filters, the error envelope, locked fields, the draft → publish → version-2 flow, no self-approval, references, the in-use check, discarding a draft, rule validation, atomicity and roles.
- `tests/rbac.permissions.test.ts`. The `shared.*` permissions are probed for every role.
- `scripts/__tests__/cesSharedSeed.test.ts`. Checks that the seed is up to date and the counts are right.
- Migration 010 was checked on PostgreSQL 16, connected as `muster_app`:
  - updating or deleting a published row is refused;
  - published → retired works, but retired → published is refused;
  - a second draft of the same item is refused;
  - a bad kind is refused;
  - UPDATE and DELETE on `shared_changes` are refused, and TRUNCATE gets permission denied.
