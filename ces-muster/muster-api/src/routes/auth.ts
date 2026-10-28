// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../lib/prisma.js';
import { mintToken } from '../lib/jwt.js';
import { bearerAuth } from '../middleware/auth.js';
import { randomBytes } from 'node:crypto';
import { recordFailure, recordSuccess, retryAfterSeconds } from '../lib/loginAttempts.js';
import { PERMISSIONS, ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, permissionsFor } from '../lib/permissions.js';
import { audit, type AuditDb } from '../lib/audit.js';
import { passwordProblem } from '../lib/passwords.js';

const router = Router();

// UI-01: an unknown email must cost the same bcrypt work as a wrong password,
// so response time does not reveal which emails have accounts. Cost 10 matches
// scripts/seed.ts. Built once, on first use.
let dummyHash: string | null = null;
function getDummyHash(): string {
  if (!dummyHash) dummyHash = bcrypt.hashSync(randomBytes(16).toString('hex'), 10);
  return dummyHash;
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post('/login', async (req, res, next) => {
  try {
    const result = loginSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: result.error.flatten() });
      return;
    }
    const { email, password } = result.data;
    const client = req.ip ?? 'unknown';

    // UI-01: limit unsuccessful logon attempts (NIST SP 800-171 3.1.8).
    const wait = retryAfterSeconds(email, client);
    if (wait > 0) {
      res.setHeader('Retry-After', String(wait));
      res.status(429).json({ error: 'Too many failed sign-in attempts. Try again later.' });
      return;
    }

    // Admin-created users are stored lower-case (routes/users.ts); seed.ts keeps
    // what it was given. Try as typed, then lower-case.
    const user =
      (await db.user.findUnique({ where: { email } })) ??
      (email !== email.toLowerCase() ? await db.user.findUnique({ where: { email: email.toLowerCase() } }) : null);
    // Always run one bcrypt compare (dummy hash for an unknown email) and give
    // one answer for both failures, so neither the body nor the timing tells a
    // caller whether the account exists.
    const valid = await bcrypt.compare(password, user?.password_hash ?? getDummyHash());
    if (!user || !valid) {
      recordFailure(email, client);
      await audit(db as unknown as AuditDb, { action: 'auth.login_failed', detail: { email: email.toLowerCase() } });
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    // RBAC-01: a disabled account is refused. Said plainly only after the
    // right password, so it reveals nothing to someone guessing.
    if (user.disabled_at) {
      await audit(db as unknown as AuditDb, { action: 'auth.login_refused_disabled', actor: { sub: user.id, role: user.role }, target_type: 'user', target_id: user.id, tenant_id: user.tenant_id });
      res.status(403).json({ error: 'This account is disabled. Ask your platform administrator.', code: 'ACCOUNT_DISABLED' });
      return;
    }
    recordSuccess(email);

    const mustChange = !!user.must_change_password;
    const token = mintToken(
      {
        sub: user.id,
        tenant_id: user.tenant_id,
        party_id: user.party_id ?? null,
        role: user.role,
        email: user.email,
        name: user.display_name ?? null,
        ...(mustChange ? { pwd_change_required: true } : {}),
      },
      // A temporary-password token only opens /auth/*; keep it short.
      mustChange ? { expiresIn: '15m' } : undefined
    );

    // Best-effort bookkeeping: never block a correct sign-in on it.
    await Promise.resolve()
      .then(() => db.user.update({ where: { id: user.id }, data: { last_login_at: new Date() } }))
      .catch(() => undefined);
    await audit(db as unknown as AuditDb, { action: 'auth.login', actor: { sub: user.id, role: user.role }, target_type: 'user', target_id: user.id, tenant_id: user.tenant_id });

    res.json({ token, must_change_password: mustChange });
  } catch (err) {
    next(err);
  }
});

// RBAC-01: the caller's claims plus what their role may do (additive: the
// claim fields are unchanged at the top level).
router.get('/me', bearerAuth, (req, res) => {
  res.json({ ...req.user, permissions: permissionsFor(req.user!.role) });
});

// RBAC-01: the role/permission catalogue for the Roles screen. Signed-in users
// only; it describes rules, not data.
router.get('/roles', bearerAuth, (_req, res) => {
  res.json({
    roles: ROLES.map((r) => ({ id: r, label: ROLE_LABELS[r], description: ROLE_DESCRIPTIONS[r] })),
    permissions: PERMISSIONS,
  });
});

const changeSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string(),
});

// S1.9 (demo feedback, 2026-10-27): sliding session. While the user is active the
// portal swaps its token for a fresh one; an idle user's token simply expires
// (JWT_EXPIRES_IN — 30m in the deployment kit). A disabled user, or one who must
// still change a temporary password, gets no new token.
router.post('/refresh', bearerAuth, async (req, res, next) => {
  try {
    const user = await db.user.findUnique({ where: { id: req.user!.sub } });
    if (!user || user.disabled_at || user.must_change_password) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    const token = mintToken({
      sub: user.id,
      tenant_id: user.tenant_id,
      party_id: user.party_id ?? null,
      role: user.role,
      email: user.email,
      name: user.display_name ?? null,
    });
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

// RBAC-01: a user replaces their own password (required after a temporary one).
router.post('/change-password', bearerAuth, async (req, res, next) => {
  try {
    const parsed = changeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const user = await db.user.findUnique({ where: { id: req.user!.sub } });
    if (!user || user.disabled_at) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    const { current_password, new_password } = parsed.data;
    if (!(await bcrypt.compare(current_password, user.password_hash))) {
      res.status(400).json({ error: 'Your current password is not correct.', code: 'CURRENT_PASSWORD_WRONG' });
      return;
    }
    if (new_password === current_password) {
      res.status(400).json({ error: 'Choose a password different from the current one.', code: 'PASSWORD_UNCHANGED' });
      return;
    }
    const problem = passwordProblem(new_password, user.email);
    if (problem) {
      res.status(400).json({ error: problem, code: 'PASSWORD_RULE' });
      return;
    }
    const password_hash = await bcrypt.hash(new_password, 10);
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { password_hash, must_change_password: false, password_changed_at: new Date() },
      });
      await audit(tx as unknown as AuditDb, { action: 'user.password_changed', actor: { sub: user.id, role: user.role }, target_type: 'user', target_id: user.id, tenant_id: user.tenant_id }, { strict: true });
    });
    const token = mintToken({
      sub: user.id,
      tenant_id: user.tenant_id,
      party_id: user.party_id ?? null,
      role: user.role,
      email: user.email,
      name: user.display_name ?? null,
    });
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

export default router;
