// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// service.ts — S1.1 (doc 26 D1 "governed edits"): draft -> publish -> retire
// for CES-Shared content, with an append-only change log.
//
// Rules enforced here (and, where possible, again in the database, migration 010):
//   * every draft is validated against its kind's schema (schemas.ts);
//   * an item's key comes from its data and never changes;
//   * at most one draft and one published version per item;
//   * the person who publishes must not be the draft's author (no self-approval,
//     BHD role review suggestion 3);
//   * published versions are never edited or deleted — a new draft is made from
//     them and published as the next version; old versions become "retired";
//   * every change writes a shared_changes row in the same transaction.
import { SCHEMAS, keyOf, type Kind } from './schemas.js';
import { CONTROL_IDS, FAMILY_CODES, REFERENCE_VERSION } from './reference.js';

export type Status = 'draft' | 'published' | 'retired';

export interface ItemRow {
  id: string;
  kind: string;
  item_key: string;
  version: number;
  status: Status;
  data: Record<string, unknown>;
  created_by: string;
  created_at: Date;
  updated_by: string;
  updated_at: Date;
  published_by: string | null;
  published_at: Date | null;
  retired_by: string | null;
  retired_at: Date | null;
}

export interface ChangeRow {
  id: string;
  at: Date;
  actor_user_id: string;
  actor_role: string | null;
  action: string;
  kind: string;
  item_key: string;
  version: number | null;
  detail: Record<string, unknown> | null;
}

type Where = { kind?: string; item_key?: string; status?: Status };

/** The narrow slice of Prisma this service uses (tests pass an in-memory fake). */
export interface SharedDb {
  sharedItem: {
    findMany(args: { where?: Where; orderBy?: Record<string, 'asc' | 'desc'> }): Promise<ItemRow[]>;
    create(args: { data: Partial<ItemRow> }): Promise<ItemRow>;
    update(args: { where: { id: string }; data: Partial<ItemRow> }): Promise<ItemRow>;
    delete(args: { where: { id: string } }): Promise<ItemRow>;
  };
  sharedChange: {
    create(args: { data: Partial<ChangeRow> }): Promise<ChangeRow>;
    findMany(args: { where?: { kind?: string; item_key?: string }; orderBy?: Record<string, 'asc' | 'desc'>; take?: number }): Promise<ChangeRow[]>;
  };
  $transaction<T>(fn: (tx: SharedDb) => Promise<T>): Promise<T>;
}

export interface Actor {
  sub: string;
  role: string;
}

export class SharedError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
  }
}

export interface ItemView {
  kind: Kind;
  key: string;
  published: ItemRow | null;
  draft: ItemRow | null;
  /** Latest retired version, when nothing is published. */
  retired: ItemRow | null;
  /** What readers see: the published data, else null. */
  current: Record<string, unknown> | null;
  status: 'published' | 'draft_only' | 'retired';
}

