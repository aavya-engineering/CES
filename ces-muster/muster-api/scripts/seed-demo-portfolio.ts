// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// seed-demo-portfolio.ts — S1.8: OPTIONAL review data for the Home / Portfolio
// dashboard. Creates five clearly labelled demo engagements (reference IDs
// DEMO-001…DEMO-005), each with one organisation and dated milestones, in the
// tenant of the user you name. Dates are relative to today so every health
// state shows (on track, at risk, overdue, on hold, closed). Safe to re-run:
// does nothing if DEMO-001 already exists. Refuses NODE_ENV=production.
//   npx tsx scripts/seed-demo-portfolio.ts operator@example.test
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const email = process.argv[2];
if (!email) {
  console.error('Usage: npx tsx scripts/seed-demo-portfolio.ts <user email whose tenant gets the demo data>');
  process.exit(2);
}
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo data with NODE_ENV=production.');
  process.exit(2);
}

const DAY = 86_400_000;
const day = (offset: number) => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()) + offset * DAY);

const DEMO = [
  { ref: 'DEMO-001', name: 'Demo – Apex CMMC Assessment', org: 'Demo – Apex Defense Systems', level: 2, status: 'in_progress', start: -25, target: 50, lifecycle: 'in_progress', milestones: [['Kick-off meeting', -24, true], ['Discovery phase', 5, false], ['Readiness review', 21, false], ['Final assessment', 50, false]] },
  { ref: 'DEMO-002', name: 'Demo – GlobalTech Readiness', org: 'Demo – GlobalTech Solutions', level: 2, status: 'in_progress', start: -40, target: 35, lifecycle: 'stalled', milestones: [['Evidence collection phase 1', -3, false], ['Stamper configuration review', 12, false]] },
  { ref: 'DEMO-003', name: 'Demo – Vertex Manufacturing', org: 'Demo – Vertex Manufacturing', level: 1, status: 'in_progress', start: -90, target: -2, lifecycle: 'in_progress', milestones: [['Submit assessment plan', -10, true]] },
  { ref: 'DEMO-004', name: 'Demo – Cedar Health Review', org: 'Demo – Cedar Health Systems', level: 2, status: 'on_hold', start: -30, target: 70, lifecycle: 'invited', milestones: [['Readiness review', 30, false]] },
  { ref: 'DEMO-005', name: 'Demo – Orion Research Audit', org: 'Demo – Orion Research Labs', level: 2, status: 'closed', start: -150, target: -55, lifecycle: 'complete', milestones: [['Final evidence package', -60, true]] },
] as const;

const db = new PrismaClient();
async function main() {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user with email ${email}`);
  const tenant = user.tenant_id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.$transaction(async (tx: any) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenant}, true)`;
    if (await tx.engagement.findFirst({ where: { tenant_id: tenant, reference_id: 'DEMO-001' } })) {
      console.log('Demo portfolio already present — nothing to do.');
      return;
    }
    for (const e of DEMO) {
      const eng = await tx.engagement.create({
        data: { id: randomUUID(), tenant_id: tenant, engagement_kind: 'individual_contractor', name: e.name, reference_id: e.ref, cmmc_level: e.level, status: e.status, start_date: day(e.start), target_date: day(e.target) },
      });
      await tx.party.create({
        data: { id: randomUUID(), tenant_id: tenant, engagement_id: eng.id, name: e.org, on_prem_ot: 'no', lifecycle: e.lifecycle, last_activity_at: day(-1) },
      });
      for (const [name, due, done] of e.milestones) {
        await tx.engagementMilestone.create({
          data: { id: randomUUID(), tenant_id: tenant, engagement_id: eng.id, name, due_date: day(due), completed_at: done ? day(due) : null, created_by: user.id },
        });
      }
    }
    console.log(`Demo portfolio: ${DEMO.length} engagements created for tenant ${tenant}.`);
  });
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
