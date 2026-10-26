// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// cesShared.ts — S1.1 (doc 26): /api/v1/ces-shared.
//
//   Read (every signed-in role, permission shared.read):
//     GET  /requirements            110 requirements + published metadata (filters, paging)
//     GET  /requirements/:controlId one requirement (+ metadata draft for editors)
//     GET  /families                14 families
//     GET  /items/:kind             archetypes, mappings, rules, requirement metadata
//     GET  /items/:kind/:key        one item: versions + change history
//     GET  /changes                 change log
//     GET  /summary                 counts for the Overview page
//   Edit (platform_admin, permissions shared.edit / shared.approve):
//     POST   /items/:kind                 create a draft of a new item
//     PUT    /items/:kind/:key            create or update the draft of an item
//     DELETE /items/:kind/:key/draft      discard the draft
//     POST   /items/:kind/:key/publish    publish the draft (not by its author)
//     POST   /items/:kind/:key/retire     retire the published version
//     GET    /export                      published content as one JSON release
//
// Locked: requirement ID, text, family, level and DoD weight have no write route.
// Errors use the envelope { error: { code, message, details, requestId } }
// (Tech Arch V1.1 §2.5).
import { Router, type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { bearerAuth, requireRole } from '../middleware/auth.js';
import { createSharedService, SharedError, type SharedDb } from '../cesShared/service.js';
import { FAMILIES, REFERENCE_VERSION, REQUIREMENTS } from '../cesShared/reference.js';
import { isKind, type Kind } from '../cesShared/schemas.js';

const READ_ROLES = ['platform_admin', 'bhd_operator', 'prime', 'sub', 'assessor_read_only'];
const EDIT_ROLES = ['platform_admin'];

function fail(res: Response, status: number, code: string, message: string, details?: Record<string, unknown>) {
  res.status(status).json({ error: { code, message, ...(details ? { details } : {}), requestId: randomUUID() } });
}

type Handler = (req: Request, res: Response) => Promise<void>;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).catch((err) => {
    if (err instanceof SharedError) return fail(res, err.status, err.code, err.message, err.details);
    next(err);
  });

function kindParam(req: Request, res: Response): Kind | null {
  const k = req.params.kind;
  if (!isKind(k)) {
    fail(res, 404, 'UNKNOWN_KIND', 'Unknown item kind', { kind: k, kinds: ['requirement_meta', 'archetype', 'mapping', 'rule'] });
    return null;
  }
  return k;
}

const actorOf = (req: Request) => ({ sub: req.user!.sub, role: req.user!.role });
const isEditor = (req: Request) => EDIT_ROLES.includes(req.user?.role ?? '');

