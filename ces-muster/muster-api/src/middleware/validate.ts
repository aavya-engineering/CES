// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// validate.ts — Sprint 2 (VAL-01): one way to validate a request with zod and
// answer with the standard error envelope (docs/CONVENTIONS.md §2).
//
//   router.post('/', bearerAuth, validate(createSchema), (req, res) => {
//     const body = req.body as z.infer<typeof createSchema>;   // parsed + typed
//   });
//   router.get('/', validate(listQuery, 'query'), …)
//
// On failure: 422 { error: 'Validation failed', code: 'VALIDATION_ERROR',
// details: [{ path: 'email', message: 'Invalid email' }] }. Existing routes
// that answer 400 with zod's flatten() keep doing so until they are touched.
// On success the parsed value (with defaults and transforms applied) replaces
// req.body / req.query / req.params, so handlers never see raw input.
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { ZodTypeAny, ZodError } from 'zod';

export type RequestPart = 'body' | 'query' | 'params';

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationErrorBody {
  error: 'Validation failed';
  code: 'VALIDATION_ERROR';
  part: RequestPart;
  details: ValidationIssue[];
}

export function issuesOf(err: ZodError): ValidationIssue[] {
  return err.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message }));
}

export function validate(schema: ZodTypeAny, part: RequestPart = 'body'): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part]);
    if (!result.success) {
      const body: ValidationErrorBody = { error: 'Validation failed', code: 'VALIDATION_ERROR', part, details: issuesOf(result.error) };
      req.log?.warn({ part, details: body.details }, 'request validation failed');
      res.status(422).json(body);
      return;
    }
    // Express 4 lets us assign; query/params objects are plain.
    (req as unknown as Record<RequestPart, unknown>)[part] = result.data;
    next();
  };
}
