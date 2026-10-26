// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// fakeSharedDb.ts — S1.1 tests: in-memory shared_items / shared_changes with the
// same guards as migration 010 (one draft and one published per item, published
// rows immutable, only drafts deletable, changes append-only) and a
// $transaction that rolls back on error.
import { randomUUID } from 'node:crypto';
import type { ChangeRow, ItemRow, SharedDb } from '../../src/cesShared/service.js';

type Where = Record<string, unknown>;
const matches = (row: Record<string, unknown>, where: Where = {}) => Object.entries(where).every(([k, v]) => row[k] === v);

export function createFakeSharedDb() {
  let items: ItemRow[] = [];
  let changes: ChangeRow[] = [];
  let failNextChange = false;

  function checkUnique() {
    const seen = new Set<string>();
    for (const r of items) {
      if (r.status === 'retired') continue;
      const k = `${r.kind}|${r.item_key}|${r.status}`;
      if (seen.has(k)) throw new Error(`unique violation: ${k}`);
      seen.add(k);
    }
  }

  const db: SharedDb & { items: () => ItemRow[]; changes: () => ChangeRow[]; failNextChange: () => void } = {
    items: () => items,
    changes: () => changes,
    failNextChange: () => {
      failNextChange = true;
    },
    sharedItem: {
      async findMany({ where }) {
        return items.filter((r) => matches(r as unknown as Record<string, unknown>, where)).map((r) => ({ ...r }));
      },
      async create({ data }) {
        const now = new Date();
        const row = {
          id: randomUUID(),
          created_at: now,
          updated_at: now,
          published_by: null,
          published_at: null,
          retired_by: null,
          retired_at: null,
          ...data,
        } as ItemRow;
        items.push(row);
        checkUnique();
        return { ...row };
      },
      async update({ where, data }) {
        const row = items.find((r) => r.id === where.id);
        if (!row) throw new Error('not found');
        if (row.status !== 'draft') {
          if ('data' in data && JSON.stringify(data.data) !== JSON.stringify(row.data)) throw new Error('shared_items: a published or retired version cannot be changed');
          if (!(row.status === 'published' && data.status === 'retired')) throw new Error('shared_items: only published -> retired is allowed after publishing');
        }
        Object.assign(row, data);
        checkUnique();
        return { ...row };
      },
      async delete({ where }) {
        const row = items.find((r) => r.id === where.id);
        if (!row) throw new Error('not found');
        if (row.status !== 'draft') throw new Error('shared_items: only drafts can be deleted');
        items = items.filter((r) => r !== row);
        return row;
      },
    },
    sharedChange: {
      async create({ data }) {
        if (failNextChange) {
          failNextChange = false;
          throw new Error('change log unavailable');
        }
        const row = { id: randomUUID(), at: new Date(Date.now() + changes.length), version: null, detail: null, actor_role: null, ...data } as ChangeRow;
        changes.push(row);
        return row;
      },
      async findMany({ where, take }) {
        const list = changes.filter((c) => matches(c as unknown as Record<string, unknown>, where)).sort((a, b) => b.at.getTime() - a.at.getTime());
        return take ? list.slice(0, take) : list;
      },
    },
    async $transaction(fn) {
      const snapshot = { items: items.map((r) => ({ ...r })), changes: [...changes] };
      try {
        return await fn(db);
      } catch (e) {
        items = snapshot.items;
        changes = snapshot.changes;
        throw e;
      }
    },
  };
  return db;
}
