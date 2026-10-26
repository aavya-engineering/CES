// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// fakePortfolioDb.ts — S1.8 tests: an in-memory stand-in for the engagement,
// party, engagementMilestone, auditEvent and user models used by
// routes/engagements.ts (details + milestones) and routes/portfolio.ts.
// $transaction is a passthrough and records the app.tenant_id it was given;
// milestone reads honour that tenant like the migration 011 RLS policy.
import { randomUUID } from 'node:crypto';

type Row = Record<string, unknown>;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return (v as Row[]).some((w) => matches(row, w));
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const op = v as { in?: unknown[]; startsWith?: string };
      if (op.in) return op.in.includes(row[k]);
      if (op.startsWith !== undefined) return String(row[k] ?? '').startsWith(op.startsWith);
    }
    return v === null ? row[k] == null : row[k] === v;
  });
}

function model(rows: Row[], rls?: () => string | null, defaults: Row = {}) {
  const visible = () => (rls ? rows.filter((r) => r.tenant_id === rls()) : rows);
  return {
    rows,
    async findMany(args: { where?: Row; orderBy?: Row; take?: number } = {}) {
      let out = visible().filter((r) => matches(r, args.where));
      if (args.orderBy) {
        const [k, dir] = Object.entries(args.orderBy)[0] as [string, 'asc' | 'desc'];
        out = [...out].sort((a, b) => (a[k] as Date).getTime() - (b[k] as Date).getTime());
        if (dir === 'desc') out.reverse();
      }
      return args.take ? out.slice(0, args.take) : out;
    },
    async findUnique({ where }: { where: Row }) {
      return visible().find((r) => matches(r, where)) ?? null;
    },
    async create({ data }: { data: Row }) {
      const row: Row = { id: randomUUID(), created_at: new Date(), at: new Date(), ...defaults, ...data };
      rows.push(row);
      return row;
    },
    async update({ where, data }: { where: Row; data: Row }) {
      const row = visible().find((r) => matches(r, where));
      if (!row) throw new Error('not found');
      Object.assign(row, data);
      return row;
    },
    async delete({ where }: { where: Row }) {
      const i = rows.findIndex((r) => matches(r, where));
      if (i < 0) throw new Error('not found');
      return rows.splice(i, 1)[0];
    },
  };
}

export function createFakePortfolioDb() {
  let tenant: string | null = null;
  const db = {
    // Column defaults from migration 011.
    engagement: model([], undefined, { status: 'planned', name: null, reference_id: null, cmmc_level: null, start_date: null, target_date: null }),
    party: model([]),
    engagementMilestone: model([], () => tenant, { completed_at: null }),
    auditEvent: model([]),
    user: model([]),
    async $executeRaw(_strings: TemplateStringsArray, value: string) {
      tenant = value;
      return 1;
    },
    async $transaction<T>(fn: (tx: unknown) => Promise<T>) {
      try {
        return await fn(db);
      } finally {
        tenant = null;
      }
    },
  };
  return db;
}
