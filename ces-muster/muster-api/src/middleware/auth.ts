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
