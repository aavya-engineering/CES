// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// seedUsers.ts — Sprint 2 (USR-01): pure part of scripts/seed-users.ts — the
// seed-file schema and the idempotent create loop, kept free of the Prisma
// singleton so it is unit-testable with a fake client.
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { temporaryPassword } from './passwords.js';

export const SEED_ROLES = ['prime', 'sub', 'bhd_operator', 'assessor_read_only', 'platform_admin'] as const;

export const SeedUserSchema = z.object({
  email: z.string().email().transform((e) => e.trim().toLowerCase()),
  display_name: z.string().min(1).max(120).optional(),
  role: z.enum(SEED_ROLES),
  tenant: z.string().min(1).max(120).default('Blue Heron Defense'),
});
export const SeedFileSchema = z.object({
  users: z.array(SeedUserSchema).min(1),
});
export type SeedUser = z.infer<typeof SeedUserSchema>;

export interface SeedUsersDb {
  tenant: {
    findFirst(a: { where: { name: string } }): Promise<{ id: string; name: string } | null>;
    create(a: { data: { name: string } }): Promise<{ id: string; name: string }>;
  };
  user: {
    findUnique(a: { where: { email: string } }): Promise<unknown | null>;
    create(a: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface SeedResult {
  created: { email: string; role: string; tenant: string }[];
  skipped: string[];
}

/**
 * Creates every user in `users` that does not exist yet, with a one-time
 * password (from `password()`) and must_change_password=true. Existing
 * e-mails are skipped untouched. Tenants are created when missing.
 * `onPassword` receives each generated password exactly once — the caller
 * decides where it goes (a 0600 file); it is never logged here.
 */
export async function seedUsers(
  client: SeedUsersDb,
  users: SeedUser[],
  password: () => string = temporaryPassword,
  onPassword: (email: string, pw: string) => void = () => {}
): Promise<SeedResult> {
  const result: SeedResult = { created: [], skipped: [] };
  const tenants = new Map<string, { id: string; name: string }>();
  for (const u of users) {
    if (await client.user.findUnique({ where: { email: u.email } })) {
      result.skipped.push(u.email);
      continue;
    }
    let tenant = tenants.get(u.tenant);
    if (!tenant) {
      tenant = (await client.tenant.findFirst({ where: { name: u.tenant } })) ?? (await client.tenant.create({ data: { name: u.tenant } }));
      tenants.set(u.tenant, tenant);
    }
    const pw = password();
    await client.user.create({
      data: {
        tenant_id: tenant.id,
        email: u.email,
        display_name: u.display_name ?? null,
        role: u.role,
        password_hash: await bcrypt.hash(pw, 10),
        must_change_password: true,
      },
    });
    onPassword(u.email, pw);
    result.created.push({ email: u.email, role: u.role, tenant: tenant.name });
  }
  return result;
}
