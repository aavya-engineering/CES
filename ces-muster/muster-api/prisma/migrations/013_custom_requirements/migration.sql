-- S1.9 (demo feedback 2026-10-27): "Create / Delete requirement". The 110
-- NIST SP 800-171 requirements stay fixed (decision D2: ID, text, family,
-- level and SPRS weight are not editable). Platform administrators may add
-- organisation-defined requirements as a fifth governed kind, with the same
-- draft → second-admin publish → retire rules as the other four.
ALTER TABLE shared_items DROP CONSTRAINT IF EXISTS shared_items_kind_check;
ALTER TABLE shared_items ADD CONSTRAINT shared_items_kind_check
  CHECK (kind IN ('requirement_meta', 'archetype', 'mapping', 'rule', 'custom_requirement'));
