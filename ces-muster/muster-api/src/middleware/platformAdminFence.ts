// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// platformAdminFence.ts — RBAC-01: a platform administrator has no access to
// customer data (BHD role review PB-01, PB-03).
//
// Every customer-data route already names its roles in requireRole(...), and
// none names platform_admin. This fence is the second wall: mounted on /api,
// it refuses a platform_admin token on anything outside user administration and CES-Shared (S1.1),
// including routes that check only bearerAuth (for example POST /api/sprs/score)
// and any route added later that forgets a role list.
import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../lib/jwt.js';

/** Paths under /api a platform administrator may use. */
/** S1.1: plus CES-Shared — reference content, no customer data (Role Permission Matrix: the
 * Platform Administrator administers shared reference data). */
/** S1.8: plus /portfolio, which answers a platform administrator with counts only (doc 28 D-1). */
export const PLATFORM_ADMIN_PATHS = ['/users', '/audit-events', '/v1/ces-shared', '/portfolio'];

export function platformAdminFence(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  let role: string | undefined;
  try {
    role = verifyToken(header.slice(7)).role;
  } catch {
    // Invalid tokens are answered by bearerAuth on the route itself.
    return next();
  }
  if (role !== 'platform_admin') return next();
  const allowed = PLATFORM_ADMIN_PATHS.some((p) => req.path === p || req.path.startsWith(`${p}/`));
  if (allowed) return next();
  res.status(403).json({
    error: 'Platform administrators have no access to customer data',
    code: 'PLATFORM_ADMIN_FENCED',
  });
}
