// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

import express, { Request, Response, NextFunction } from 'express';
import authRouter from './routes/auth.js';
import { createPasswordResetRouter, type ResetDb } from './routes/passwordReset.js';
import { createMailer } from './lib/mailer.js';
import { createEngagementsRouter } from './routes/engagements.js';
import { createPortfolioRouter } from './routes/portfolio.js';
import { createPartiesRouter, createPartyRouter } from './routes/parties.js';
import { createContractsRouter } from './routes/contracts.js';
import { createSessionsRouter } from './routes/sessions.js';
import { createActionsRouter } from './routes/actions.js';
import { createHilRouter } from './routes/hil.js';
import { createTouchRouter } from './routes/touch.js';
import createNudgesRouter from './routes/nudges.js';
import interviewRouter from './routes/interview.js';
import coachRouter from './routes/coach.js';
import { createHarvestRouter } from './routes/harvest.js';
import sprsRouter from './routes/sprs.js';
import recipesRouter from './routes/recipes.js';
import reassessmentRouter from './routes/reassessment.js';
import { createDeliveryRouter, createPortalRouter } from './routes/delivery.js';
import { createPlanRouter } from './routes/plan.js';
import { createDiscoveryRouter } from './routes/discovery.js';
import { createLiveRouter } from './routes/live.js';
import { LiveConsentService, prismaLiveAccessStore, type LiveGate } from './services/liveAccess.js';
import { db } from './lib/prisma.js';
import { createUsersRouter, createAuditRouter, type UsersDb } from './routes/users.js';
import { platformAdminFence } from './middleware/platformAdminFence.js';
import { createCesSharedRouter } from './routes/cesShared.js';
import type { SharedDb } from './cesShared/service.js';
import { logger } from './lib/logger.js';
import { requestLog } from './middleware/requestLog.js';
import { createHealthRouter } from './routes/health.js';
import { createApiDocsRouter } from './routes/apiDocs.js';

/** Body limit for the plan push (MP + TM in one JSON body). */
export const PLAN_BODY_LIMIT = '25mb';

const DEFAULT_CORS_ORIGINS = ['http://localhost:5173', 'http://localhost:4173'];

/**
 * Localhost-only CORS allowlist. Origins come from MUSTER_CORS_ORIGINS
 * (comma-separated) or default to the Vite dev/preview ports. A request from
 * any other origin gets no CORS headers, so the browser blocks it.
 */
export function localCors() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const allowed = (process.env.MUSTER_CORS_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    const origins = allowed.length > 0 ? allowed : DEFAULT_CORS_ORIGINS;
    const origin = req.headers.origin;
    if (origin && origins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
    }
    next();
  };
}

export interface AppOptions {
  /** FC-MU-2: the live gate (engagement flag + device-code consent). Default:
   * the Prisma engagement store + an in-memory consent service. Tests inject
   * one built on mockDb and a fake device-code transport. */
  live?: LiveGate;
}

export function createApp(opts: AppOptions = {}) {
  const app = express();
  // DEP-01: behind a reverse proxy (nginx in deploy/), set MUSTER_TRUST_PROXY=1
  // so req.ip is the browser's address and the per-client sign-in limit is not
  // shared by everyone. Off by default: never trust X-Forwarded-For unasked.
  const trustProxy = process.env.MUSTER_TRUST_PROXY;
  if (trustProxy) app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
  // FC-MU-2 (MU-03/MU-06 live): ONE gate shared by /api/live, discovery and
  // harvest, so a consent granted on /api/live is the one the reads check.
  const liveStore = opts.live?.store ?? prismaLiveAccessStore(db);
  const live: LiveGate = opts.live ?? { store: liveStore, consent: new LiveConsentService(liveStore) };

  // FX-MU1: the Plan tab calls muster-api from the browser (Vite dev 5173 /
  // preview 4173), so a localhost-only CORS allowlist answers the preflight
  // that Authorization + JSON triggers. Sim only: no non-localhost default.
  // Sprint 2 LOG-02 / OPS-01: request id + one log line per request, then the
  // unauthenticated liveness/readiness probes (before every /api fence).
  app.use(requestLog(logger));
  app.use(createHealthRouter(db));
  // Sprint 2 DOC-01: Swagger UI + OpenAPI JSON, only when API_DOCS=1 (off in production).
  app.use(createApiDocsRouter());

  app.use(localCors());

  // MS-R5 / FX-MU1: plan push — writes artifacts to Stamper's plans folder.
  // Mounted BEFORE the global express.json(): a generated Mission Plan is
  // ~2.5MB compact, far over the global parser's 100kb default, and the first
  // body parser to run wins (the global one would 413 the push).
  // RBAC-01: platform administrators reach only user administration under
  // /api. Mounted before every /api router, including the plan push below.
  app.use('/api', platformAdminFence);

  app.use('/api/plan', express.json({ limit: PLAN_BODY_LIMIT }), createPlanRouter());

  app.use(express.json());

  // Auth (keep as-is)
  // S1.9: forgot / reset password (decision D3).
  app.use('/auth', createPasswordResetRouter(db as unknown as ResetDb, createMailer()));
  app.use('/auth', authRouter);

  app.use('/api/users', createUsersRouter(db as unknown as UsersDb));
  app.use('/api/audit-events', createAuditRouter(db as unknown as UsersDb));
  // S1.1 (doc 26): CES-Shared reference data and governed content.
  app.use('/api/v1/ces-shared', createCesSharedRouter(db as unknown as SharedDb));

  // API routes
  app.use('/api/portfolio', createPortfolioRouter(db));
  app.use('/api/engagements', createEngagementsRouter(db));
  // Parties sub-resource of engagements (mergeParams picks up :engagementId)
  app.use('/api/engagements/:engagementId/parties', createPartiesRouter(db));
  // Individual party read + sub self-only guard
  app.use('/api/parties', createPartyRouter(db));
  // Party actions (mergeParams picks up :id from parent path)
  app.use('/api/parties/:id/actions', createActionsRouter(db));
  app.use('/api/contracts', createContractsRouter(db));
  app.use('/api/sessions', createSessionsRouter(db));
  app.use('/api/hil', createHilRouter(db));
  app.use('/api/touch', createTouchRouter(db));
  app.use('/api/nudges', createNudgesRouter(db));
  app.use('/api/interview', interviewRouter);
  app.use('/api/coach', coachRouter);
  app.use('/api/harvest', createHarvestRouter(undefined, undefined, { live }));
  app.use('/api/sprs', sprsRouter);
  app.use('/api/recipes', recipesRouter);
  app.use('/api/reassessment', reassessmentRouter);
  // W4-MU2 (MU-02): the SPA's "Run discovery" — sim-only discovery run jobs.
  app.use('/api/discovery', createDiscoveryRouter({ live }));
  // FC-MU-2: the per-engagement live flag + device-code consent (OFF by default).
  app.use('/api/live', createLiveRouter(live));
  // GP-MUSTER-2 M2: delivery portal — operator lane + grantee download lane.
  app.use('/api/delivery', createDeliveryRouter(db));
  app.use('/portal', createPortalRouter(db));

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Error handler
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    (req.log ?? logger).error({ err }, 'unhandled error');
    // The request id lets support match a user's report to the log line
    // without exposing the stack.
    res.status(500).json({ error: 'Internal server error', requestId: req.id });
  });

  return app;
}

export const app = createApp();
