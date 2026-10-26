// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// seed.ts — S1.1: load the generated CES-Shared seed (src/data/ces-shared-seed.json)
// as version 1, published, author "seed". Idempotent: items that already exist
// (in any version or state) are left alone, so edits made in the app are never
// overwritten. Every seeded item writes one shared_changes row ("seed").
import SEED from '../data/ces-shared-seed.json';
import { SCHEMAS, keyOf, type Kind } from './schemas.js';
import type { SharedDb } from './service.js';

export const SEED_ACTOR = 'seed';
const SEEDED_KINDS: Kind[] = ['archetype', 'mapping', 'rule'];

/** Validates every seed item; throws on the first invalid one. */
export function seedItems(): { kind: Kind; key: string; data: Record<string, unknown> }[] {
  const out: { kind: Kind; key: string; data: Record<string, unknown> }[] = [];
  for (const kind of SEEDED_KINDS) {
    for (const raw of (SEED as unknown as Record<string, unknown[]>)[kind]) {
      const parsed = SCHEMAS[kind].safeParse(raw);
      if (!parsed.success) throw new Error(`seed ${kind} invalid: ${JSON.stringify(raw).slice(0, 120)} — ${parsed.error.issues[0]?.message}`);
      const data = parsed.data as Record<string, unknown>;
      out.push({ kind, key: keyOf(kind, data), data });
    }
  }
  return out;
}

export async function seedCesShared(db: SharedDb): Promise<{ created: number; skipped: number }> {
  let created = 0;
  let skipped = 0;
  const now = new Date();
  for (const item of seedItems()) {
    await db.$transaction(async (tx) => {
      const existing = await tx.sharedItem.findMany({ where: { kind: item.kind, item_key: item.key } });
      if (existing.length) {
        skipped++;
        return;
      }
      await tx.sharedItem.create({
        data: {
          kind: item.kind,
          item_key: item.key,
          version: 1,
          status: 'published',
          data: item.data,
          created_by: SEED_ACTOR,
          updated_by: SEED_ACTOR,
          published_by: SEED_ACTOR,
          published_at: now,
        },
      });
      await tx.sharedChange.create({
        data: { actor_user_id: SEED_ACTOR, actor_role: null, action: 'seed', kind: item.kind, item_key: item.key, version: 1, detail: null },
      });
      created++;
    });
  }
  return { created, skipped };
}
