// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// adminApi.ts — RBAC-01: the SPA side of user administration and the role
// catalogue (muster-api/src/routes/users.ts, routes/auth.ts). Network-optional:
// only the Platform pages and Change password call it (DW#5 unaffected).
import { api, type ApiResult } from './musterApi';
import { getAuthBase } from './musterAuth';
import { getMusterToken } from './musterToken';

export interface AdminUser {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  tenant_id: string;
  organization: string | null;
  party_id: string | null;
  disabled: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
}

export interface RoleInfo {
  id: string;
  label: string;
  description: string;
}

export interface PermissionInfo {
  id: string;
  group: string;
  label: string;
  roles: string[];
  enforcedAt: string;
}

export interface AuditEvent {
  id: string;
  at: string;
  action: string;
  actor_user_id: string | null;
  actor_role: string | null;
  target_type: string | null;
  target_id: string | null;
  detail?: Record<string, unknown> | null;
}

export type NewUser = {
  email: string;
  role: string;
  display_name?: string;
} & ({ tenant_id: string } | { organization_name: string });

export const adminApi = {
  listUsers: () => api.get<{ users: AdminUser[] }>('/users'),
  listOrganizations: () => api.get<{ organizations: Organization[] }>('/users/organizations'),
  createUser: (body: NewUser) => api.post<{ user: AdminUser; temporary_password: string }>('/users', body),
  updateUser: (id: string, body: { role?: string; display_name?: string | null; disabled?: boolean }) =>
    api.patch<{ user: AdminUser }>(`/users/${encodeURIComponent(id)}`, body),
  resetPassword: (id: string) => api.post<{ temporary_password: string }>(`/users/${encodeURIComponent(id)}/reset-password`),
  auditEvents: (limit = 100) => api.get<{ events: AuditEvent[] }>(`/audit-events?limit=${limit}`),
};

/** /auth/* lives beside /api, so these use the auth base directly. */
async function authRequest<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<ApiResult<T>> {
  const token = getMusterToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${getAuthBase()}/auth${path}`, {
      method,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, status: res.status, degraded: false, ...(typeof json.error === 'string' ? { error: json.error } : {}) };
    }
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, status: 0, degraded: true };
  } finally {
    clearTimeout(timer);
  }
}

export const authApi = {
  roles: () => authRequest<{ roles: RoleInfo[]; permissions: PermissionInfo[] }>('GET', '/roles'),
  changePassword: (current_password: string, new_password: string) =>
    authRequest<{ token: string }>('POST', '/change-password', { current_password, new_password }),
};

/** Plain-language failure text for admin calls. */
export function adminFailure(r: { status: number; error?: string }): string {
  if (r.status === 0) return 'muster-api is not reachable.';
  if (r.status === 401) return 'Your session has ended. Sign in again.';
  if (r.status === 403) return 'Your role cannot do this.';
  return r.error ?? `muster-api returned ${r.status}.`;
}