export function createCesSharedRouter(db: SharedDb): Router {
  const svc = createSharedService(db);
  const router = Router();
  router.use(bearerAuth);

  const read = requireRole(...READ_ROLES);
  const edit = requireRole(...EDIT_ROLES);

  router.get('/families', read, (_req, res) => {
    res.json({ data: FAMILIES, meta: { totalItems: FAMILIES.length, referenceVersion: REFERENCE_VERSION } });
  });

  router.get(
    '/requirements',
    read,
    wrap(async (req, res) => {
      const q = req.query as Record<string, string | undefined>;
      const page = Number(q.page ?? 1);
      const pageSize = Number(q.pageSize ?? 20);
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) {
        return fail(res, 400, 'INVALID_PAGING', 'page must be ≥ 1 and pageSize 1–200');
      }
      const meta = new Map((await svc.list('requirement_meta')).filter((v) => v.current).map((v) => [v.key, v.current!]));
      const needle = (q.search ?? '').trim().toLowerCase();
      let rows = REQUIREMENTS.map((r) => ({ ...r, metadata: meta.get(r.controlId) ?? null }));
      rows = rows.filter(
        (r) =>
          (!q.family || r.family.code === q.family) &&
          (!q.level || r.level === q.level) &&
          (!q.type || r.requirementType === q.type) &&
          (!q.weight || String(r.sprs.weight) === q.weight) &&
          (!q.priority || (q.priority === 'unset' ? !r.metadata?.priority : r.metadata?.priority === q.priority)) &&
          (!q.module || ((r.metadata?.modules as string[] | undefined) ?? []).includes(q.module)) &&
          (!needle ||
            r.controlId.toLowerCase().includes(needle) ||
            r.nistRef.startsWith(needle) ||
            r.practice.toLowerCase().includes(needle) ||
            (r.nistText ?? '').toLowerCase().includes(needle))
      );
      const totalItems = rows.length;
      res.json({
        data: rows.slice((page - 1) * pageSize, page * pageSize),
        pagination: { page, pageSize, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / pageSize)) },
        meta: { source: 'ces-shared', referenceVersion: REFERENCE_VERSION },
      });
    })
  );

  router.get(
    '/requirements/:controlId',
    read,
    wrap(async (req, res) => {
      const r = REQUIREMENTS.find((x) => x.controlId === req.params.controlId);
      if (!r) return fail(res, 404, 'REQUIREMENT_NOT_FOUND', 'The requested requirement was not found.', { controlId: req.params.controlId });
      const view = (await svc.list('requirement_meta')).find((v) => v.key === r.controlId);
      res.json({
        data: { ...r, metadata: view?.current ?? null, ...(isEditor(req) ? { metadataDraft: view?.draft ?? null } : {}) },
        meta: { referenceVersion: REFERENCE_VERSION },
      });
    })
  );

  router.get(
    '/items/:kind',
    read,
    wrap(async (req, res) => {
      const kind = kindParam(req, res);
      if (!kind) return;
      let views = await svc.list(kind);
      // Readers see published content only; editors also see drafts and retired items.
      if (!isEditor(req)) views = views.filter((v) => v.published).map((v) => ({ ...v, draft: null }));
      res.json({ data: views, meta: { totalItems: views.length } });
    })
  );

  router.get(
    '/items/:kind/:key',
    read,
    wrap(async (req, res) => {
      const kind = kindParam(req, res);
      if (!kind) return;
      const item = await svc.get(kind, req.params.key);
      if (!isEditor(req)) {
        if (!item.published) return fail(res, 404, 'ITEM_NOT_FOUND', 'No such item', { kind, key: req.params.key });
        return void res.json({ data: { ...item, draft: null, versions: item.versions.filter((v) => v.status !== 'draft'), changes: [] } });
      }
      res.json({ data: item });
    })
  );

  router.get(
    '/changes',
    read,
    wrap(async (req, res) => {
      const q = req.query as Record<string, string | undefined>;
      const data = await svc.changes({ kind: q.kind, key: q.key, limit: q.limit ? Number(q.limit) : undefined });
      res.json({ data });
    })
  );

  router.get(
    '/summary',
    read,
    wrap(async (_req, res) => {
      res.json({
        data: {
          requirements: REQUIREMENTS.length,
          families: FAMILIES.length,
          referenceVersion: REFERENCE_VERSION,
          items: await svc.summary(),
          recentChanges: await svc.changes({ limit: 10 }),
        },
      });
    })
  );

  router.post(
    '/items/:kind',
    edit,
    wrap(async (req, res) => {
      const kind = kindParam(req, res);
      if (!kind) return;
      res.status(201).json({ data: await svc.saveDraft(kind, req.body, actorOf(req), { create: true }) });
    })
  );

  router.put(
    '/items/:kind/:key',
    edit,
    wrap(async (req, res) => {
      const kind = kindParam(req, res);
      if (!kind) return;
      res.json({ data: await svc.saveDraft(kind, req.body, actorOf(req), { create: false, key: req.params.key }) });
    })
  );

  router.delete(
    '/items/:kind/:key/draft',
    edit,
    wrap(async (req, res) => {
      const kind = kindParam(req, res);
      if (!kind) return;
      await svc.deleteDraft(kind, req.params.key, actorOf(req));
      res.status(204).end();
    })
  );

  router.post(
    '/items/:kind/:key/publish',
    edit,
    wrap(async (req, res) => {
      const kind = kindParam(req, res);
      if (!kind) return;
      res.json({ data: await svc.publish(kind, req.params.key, actorOf(req)) });
    })
  );

  router.post(
    '/items/:kind/:key/retire',
    edit,
    wrap(async (req, res) => {
      const kind = kindParam(req, res);
      if (!kind) return;
      res.json({ data: await svc.retire(kind, req.params.key, actorOf(req)) });
    })
  );

  router.get(
    '/export',
    edit,
    wrap(async (_req, res) => {
      const release = await svc.exportRelease();
      res.setHeader('Content-Disposition', `attachment; filename="ces-shared-release-${release.exported_at.slice(0, 10)}.json"`);
      res.json(release);
    })
  );

  return router;
}
