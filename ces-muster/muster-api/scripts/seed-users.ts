// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// seed-users.ts — Sprint 2 (USR-01): create the named accounts of a deployment
// from a JSON list, each with a random one-time password that must be changed
// at first sign-in. The real e-mail addresses live in deploy/users.seed.json
// (git-ignored); deploy/users.seed.example.json is the template.
//
//   npx tsx scripts/seed-users.ts [--file ../../deploy/users.seed.json] [--out ../../deploy/output]
//
// Idempotent: an e-mail that already exists is skipped (its password and role
// are NOT touched — change those in Platform / Administration → Users).
// Tenants named in the file are created when missing. Passwords are written
// only to <out>/users-<timestamp>.txt (mode 0600), never to stdout or the log.
// docker/api-entrypoint.sh runs this on every container start when the file
// is present; the second run creates nothing. Logic: src/lib/seedUsers.ts.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/lib/prisma.js';
import { temporaryPassword } from '../src/lib/passwords.js';
import { SeedFileSchema, seedUsers } from '../src/lib/seedUsers.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const file = arg('file') ?? path.resolve(process.cwd(), '../../deploy/users.seed.json');
  const outDir = arg('out') ?? path.resolve(process.cwd(), '../../deploy/output');
  if (!fs.existsSync(file)) {
    console.error(`seed-users: no file at ${file} (copy deploy/users.seed.example.json to deploy/users.seed.json)`);
    return 2;
  }
  const parsed = SeedFileSchema.safeParse(JSON.parse(fs.readFileSync(file, 'utf8')));
  if (!parsed.success) {
    console.error(`seed-users: ${file} is invalid: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    return 2;
  }
  const lines: string[] = [];
  const result = await seedUsers(db, parsed.data.users, temporaryPassword, (email, pw) =>
    lines.push(`${email}  ${pw}  (one-time; must change at first sign-in)`)
  );
  if (lines.length) {
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outFile = path.join(outDir, `users-${stamp}.txt`);
    fs.writeFileSync(outFile, lines.join('\n') + '\n', { mode: 0o600 });
    console.log(`seed-users: ${result.created.length} created (one-time passwords in ${outFile}), ${result.skipped.length} already present`);
  } else {
    console.log(`seed-users: 0 created, ${result.skipped.length} already present`);
  }
  for (const c of result.created) console.log(`  + ${c.email}  ${c.role}  [${c.tenant}]`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(String(err));
    process.exit(1);
  })
  .finally(() => db.$disconnect());
