// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// requestLog.ts — Sprint 2 (LOG-02): one structured line per HTTP request and a
// request id on every response.
//
//   X-Request-Id: taken from the incoming header when a proxy already set one
//   (deploy/nginx), otherwise a fresh UUID. Echoed back on the response and
//   attached to `req.id` / `req.log` so route code and the error handler can
//   correlate: `req.log.warn({ engagementId }, 'not found')`.
//
// What is logged: method, path (no query string — it can carry search text),
// status, duration, client ip, the signed-in user's id/role/tenant (set by
// bearerAuth, so only present after it ran) and the request id. Never the body
// or headers (AU 3.3.1 wants accountability, not content).
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger, type Logger } from '../lib/logger.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** Request id (X-Request-Id). */
    id?: string;
    /** Child logger carrying the request id. */
    log?: Logger;
  }
}

export const REQUEST_ID_HEADER = 'x-request-id';

/** Paths that are hit constantly by probes; logged at debug so info logs stay readable. */
const QUIET_PATHS = new Set(['/healthz', '/readyz']);

function validRequestId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= 128 && /^[A-Za-z0-9._-]+$/.test(v);
}

export function requestLog(log: Logger = logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const id = validRequestId(incoming) ? incoming : randomUUID();
    req.id = id;
    req.log = log.child({ requestId: id });
    res.setHeader('X-Request-Id', id);
    const started = process.hrtime.bigint();

    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const user = req.user;
      const fields = {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Math.round(ms * 10) / 10,
        ip: req.ip,
        userId: user?.sub,
        role: user?.role,
        tenantId: user?.tenant_id,
      };
      const quiet = QUIET_PATHS.has(req.path);
      if (res.statusCode >= 500) req.log!.error(fields, 'request failed');
      else if (res.statusCode >= 400) req.log!.warn(fields, 'request rejected');
      else if (quiet) req.log!.debug(fields, 'request');
      else req.log!.info(fields, 'request');
    });

    next();
  };
}
