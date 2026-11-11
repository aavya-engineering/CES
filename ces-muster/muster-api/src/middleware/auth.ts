// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

import { Request, Response, NextFunction } from 'express';
import { verifyToken, JwtPayload } from '../lib/jwt.js';
import { effectiveRoles } from '../lib/permissions.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: JwtPayload;
  }
}

export function bearerAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }
  const token = header.slice(7);
  let claims;
  try {
    claims = verifyToken(token);
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
  // RBAC-01: a token issued with a temporary password only opens /auth/*
  // (change-password, me). Everything else waits for the new password.
  if (claims.pwd_change_required && !req.originalUrl.startsWith('/auth/')) {
    res.status(403).json({ error: 'Change your temporary password first', code: 'PASSWORD_CHANGE_REQUIRED' });
    return;
  }
  req.user = claims;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Sprint 1 Foundation: a platform role acts as the engine roles it inherits (permissions.ts ROLE_INHERITS).
    if (!req.user || !effectiveRoles(req.user.role).some((r) => roles.includes(r))) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Lifecycle action guard (2026-11-11, review finding I3). requireRole() only
// checks engine-role inheritance, so org_admin (→ prime) could execute AdminOps
// or override results although the role matrix the UI shows says "view". This
// guard enforces PLATFORM_ROLE_MATRIX server-side for the platform roles:
//   GET/HEAD → view · POST/PATCH/PUT/DELETE → edit, unless the path matches an
//   `approve` or `execute` pattern. Engine roles (prime, sub) have no matrix row
//   and keep the requireRole() behaviour; platform_admin is fenced elsewhere.
import { PLATFORM_ROLE_MATRIX, PLATFORM_ONLY_ROLES, type LifecycleAction, type LifecycleScope } from '../lib/permissions.js';

export interface ActionRules { approve?: RegExp[]; execute?: RegExp[]; admin?: RegExp[]; /** Paths that are reads despite POST (exports, validators). */ view?: RegExp[] }
const MATRIX_ROLES = new Set<string>([...PLATFORM_ONLY_ROLES, 'bhd_operator', 'assessor_read_only']);

/** Express routers here are not strict/case-sensitive, so `…/approve/` and `…/APPROVE` reach the same handler as
 *  `…/approve`. Classify (and resolve scopes) on a canonical path, or the guard would call them `edit`. */
export const canonicalPath = (path: string) => (path.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/').toLowerCase();

export function actionFor(method: string, rawPath: string, rules: ActionRules = {}): LifecycleAction {
  const m = method.toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return 'view';
  const path = canonicalPath(rawPath);
  const hit = (list?: RegExp[]) => !!list?.some((re) => re.test(path));
  if (hit(rules.view)) return 'view';
  if (hit(rules.admin)) return 'admin';
  if (hit(rules.approve)) return 'approve';
  if (hit(rules.execute)) return 'execute';
  return 'edit';
}

/** `scopeOrFn` may resolve to several scopes: the action passes when ANY of them allows it (the route then applies its own module-specific rule). */
export function requireAction(scopeOrFn: LifecycleScope | ((req: Request, path: string) => LifecycleScope | LifecycleScope[]), rules: ActionRules = {}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.user?.role;
    if (!role || !MATRIX_ROLES.has(role)) { next(); return; } // engine roles: requireRole() decides
    const resolved = typeof scopeOrFn === 'function' ? scopeOrFn(req, canonicalPath(req.path)) : scopeOrFn;
    const scopes = Array.isArray(resolved) ? resolved : [resolved];
    const action = actionFor(req.method, req.path, rules);
    const ok = scopes.some((scope) => (PLATFORM_ROLE_MATRIX[scope]?.[role as keyof typeof PLATFORM_ROLE_MATRIX[typeof scope]] ?? []).includes(action));
    if (!ok) {
      res.status(403).json({ error: `Your role (${role}) may not ${action} in ${scopes.join(' / ')}`, code: 'ROLE_MATRIX', scope: scopes[0], action });
      return;
    }
    next();
  };
}
