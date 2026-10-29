// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// Sprint 2 USR-01: named-user seeding is idempotent, hashes passwords, forces
// a change at first sign-in and validates the seed file.
import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { SeedFileSchema, seedUsers, type SeedUsersDb } from '../src/lib/seedUsers.js';

function fakeDb() {
  const tenants: { id: string; name: string }[] = [];
  const users: Record<string, unknown>[] = [];
  const db: SeedUsersDb = {
    tenant: {
      findFirst: async ({ where }) => tenants.find((t) => t.name === where.name) ?? null,
      create: async ({ data }) => {
        const t = { id: `t${tenants.length + 1}`, name: data.name };
        tenants.push(t);
        return t;
      },
    },
    user: {
      findUnique: async ({ where }) => users.find((u) => u.email === where.email) ?? null,
      create: async ({ data }) => {
        users.push(data);
        return data;
      },
    },
  };
  return { db, tenants, users };
}

const seed = SeedFileSchema.parse({
  users: [
    { email: 'MSutton@BlueHeronDefense.com', display_name: 'Mark Sutton', role: 'platform_admin' },
    { email: 'vaibhav.pathak@aavya.com', display_name: 'Vaibhav Pathak', role: 'platform_admin', tenant: 'Blue Heron Defense' },
    { email: 'sunny.kumrawat@aavya.com', role: 'bhd_operator' },
  ],
}).users;

describe('seedUsers', () => {
  it('creates missing users with a hashed one-time password and must_change_password', async () => {
    const { db, tenants, users } = fakeDb();
    const issued: string[] = [];
    const r = await seedUsers(db, seed, () => 'Temp-Pass-1234!', (_e, pw) => issued.push(pw));
    expect(r.created.map((c) => c.email)).toEqual(['msutton@blueherondefense.com', 'vaibhav.pathak@aavya.com', 'sunny.kumrawat@aavya.com']);
    expect(r.skipped).toEqual([]);
    expect(tenants).toEqual([{ id: 't1', name: 'Blue Heron Defense' }]); // one tenant, reused
    expect(users).toHaveLength(3);
    expect(users[0]).toMatchObject({ tenant_id: 't1', role: 'platform_admin', display_name: 'Mark Sutton', must_change_password: true });
    expect(users[2]).toMatchObject({ role: 'bhd_operator', display_name: null });
    expect(issued).toHaveLength(3);
    for (const u of users) {
      expect(u.password_hash).not.toContain('Temp-Pass');
      expect(await bcrypt.compare('Temp-Pass-1234!', u.password_hash as string)).toBe(true);
    }
  });

  it('is idempotent: a second run creates nothing and touches no existing user', async () => {
    const { db, users } = fakeDb();
    await seedUsers(db, seed, () => 'first-pass-00000');
    const before = JSON.stringify(users);
    const r = await seedUsers(db, seed, () => 'second-pass-0000');
    expect(r.created).toEqual([]);
    expect(r.skipped).toHaveLength(3);
    expect(JSON.stringify(users)).toBe(before);
  });

  it('rejects an invalid seed file', () => {
    expect(SeedFileSchema.safeParse({ users: [] }).success).toBe(false);
    expect(SeedFileSchema.safeParse({ users: [{ email: 'not-an-email', role: 'platform_admin' }] }).success).toBe(false);
    expect(SeedFileSchema.safeParse({ users: [{ email: 'a@b.co', role: 'superuser' }] }).success).toBe(false);
  });
});
