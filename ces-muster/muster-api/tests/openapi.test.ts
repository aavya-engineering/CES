// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// Sprint 2 DOC-01: the OpenAPI document is well-formed, every documented
// operation is complete, and /api-docs is gated by API_DOCS.
import { describe, it, expect, afterAll } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { buildOpenApiSpec } from '../src/lib/openapi.js';
import { apiDocsEnabled, createApiDocsRouter } from '../src/routes/apiDocs.js';

describe('OpenAPI document', () => {
  const spec = buildOpenApiSpec({ CES_VERSION: 'v-test' });

  it('is OpenAPI 3.0 with bearer auth and the key paths', () => {
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info.version).toBe('v-test');
    expect(spec.components?.securitySchemes).toHaveProperty('bearerAuth');
    for (const p of ['/healthz', '/auth/login', '/auth/forgot-password', '/api/users', '/api/v1/ces-shared/requirements', '/api/portfolio', '/api/engagements/{id}/milestones/{mid}']) {
      expect(spec.paths, p).toHaveProperty(p);
    }
  });

  it('every operation has a tag, a summary, responses, and every $ref resolves', () => {
    const schemas = Object.keys(spec.components?.schemas ?? {});
    const refs = JSON.stringify(spec).match(/#\/components\/schemas\/([A-Za-z]+)/g) ?? [];
    for (const r of refs) expect(schemas, r).toContain(r.split('/').pop());
    for (const [path, item] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(item ?? {})) {
        if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
        const o = op as { tags?: string[]; summary?: string; responses?: object; security?: unknown[] };
        expect(o.tags?.length, `${method} ${path} tags`).toBeGreaterThan(0);
        expect(o.summary, `${method} ${path} summary`).toBeTruthy();
        expect(Object.keys(o.responses ?? {}).length, `${method} ${path} responses`).toBeGreaterThan(0);
        if (path.startsWith('/api/') || path.startsWith('/auth/me')) expect(o.security, `${method} ${path} security`).toBeTruthy();
      }
      // path params declared for every {param}
      for (const m of path.matchAll(/\{(\w+)\}/g)) {
        for (const op of Object.values(item ?? {})) {
          const params = (op as { parameters?: { name: string; in: string }[] }).parameters ?? [];
          expect(params.some((p) => p.in === 'path' && p.name === m[1]), `${path} declares {${m[1]}}`).toBe(true);
        }
      }
    }
  });

  it('is off unless API_DOCS=1', () => {
    expect(apiDocsEnabled({})).toBe(false);
    expect(apiDocsEnabled({ API_DOCS: '0' })).toBe(false);
    expect(apiDocsEnabled({ API_DOCS: '1' })).toBe(true);
  });
});

describe('/api-docs routes', () => {
  function serve(env: NodeJS.ProcessEnv) {
    const app = express();
    app.use(createApiDocsRouter(env));
    app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
    const server = app.listen(0);
    return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
  }
  const servers: ReturnType<typeof serve>[] = [];
  afterAll(() => servers.forEach((s) => s.server.close()));

  it('404 when disabled', async () => {
    const s = serve({ API_DOCS: '0', CES_ENV: 'production' });
    servers.push(s);
    expect((await fetch(`${s.base}/api-docs.json`)).status).toBe(404);
    expect((await fetch(`${s.base}/api-docs/`)).status).toBe(404);
  });

  it('serves the JSON and the UI when enabled', async () => {
    const s = serve({ API_DOCS: '1', CES_ENV: 'staging' });
    servers.push(s);
    const res = await fetch(`${s.base}/api-docs.json`);
    expect(res.status).toBe(200);
    expect((await res.json()).openapi).toBe('3.0.3');
    const ui = await fetch(`${s.base}/api-docs/`);
    expect(ui.status).toBe(200);
    expect(await ui.text()).toContain('swagger-ui');
  });
});
