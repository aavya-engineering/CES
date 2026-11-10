// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// onboardApi.ts — Sprint 3 slice "Onboard": typed client for muster-api
// /api/organizations, /api/customer-tenants and /api/engagements/:id/scope.

import { api, type ApiResult } from '@/shared/api/musterApi';

export const CONTRACT_CLAUSES = ['DFARS 252.204-7012', 'DFARS 252.204-7019', 'DFARS 252.204-7020', 'DFARS 252.204-7021', 'FAR 52.204-21'] as const;
export type ContractClause = (typeof CONTRACT_CLAUSES)[number];

export interface Organization {
  id: string;
  legal_name: string;
  dba_name: string | null;
  uei: string | null;
  cage: string | null;
  website: string | null;
  address: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  contract_clauses: ContractClause[];
  status: 'active' | 'inactive';
  notes: string | null;
  created_at: string;
  updated_at: string;
  customer_tenants?: CustomerTenant[];
}
export type OrganizationInput = Omit<Organization, 'id' | 'created_at' | 'updated_at' | 'customer_tenants'>;

export type CustomerCloud = 'gcc_high' | 'gcc' | 'commercial';
export type CustomerTenantStatus = 'registered' | 'consented' | 'live_enabled' | 'disabled';
export interface CustomerTenant {
  id: string;
  organization_id: string | null;
  display_name: string;
  entra_tenant_id: string | null;
  primary_domain: string | null;
  cloud: CustomerCloud;
  app_registration_id: string | null;
  certificate_thumbprint: string | null;
  status: CustomerTenantStatus;
  connection_status: 'prerequisites_complete' | 'prerequisites_missing' | null;
  connection_tested_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
export type CustomerTenantInput = Omit<CustomerTenant, 'id' | 'created_at' | 'updated_at' | 'connection_status' | 'connection_tested_at'>;
export interface ConnectionCheck { id: string; label: string; ok: boolean; note?: string }
export interface ConnectionTest { tenant: CustomerTenant; connection_status: CustomerTenant['connection_status']; checks: ConnectionCheck[] }

export const SCOPE_CATEGORIES = ['cui', 'security_protection', 'contractor_risk_managed', 'specialized', 'out_of_scope'] as const;
export type ScopeCategory = (typeof SCOPE_CATEGORIES)[number];
export const SCOPE_CATEGORY_LABEL: Record<ScopeCategory, string> = {
  cui: 'CUI asset',
  security_protection: 'Security Protection Asset',
  contractor_risk_managed: 'Contractor Risk Managed Asset',
  specialized: 'Specialized Asset',
  out_of_scope: 'Out of scope',
};
export interface ScopeAsset {
  id: string;
  engagement_id: string;
  name: string;
  asset_type: string;
  category: ScopeCategory;
  location: string | null;
  owner: string | null;
  external_provider: boolean;
  notes: string | null;
  created_at: string;
}
export type ScopeAssetInput = Omit<ScopeAsset, 'id' | 'engagement_id' | 'created_at'>;
export interface ScopeBoundary {
  id: string;
  engagement_id: string;
  version: number;
  status: 'draft' | 'confirmed' | 'superseded';
  narrative: string | null;
  data_flows: { from: string; to: string; data: string; protection?: string }[] | null;
  asset_count: number;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
}

export interface EngagementRow { id: string; name?: string | null; reference_id?: string | null; engagement_kind: string; status?: string }

export const onboardApi = {
  organizations: {
    list: () => api.get<Organization[]>('/api/organizations'),
    get: (id: string) => api.get<Organization>(`/api/organizations/${id}`),
    create: (body: OrganizationInput) => api.post<Organization>('/api/organizations', body),
    update: (id: string, body: Partial<OrganizationInput>) => api.patch<Organization>(`/api/organizations/${id}`, body),
    remove: (id: string) => api.delete<void>(`/api/organizations/${id}`),
  },
  tenants: {
    list: () => api.get<CustomerTenant[]>('/api/customer-tenants'),
    create: (body: CustomerTenantInput) => api.post<CustomerTenant>('/api/customer-tenants', body),
    update: (id: string, body: Partial<CustomerTenantInput>) => api.patch<CustomerTenant>(`/api/customer-tenants/${id}`, body),
    remove: (id: string) => api.delete<void>(`/api/customer-tenants/${id}`),
    testConnection: (id: string) => api.post<ConnectionTest>(`/api/customer-tenants/${id}/test-connection`),
  },
  engagements: () => api.get<EngagementRow[]>('/api/engagements'),
  scope: {
    assets: (eid: string) => api.get<ScopeAsset[]>(`/api/engagements/${eid}/scope/assets`),
    addAsset: (eid: string, body: ScopeAssetInput) => api.post<ScopeAsset>(`/api/engagements/${eid}/scope/assets`, body),
    updateAsset: (eid: string, id: string, body: Partial<ScopeAssetInput>) => api.patch<ScopeAsset>(`/api/engagements/${eid}/scope/assets/${id}`, body),
    removeAsset: (eid: string, id: string) => api.delete<void>(`/api/engagements/${eid}/scope/assets/${id}`),
    boundaries: (eid: string) => api.get<ScopeBoundary[]>(`/api/engagements/${eid}/scope/boundaries`),
    draftBoundary: (eid: string, body: { narrative?: string | null }) => api.post<ScopeBoundary>(`/api/engagements/${eid}/scope/boundaries`, body),
    confirmBoundary: (eid: string, id: string) => api.post<ScopeBoundary>(`/api/engagements/${eid}/scope/boundaries/${id}/confirm`),
  },
};

/** One line for the user from an ApiResult failure. */
export function failureText<T>(r: Extract<ApiResult<T>, { ok: false }>): string {
  if (r.status === 403) return 'Your role cannot do this.';
  if (r.status === 401) return 'Sign in again.';
  return r.error ?? (r.degraded ? 'muster-api is not reachable.' : `Request failed (${r.status}).`);
}
