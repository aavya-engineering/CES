// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// fakeUsersDb.ts — RBAC-01 tests: an in-memory stand-in for the user, tenant and
// auditEvent models, enough for routes/users.ts and routes/auth.ts. The audit
// list refuses update/delete, like the migration 009 trigger.
import { randomUUID } from 'node:crypto';
import type { TenantRow, UserRow, UsersDb } from '../../src/routes/users.js';

export interface AuditRow {
  id: string;
  at: Date;
  action: string;
  actor_user_id: string | null;
  actor_role: string | null;
  target_type: string | null;
  target_id: string | null;
  tenant_id: string | null;
  detail?: Record<string, unknown>;
}

function matches(row: Record<string, unknown>, where: Record<string, unknown> = {}): boolean {
  return Object.entries(where).every(([k, v]) => (v === null ? row[k] == null : row[k] === v));
}

export function createFakeUsersDb() {
  const users: UserRow[] = [];
  const tenants: TenantRow[] = [];
  const events: AuditRow[] = [];
  let failAudit = false;

  const db = {
    users,
    tenants,
    events,
    setAuditFailure(on: boolean) {
      failAudit = on;
    },
    user: {
      async findMany() {
        return [...users];
      },
      async findUnique({ where }: { where: Record<string, unknown> }) {
        return users.find((u) => matches(u as unknown as Record<string, unknown>, where)) ?? null;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const row = {
          id: randomUUID(),
          party_id: null,
          display_name: null,
          disabled_at: null,
          must_change_password: false,
          last_login_at: null,
          created_at: new Date(),
          ...data,
        } as UserRow;
        users.push(row);
        return row;
      },
      async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
        const row = users.find((u) => u.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return row;
      },
      async count({ where }: { where?: Record<string, unknown> } = {}) {
        return users.filter((u) => matches(u as unknown as Record<string, unknown>, where)).length;
      },
    },
    tenant: {
      async findMany() {
        return [...tenants];
      },
      async findUnique({ where }: { where: { id: string } }) {
        return tenants.find((t) => t.id === where.id) ?? null;
      },
      async create({ data }: { data: { name: string } }) {
        const row = { id: randomUUID(), name: data.name };
        tenants.push(row);
        return row;
      },
    },
    /** Rolls back on error, like a Prisma interactive transaction. */
    async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const snap = {
        users: users.map((u) => ({ ...u })),
        tenants: tenants.map((t) => ({ ...t })),
        events: [...events],
      };
      try {
        return await fn(db);
      } catch (err) {
        users.splice(0, users.length, ...snap.users);
        tenants.splice(0, tenants.length, ...snap.tenants);
        events.splice(0, events.length, ...snap.events);
        throw err;
      }
    },
    auditEvent: {
      async create({ data }: { data: Record<string, unknown> }) {
        if (failAudit) throw new Error('audit store down');
        const row = { id: randomUUID(), at: new Date(), ...data } as AuditRow;
        events.push(row);
        return row;
      },
      async findMany({ take }: { take?: number } = {}) {
        return [...events].reverse().slice(0, take ?? events.length);
      },
    },
  };
  return db as typeof db & UsersDb;
}
