// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// passwordReset.ts — S1.9 (decision D3): "Forgot password" by e-mail link.
//
//   POST /auth/forgot-password {email}            → always 202, same body
//   POST /auth/reset-password  {token, new_password}
//
// Rules:
//  - The answer never says whether the email has an account (same body, and a
//    bcrypt-equivalent delay is not needed: no password is checked here).
//  - A link is 32 random bytes; only its SHA-256 is stored; it works once and
//    for 30 minutes; asking again cancels earlier unused links.
//  - Requests are limited per email and per client address (in memory).
//  - The new password follows the same rule as change-password, and the
//    account must not be disabled. Every request and reset is audited.
import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { audit, type AuditDb } from '../lib/audit.js';
import { passwordProblem } from '../lib/passwords.js';
import type { Mailer } from '../lib/mailer.js';

export const RESET_TTL_MS = 30 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_EMAIL = 3;
const MAX_PER_CLIENT = 10;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const GENERIC = { ok: true, message: 'If an account exists for this email, a reset link has been sent.' };

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ResetDb {
  user: { findUnique(a: any): Promise<any>; update(a: any): Promise<any> };
  passwordReset: { create(a: any): Promise<any>; findUnique(a: any): Promise<any>; update(a: any): Promise<any>; updateMany(a: any): Promise<any> };
  auditEvent: AuditDb['auditEvent'];
  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function createPasswordResetRouter(db: ResetDb, mailer: Mailer, opts: { publicUrl?: string; now?: () => number } = {}) {
  const router = Router();
  const now = opts.now ?? (() => Date.now());
  const base = (opts.publicUrl ?? process.env.MUSTER_PUBLIC_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
  const hits = new Map<string, number[]>();
  const limited = (key: string, max: number) => {
    const t = now();
    const list = (hits.get(key) ?? []).filter((x) => t - x < WINDOW_MS);
    list.push(t);
    hits.set(key, list);
    return list.length > max;
  };

  router.post('/forgot-password', async (req, res, next) => {
    try {
      const parsed = z.object({ email: z.string().email().max(254) }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Enter a valid email address.' });
        return;
      }
      const email = parsed.data.email.trim().toLowerCase();
      if (limited(`e:${email}`, MAX_PER_EMAIL) || limited(`c:${req.ip ?? 'unknown'}`, MAX_PER_CLIENT)) {
        res.status(429).json({ error: 'Too many reset requests. Try again in 15 minutes.' });
        return;
      }
      const user = (await db.user.findUnique({ where: { email } })) ?? (await db.user.findUnique({ where: { email: parsed.data.email.trim() } }));
      if (user && !user.disabled_at) {
        const token = randomBytes(32).toString('base64url');
        await db.$transaction(async (tx) => {
          await tx.passwordReset.updateMany({ where: { user_id: user.id, used_at: null }, data: { used_at: new Date(now()) } });
          await tx.passwordReset.create({ data: { user_id: user.id, token_hash: sha256(token), expires_at: new Date(now() + RESET_TTL_MS) } });
        });
        const link = `${base}/#/reset-password?token=${token}`;
        const outcome = await mailer({
          to: user.email,
          subject: 'Reset your CES password',
          text: `A password reset was requested for your CES account.\n\nOpen this link within 30 minutes to choose a new password:\n${link}\n\nIf you did not ask for this, ignore this email; your password stays the same.`,
        }).catch(() => 'failed' as const);
        await audit(db, { action: 'auth.password_reset_requested', actor: { sub: user.id, role: user.role }, target_type: 'user', target_id: user.id, tenant_id: user.tenant_id, detail: { delivery: outcome } });
      } else {
        await audit(db, { action: 'auth.password_reset_requested_unknown', detail: { email } });
      }
      res.status(202).json(GENERIC);
    } catch (err) {
      next(err);
    }
  });

  router.post('/reset-password', async (req, res, next) => {
    try {
      const parsed = z.object({ token: z.string().min(20).max(200), new_password: z.string() }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'This reset link is not valid.', code: 'RESET_INVALID' });
        return;
      }
      const row = await db.passwordReset.findUnique({ where: { token_hash: sha256(parsed.data.token) } });
      const user = row ? await db.user.findUnique({ where: { id: row.user_id } }) : null;
      if (!row || row.used_at || new Date(row.expires_at).getTime() < now() || !user || user.disabled_at) {
        res.status(400).json({ error: 'This reset link has expired or was already used. Ask for a new one.', code: 'RESET_INVALID' });
        return;
      }
      const problem = passwordProblem(parsed.data.new_password, user.email);
      if (problem) {
        res.status(400).json({ error: problem, code: 'PASSWORD_RULE' });
        return;
      }
      const password_hash = await bcrypt.hash(parsed.data.new_password, 10);
      await db.$transaction(async (tx) => {
        await tx.passwordReset.update({ where: { id: row.id }, data: { used_at: new Date(now()) } });
        await tx.user.update({ where: { id: user.id }, data: { password_hash, must_change_password: false, password_changed_at: new Date(now()) } });
        await audit(tx as AuditDb, { action: 'auth.password_reset', actor: { sub: user.id, role: user.role }, target_type: 'user', target_id: user.id, tenant_id: user.tenant_id }, { strict: true });
      });
      res.json({ ok: true, message: 'Your password has been changed. Sign in with your new password.' });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
