// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// audit.ts — RBAC-01: write one row to the append-only audit_events table
// (migration 009). Never stores a password, hash or token.
import type { JwtPayload } from './jwt.js';
import { logger } from './logger.js';

export interface AuditInput {
  action: string;
  actor?: Pick<JwtPayload, 'sub' | 'role'> | null;
  target_type?: string;
  target_id?: string;
  tenant_id?: string | null;
  detail?: Record<string, unknown>;
}

export interface AuditDb {
  auditEvent: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
}

/**
 * Records an audit event. `strict` callers (user administration) let a failure
 * fail the request: a change that cannot be audited must not happen silently.
 * Sign-in events are best-effort so an audit outage does not lock everyone out.
 */
export async function audit(db: AuditDb, input: AuditInput, opts: { strict?: boolean } = {}): Promise<void> {
  const data = {
    action: input.action,
    actor_user_id: input.actor?.sub ?? null,
    actor_role: input.actor?.role ?? null,
    target_type: input.target_type ?? null,
    target_id: input.target_id ?? null,
    tenant_id: input.tenant_id ?? null,
    detail: input.detail ?? undefined,
  };
  try {
    await db.auditEvent.create({ data });
  } catch (err) {
    if (opts.strict) throw err;
    logger.error({ err, action: input.action }, 'audit write failed');
  }
}
