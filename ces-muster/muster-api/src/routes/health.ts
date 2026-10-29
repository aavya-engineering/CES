// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// health.ts — Sprint 2 (OPS-01): liveness and readiness for the proxy, Docker
// healthchecks and uptime monitors. Unauthenticated on purpose; they reveal
// nothing but "up" and the deployed version.
//
//   GET /healthz  → 200 {status:"ok"}            process is serving requests
//   GET /readyz   → 200 {status:"ok", db:"ok"}   and the database answers
//                 → 503 {status:"degraded", db:"unreachable"}
import { Router, type Request, type Response } from 'express';

export interface HealthDb {
  $queryRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
}

export function createHealthRouter(db: HealthDb, env: NodeJS.ProcessEnv = process.env): Router {
  const r = Router();
  const version = env.CES_VERSION ?? 'dev';

  r.get('/healthz', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ status: 'ok', version });
  });

  r.get('/readyz', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', db: 'ok', version });
    } catch (err) {
      req.log?.error({ err }, 'readiness check: database unreachable');
      res.status(503).json({ status: 'degraded', db: 'unreachable', version });
    }
  });

  return r;
}
