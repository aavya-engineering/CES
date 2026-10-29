// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// apiDocs.ts — Sprint 2 (DOC-01): Swagger UI at /api-docs and the raw
// OpenAPI document at /api-docs.json.
//
//   API_DOCS=1   switches both routes on (development and staging templates);
//                the production template keeps them off (404). The document
//                lists routes and shapes only — no data, no secrets — so the
//                flag is the whole gate; there is no per-user guard, because
//                the UI page embeds the document anyway.
//
// The spec itself is src/lib/openapi.ts.
import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiSpec } from '../lib/openapi.js';

export function apiDocsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.API_DOCS === '1' || env.API_DOCS === 'true';
}

export function createApiDocsRouter(env: NodeJS.ProcessEnv = process.env): Router {
  const r = Router();
  if (!apiDocsEnabled(env)) return r; // nothing mounted → 404 like any unknown path

  const spec = buildOpenApiSpec(env);

  r.get('/api-docs.json', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(spec);
  });

  r.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(spec, {
      customSiteTitle: 'CES muster-api',
      swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
    })
  );
  return r;
}