function group(kind: Kind, rows: ItemRow[]): ItemView[] {
  const byKey = new Map<string, ItemRow[]>();
  for (const r of rows) byKey.set(r.item_key, [...(byKey.get(r.item_key) ?? []), r]);
  return [...byKey.entries()]
    .map(([key, list]) => {
      const published = list.find((r) => r.status === 'published') ?? null;
      const draft = list.find((r) => r.status === 'draft') ?? null;
      const retired = published ? null : list.filter((r) => r.status === 'retired').sort((a, b) => b.version - a.version)[0] ?? null;
      const status: ItemView['status'] = published ? 'published' : draft && !retired ? 'draft_only' : 'retired';
      return { kind, key, published, draft, retired, current: published?.data ?? null, status };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

function changedFields(before: Record<string, unknown> | undefined, after: Record<string, unknown>): string[] {
  return Object.keys(after).filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after[k]));
}

export function createSharedService(db: SharedDb) {
  async function rowsOf(tx: SharedDb, kind: Kind, key?: string) {
    return tx.sharedItem.findMany({ where: { kind, ...(key ? { item_key: key } : {}) }, orderBy: { version: 'asc' } });
  }

  async function log(tx: SharedDb, actor: Actor, action: string, kind: Kind, key: string, version: number | null, detail?: Record<string, unknown>) {
    await tx.sharedChange.create({
      data: { actor_user_id: actor.sub, actor_role: actor.role, action, kind, item_key: key, version, detail: detail ?? null },
    });
  }

  /** Cross-references must point at real items (published or drafted). */
  async function checkReferences(tx: SharedDb, kind: Kind, data: Record<string, unknown>) {
    const unknownControls = (ids: string[]) => ids.filter((id) => !CONTROL_IDS.has(id));
    if (kind === 'requirement_meta' || kind === 'mapping') {
      const bad = unknownControls([String(data.control_id)]);
      if (bad.length) throw new SharedError(400, 'UNKNOWN_REQUIREMENT', 'The requirement does not exist', { controlIds: bad });
    }
    if (kind === 'custom_requirement') {
      const id = String(data.control_id);
      if (CONTROL_IDS.has(id)) throw new SharedError(409, 'RESERVED_REQUIREMENT_ID', 'This ID belongs to one of the 110 NIST requirements. Choose another ID.', { controlId: id });
      if (!FAMILY_CODES.has(String(data.family))) throw new SharedError(400, 'UNKNOWN_FAMILY', 'Choose one of the 14 control families', { family: data.family });
    }
    if (kind === 'requirement_meta' || kind === 'custom_requirement') {
      const linked = [...((data.related as string[] | undefined) ?? []), ...((data.dependent as string[] | undefined) ?? [])];
      if (linked.length) {
        const custom = new Set((await rowsOf(tx, 'custom_requirement')).filter((r) => r.status !== 'retired').map((r) => r.item_key));
        const bad = linked.filter((id) => !CONTROL_IDS.has(id) && !custom.has(id));
        if (bad.length) throw new SharedError(400, 'UNKNOWN_REQUIREMENT', 'A related or dependent requirement does not exist', { controlIds: bad });
      }
    }
    const archetypes = kind === 'mapping' ? [String(data.archetype_code)] : kind === 'rule' ? ((data.applies_to as { archetypes: string[] }).archetypes ?? []) : [];
    if (kind === 'rule') {
      const bad = unknownControls((data.applies_to as { requirements: string[] }).requirements);
      if (bad.length) throw new SharedError(400, 'UNKNOWN_REQUIREMENT', 'A requirement in "applies to" does not exist', { controlIds: bad });
    }
    if (archetypes.length) {
      const known = new Set((await rowsOf(tx, 'archetype')).filter((r) => r.status !== 'retired').map((r) => r.item_key));
      const bad = archetypes.filter((a) => !known.has(a));
      if (bad.length) throw new SharedError(400, 'UNKNOWN_ARCHETYPE', 'The evidence archetype does not exist', { archetypeCodes: bad });
    }
  }

  function validate(kind: Kind, input: unknown): Record<string, unknown> {
    const parsed = SCHEMAS[kind].safeParse(input);
    if (!parsed.success) {
      throw new SharedError(400, 'VALIDATION_FAILED', 'The item is not valid', {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return parsed.data as Record<string, unknown>;
  }

  return {
    async list(kind: Kind): Promise<ItemView[]> {
      return group(kind, await rowsOf(db, kind));
    },

    async get(kind: Kind, key: string) {
      const rows = await rowsOf(db, kind, key);
      if (rows.length === 0) throw new SharedError(404, 'ITEM_NOT_FOUND', 'No such item', { kind, key });
      const changes = await db.sharedChange.findMany({ where: { kind, item_key: key }, orderBy: { at: 'desc' } });
      return { ...group(kind, rows)[0], versions: [...rows].sort((a, b) => b.version - a.version), changes };
    },

    /**
     * Create a draft. mode 'create' refuses an existing item (409); mode
     * 'update' needs one, and the key in the URL must match the data.
     */
    async saveDraft(kind: Kind, input: unknown, actor: Actor, mode: { create: true } | { create: false; key: string }) {
      const data = validate(kind, input);
      const key = keyOf(kind, data);
      if (!mode.create && mode.key !== key) {
        throw new SharedError(400, 'KEY_CHANGED', 'The identifying fields cannot be changed; create a new item instead', { key: mode.key, newKey: key });
      }
      return db.$transaction(async (tx) => {
        await checkReferences(tx, kind, data);
        const rows = await rowsOf(tx, kind, key);
        if (mode.create && rows.length) throw new SharedError(409, 'ITEM_EXISTS', 'An item with this code already exists', { kind, key });
        if (!mode.create && !rows.length) throw new SharedError(404, 'ITEM_NOT_FOUND', 'No such item', { kind, key });
        const draft = rows.find((r) => r.status === 'draft');
        const base = rows.find((r) => r.status === 'published');
        if (draft) {
          const fields = changedFields(draft.data, data);
          const row = await tx.sharedItem.update({ where: { id: draft.id }, data: { data, updated_by: actor.sub, updated_at: new Date() } });
          await log(tx, actor, 'draft.update', kind, key, row.version, { fields });
          return row;
        }
        const version = rows.reduce((m, r) => Math.max(m, r.version), 0) + 1;
        const row = await tx.sharedItem.create({
          data: { kind, item_key: key, version, status: 'draft', data, created_by: actor.sub, updated_by: actor.sub },
        });
        await log(tx, actor, 'draft.create', kind, key, version, { fields: changedFields(base?.data, data), fromVersion: base?.version ?? null });
        return row;
      });
    },

    async deleteDraft(kind: Kind, key: string, actor: Actor) {
      return db.$transaction(async (tx) => {
        const draft = (await rowsOf(tx, kind, key)).find((r) => r.status === 'draft');
        if (!draft) throw new SharedError(404, 'NO_DRAFT', 'There is no draft to discard', { kind, key });
        await tx.sharedItem.delete({ where: { id: draft.id } });
        await log(tx, actor, 'draft.delete', kind, key, draft.version);
      });
    },

    async publish(kind: Kind, key: string, actor: Actor) {
      return db.$transaction(async (tx) => {
        const rows = await rowsOf(tx, kind, key);
        const draft = rows.find((r) => r.status === 'draft');
        if (!draft) throw new SharedError(409, 'NO_DRAFT', 'There is no draft to publish', { kind, key });
        if (draft.created_by === actor.sub || draft.updated_by === actor.sub) {
          throw new SharedError(403, 'SELF_APPROVAL', 'A second administrator must publish a draft you created or edited', { kind, key });
        }
        // References may have been retired since the draft was saved.
        await checkReferences(tx, kind, draft.data);
        const now = new Date();
        const previous = rows.find((r) => r.status === 'published');
        if (previous) await tx.sharedItem.update({ where: { id: previous.id }, data: { status: 'retired', retired_by: actor.sub, retired_at: now } });
        const row = await tx.sharedItem.update({ where: { id: draft.id }, data: { status: 'published', published_by: actor.sub, published_at: now } });
        await log(tx, actor, 'publish', kind, key, row.version, { previousVersion: previous?.version ?? null });
        return row;
      });
    },

    async retire(kind: Kind, key: string, actor: Actor) {
      return db.$transaction(async (tx) => {
        const published = (await rowsOf(tx, kind, key)).find((r) => r.status === 'published');
        if (!published) throw new SharedError(409, 'NOT_PUBLISHED', 'Only a published item can be retired', { kind, key });
        if (kind === 'archetype') {
          const mappings = (await rowsOf(tx, 'mapping')).filter((m) => m.status === 'published' && m.data.archetype_code === key);
          if (mappings.length) {
            throw new SharedError(409, 'IN_USE', `This archetype is used by ${mappings.length} published mapping${mappings.length === 1 ? '' : 's'} (${mappings.slice(0, 3).map((m) => m.item_key.split('::')[0]).join(', ')}${mappings.length > 3 ? ', …' : ''}). Delete those mappings first.`, { mappings: mappings.map((m) => m.item_key) });
          }
        }
        const row = await tx.sharedItem.update({ where: { id: published.id }, data: { status: 'retired', retired_by: actor.sub, retired_at: new Date() } });
        await log(tx, actor, 'retire', kind, key, row.version);
        return row;
      });
    },

    async changes(filter: { kind?: string; key?: string; limit?: number }) {
      return db.sharedChange.findMany({
        where: { ...(filter.kind ? { kind: filter.kind } : {}), ...(filter.key ? { item_key: filter.key } : {}) },
        orderBy: { at: 'desc' },
        take: Math.min(Math.max(filter.limit ?? 50, 1), 500),
      });
    },

    async summary() {
      const out: Record<string, { published: number; draft: number; retired: number }> = {};
      for (const kind of Object.keys(SCHEMAS) as Kind[]) {
        const views = group(kind, await rowsOf(db, kind));
        out[kind] = {
          published: views.filter((v) => v.published).length,
          draft: views.filter((v) => v.draft).length,
          retired: views.filter((v) => v.status === 'retired').length,
        };
      }
      return out;
    },

    /** The published content, in a form BHD can merge into ces-shared (doc 26 §4 step 5). */
    async exportRelease() {
      const items: Record<string, unknown[]> = {};
      for (const kind of Object.keys(SCHEMAS) as Kind[]) {
        items[kind] = group(kind, await rowsOf(db, kind))
          .filter((v) => v.published)
          .map((v) => ({ ...v.published!.data, _version: v.published!.version, _published_at: v.published!.published_at }));
      }
      return { artifact: 'ces-shared-governed-release', format_version: '1.0.0', reference_version: REFERENCE_VERSION, exported_at: new Date().toISOString(), items };
    },
  };
}

export type SharedService = ReturnType<typeof createSharedService>;
