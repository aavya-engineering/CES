// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// openapi.ts — Sprint 2 (DOC-01): the OpenAPI 3 description of muster-api,
// served by routes/apiDocs.ts at /api-docs (Swagger UI) and /api-docs.json.
//
// One typed object instead of JSDoc scattered over 25 route files: it is
// diffed in review like code, and tests/openapi.test.ts checks that every
// path listed here is actually mounted. Routers not yet described appear
// under "tags" with x-status: undocumented so the gap is visible in the UI.
//
// Keep it honest: describe what the route does today (status codes and body
// shapes copied from the handler), not what it should do.
import type { OpenAPIV3 } from 'openapi-types';

const ROLES = ['prime', 'sub', 'bhd_operator', 'assessor_read_only', 'platform_admin'];
const SHARED_KINDS = ['requirement_meta', 'archetype', 'mapping', 'rule', 'custom_requirement'];

const bearer: OpenAPIV3.SecurityRequirementObject[] = [{ bearerAuth: [] }];

const ref = (name: string): OpenAPIV3.ReferenceObject => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject, description = 'OK'): OpenAPIV3.ResponseObject => ({
  description,
  content: { 'application/json': { schema } },
});
const err = (description: string): OpenAPIV3.ResponseObject => json(ref('Error'), description);
const body = (schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject): OpenAPIV3.RequestBodyObject => ({
  required: true,
  content: { 'application/json': { schema } },
});
const pathParam = (name: string, description: string): OpenAPIV3.ParameterObject => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string' },
  description,
});

const common = {
  401: err('Missing, invalid or expired bearer token'),
  403: err('Role not allowed, or temporary password not yet changed (code PASSWORD_CHANGE_REQUIRED)'),
};

export function buildOpenApiSpec(env: NodeJS.ProcessEnv = process.env): OpenAPIV3.Document {
  return {
    openapi: '3.0.3',
    info: {
      title: 'CES muster-api',
      version: env.CES_VERSION ?? 'dev',
      description:
        'HTTP API of the CES portal (Muster). All /api routes need `Authorization: Bearer <token>` from `POST /auth/login`. ' +
        'Platform administrators reach only /api/users, /api/audit-events, /api/v1/ces-shared and /api/portfolio (RBAC-01). ' +
        'Tenant data is isolated by Postgres row-level security keyed on the token’s tenant_id. ' +
        'Every response carries `X-Request-Id`; quote it when reporting a problem.',
    },
    servers: [{ url: '/', description: 'same origin (nginx forwards /api, /auth, /portal to the API)' }],
    tags: [
      { name: 'Health', description: 'Unauthenticated probes' },
      { name: 'Auth', description: 'Sign-in, session, password change and reset' },
      { name: 'Users', description: 'Platform administration → Users (platform_admin only)' },
      { name: 'CES-Shared', description: 'The 110 NIST SP 800-171 requirements, SPRS weights, governed reference data and custom requirements' },
      { name: 'Portfolio', description: 'Home page summary' },
      { name: 'Engagements', description: 'Engagements and milestones' },
      { name: 'Assess', description: 'Sprint 3/4 slice: persisted readiness assessment runs (one SPRS), per-requirement results, gap analysis and audited human overrides' },
      { name: 'Onboard', description: 'Sprint 3 slice: organisations, customer Microsoft 365 tenant registrations and the compliance scope (assets + versioned CUI boundary)' },
      ...[
        'Parties',
        'Contracts',
        'Sessions',
        'Actions',
        'HIL',
        'Touch',
        'Nudges',
        'Interview',
        'Coach',
        'Harvest',
        'SPRS',
        'Recipes',
        'Reassessment',
        'Discovery',
        'Live',
        'Delivery',
        'Plan',
        'Portal',
      ].map((name) => ({ name, description: 'Mounted; not yet described here (see src/routes).', 'x-status': 'undocumented' }) as OpenAPIV3.TagObject),
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Token from POST /auth/login (expires per JWT_EXPIRES_IN, 30 min in production).' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { description: 'Message, or a zod `flatten()` object for 400 validation errors', oneOf: [{ type: 'string' }, { type: 'object' }] },
            code: { type: 'string', description: 'Machine-readable code where the handler sets one (e.g. EMAIL_TAKEN, PASSWORD_CHANGE_REQUIRED)' },
            requestId: { type: 'string', description: 'Present on 500 responses; matches the X-Request-Id header' },
          },
          required: ['error'],
        },
        Role: { type: 'string', enum: ROLES },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password' } },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            user: ref('User'),
            pwd_change_required: { type: 'boolean', description: 'true when signed in with a temporary password; only /auth/* is open until it is changed' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            display_name: { type: 'string', nullable: true },
            role: ref('Role'),
            tenant_id: { type: 'string', format: 'uuid' },
            disabled_at: { type: 'string', format: 'date-time', nullable: true },
            must_change_password: { type: 'boolean' },
            last_login_at: { type: 'string', format: 'date-time', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        CreateUser: {
          type: 'object',
          required: ['email', 'role'],
          properties: {
            email: { type: 'string', format: 'email' },
            display_name: { type: 'string' },
            role: ref('Role'),
            tenant_id: { type: 'string', format: 'uuid', description: 'Existing organisation; or give organization_name to create one' },
            organization_name: { type: 'string' },
          },
        },
        UpdateUser: {
          type: 'object',
          properties: { display_name: { type: 'string' }, role: ref('Role'), disabled: { type: 'boolean' } },
        },
        Requirement: {
          type: 'object',
          description: 'One of the 110 locked NIST SP 800-171 Rev 2 requirements (decision D2: not editable)',
          properties: {
            controlId: { type: 'string', example: 'AC.L1-3.1.1' },
            nistRef: { type: 'string', example: '3.1.1' },
            family: { type: 'object', properties: { code: { type: 'string', example: 'AC' }, name: { type: 'string', example: 'Access Control' } } },
            level: { type: 'string', enum: ['L1', 'L2'] },
            practice: { type: 'string' },
            nistText: { type: 'string', nullable: true },
            requirementType: { type: 'string', enum: ['Basic', 'Derived'], nullable: true },
            sprs: {
              type: 'object',
              properties: {
                weight: { type: 'integer', enum: [0, 1, 3, 5] },
                poamAllowed: { type: 'boolean' },
                poamProhibited: { type: 'boolean' },
                unscored: { type: 'boolean' },
                partialCredit: { type: 'object', nullable: true, properties: { weight: { type: 'integer' }, condition: { type: 'string' } } },
              },
            },
            objectiveCount: { type: 'integer' },
          },
        },
        SharedItem: {
          type: 'object',
          description: 'A governed reference item: draft → published (by a second administrator) → retired',
          properties: {
            id: { type: 'string', format: 'uuid' },
            kind: { type: 'string', enum: SHARED_KINDS },
            item_key: { type: 'string' },
            version: { type: 'integer' },
            status: { type: 'string', enum: ['draft', 'published', 'retired'] },
            data: { type: 'object' },
            created_by: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            updated_by: { type: 'string' },
            updated_at: { type: 'string', format: 'date-time' },
            published_by: { type: 'string', nullable: true },
            published_at: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        Engagement: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', nullable: true },
            reference_id: { type: 'string', nullable: true },
            engagement_kind: { type: 'string', enum: ['prime_and_subs', 'individual_contractor'] },
            cmmc_level: { type: 'integer', enum: [1, 2], nullable: true },
            status: { type: 'string', enum: ['planned', 'in_progress', 'on_hold', 'closed'] },
            start_date: { type: 'string', format: 'date', nullable: true },
            target_date: { type: 'string', format: 'date', nullable: true },
          },
        },
        AssessmentRun: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true }, engagement_id: { type: 'string', format: 'uuid' },
            source: { type: 'string', enum: ['readiness_result', 'delivery_artifact', 'manual'] }, schema_version: { type: 'string', nullable: true }, label: { type: 'string', nullable: true },
            sprs_now: { type: 'integer', description: 'computeSprs over the current statuses (FCA conservative: only met passes)' },
            sprs_after: { type: 'integer', nullable: true, description: 'PROJECTION: registry-fixable gaps flipped to met' },
            met_count: { type: 'integer' }, partial_count: { type: 'integer' }, not_met_count: { type: 'integer' }, unknown_count: { type: 'integer' },
            engine: { type: 'object', nullable: true }, generated_at: { type: 'string', format: 'date-time', nullable: true }, delivery_artifact_id: { type: 'string', nullable: true },
            by_family: { type: 'array', items: { type: 'object', properties: { family: { type: 'string' }, name: { type: 'string' }, total: { type: 'integer' }, met: { type: 'integer' }, partial: { type: 'integer' }, not_met: { type: 'integer' }, unknown: { type: 'integer' }, deduction: { type: 'integer' } } } },
          },
        },
        AssessmentResult: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true }, run_id: { type: 'string', format: 'uuid' }, requirement_id: { type: 'string', example: 'IA.L2-3.5.3' }, family: { type: 'string' }, weight: { type: 'integer' },
            status: { type: 'string', enum: ['met', 'partial', 'not_met', 'unknown'] }, engine_status: { type: 'string', enum: ['met', 'partial', 'not_met', 'unknown'], description: 'What the engine derived; kept when a human overrides status' },
            confidence: { type: 'string', nullable: true }, objective_ids: { type: 'array', items: { type: 'string' } }, ran_entry_ids: { type: 'array', items: { type: 'string' } },
            fixable: { type: 'string', enum: ['registry', 'manual'], nullable: true }, fix_entry_ids: { type: 'array', items: { type: 'string' } },
            override_by: { type: 'string', nullable: true }, override_at: { type: 'string', format: 'date-time', nullable: true }, override_reason: { type: 'string', nullable: true }, notes: { type: 'string', nullable: true },
          },
        },
        ReadinessResultRecord: {
          type: 'object',
          required: ['schema_version', 'observations'],
          description: 'The readiness-result record the SPA / ces-tester writes (schema 1.0.0 or 1.1.0). Extra fields are kept.',
          properties: {
            schema_version: { type: 'string', enum: ['readiness-result/1.0.0', 'readiness-result/1.1.0'] },
            label: { type: 'string' },
            manifest: { type: 'object' },
            observations: { type: 'array', items: { type: 'object', required: ['control_id', 'derived_posture'], properties: { control_id: { type: 'string' }, objective_ids: { type: 'array', items: { type: 'string' } }, confidence: { type: 'string', enum: ['high', 'medium', 'low', 'unknown'] }, ran_entry_ids: { type: 'array', items: { type: 'string' } }, derived_posture: { type: 'string', enum: ['met', 'not_met', 'partial', 'unknown'] } } } },
            derived: { type: 'object', properties: { gaps: { type: 'array', items: { type: 'object', properties: { requirement_id: { type: 'string' }, weight: { type: 'integer' }, fix_entry_ids: { type: 'array', items: { type: 'string' } }, fixable: { type: 'string', enum: ['registry', 'manual'] } } } } } },
            provenance: { type: 'object', properties: { engine: { type: 'object', properties: { name: { type: 'string' }, version: { type: 'string' } } }, generated_at: { type: 'string', format: 'date-time' } } },
          },
        },
        GapAnalysis: {
          type: 'object',
          properties: {
            run_id: { type: 'string', format: 'uuid' }, sprs_now: { type: 'integer' }, sprs_after: { type: 'integer', nullable: true },
            gap_count: { type: 'integer' }, deduction_total: { type: 'integer' }, registry_fixable: { type: 'integer' }, registry_fixable_weight: { type: 'integer' },
            gaps: { type: 'array', items: ref('AssessmentResult') },
          },
        },
        Organization: {
          type: 'object',
          required: ['legal_name'],
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true },
            legal_name: { type: 'string' }, dba_name: { type: 'string', nullable: true },
            uei: { type: 'string', nullable: true, description: '12 alphanumeric' }, cage: { type: 'string', nullable: true, description: '5 alphanumeric' },
            website: { type: 'string', nullable: true }, address: { type: 'string', nullable: true },
            primary_contact_name: { type: 'string', nullable: true }, primary_contact_email: { type: 'string', format: 'email', nullable: true },
            contract_clauses: { type: 'array', items: { type: 'string', enum: ['DFARS 252.204-7012', 'DFARS 252.204-7019', 'DFARS 252.204-7020', 'DFARS 252.204-7021', 'FAR 52.204-21'] } },
            status: { type: 'string', enum: ['active', 'inactive'] }, notes: { type: 'string', nullable: true },
          },
        },
        CustomerTenant: {
          type: 'object',
          required: ['display_name'],
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true },
            organization_id: { type: 'string', format: 'uuid', nullable: true },
            display_name: { type: 'string' }, entra_tenant_id: { type: 'string', format: 'uuid', nullable: true }, primary_domain: { type: 'string', nullable: true },
            cloud: { type: 'string', enum: ['gcc_high', 'gcc', 'commercial'] },
            app_registration_id: { type: 'string', format: 'uuid', nullable: true }, certificate_thumbprint: { type: 'string', nullable: true, description: 'SHA-1, 40 hex' },
            status: { type: 'string', enum: ['registered', 'consented', 'live_enabled', 'disabled'] },
            connection_status: { type: 'string', nullable: true, readOnly: true }, connection_tested_at: { type: 'string', format: 'date-time', nullable: true, readOnly: true },
            notes: { type: 'string', nullable: true },
          },
        },
        ConnectionTest: {
          type: 'object',
          properties: {
            tenant: ref('CustomerTenant'),
            connection_status: { type: 'string', enum: ['prerequisites_complete', 'prerequisites_missing'] },
            checks: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' }, ok: { type: 'boolean' }, note: { type: 'string' } } } },
          },
        },
        ScopeAsset: {
          type: 'object',
          required: ['name', 'asset_type', 'category'],
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true },
            name: { type: 'string' }, asset_type: { type: 'string' },
            category: { type: 'string', enum: ['cui', 'security_protection', 'contractor_risk_managed', 'specialized', 'out_of_scope'], description: 'CMMC L2 scoping category' },
            location: { type: 'string', nullable: true }, owner: { type: 'string', nullable: true }, external_provider: { type: 'boolean' }, notes: { type: 'string', nullable: true },
          },
        },
        ScopeBoundary: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true }, version: { type: 'integer', readOnly: true },
            status: { type: 'string', enum: ['draft', 'confirmed', 'superseded'], readOnly: true },
            narrative: { type: 'string', nullable: true },
            data_flows: { type: 'array', nullable: true, items: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, data: { type: 'string' }, protection: { type: 'string' } } } },
            asset_count: { type: 'integer', readOnly: true }, confirmed_by: { type: 'string', nullable: true, readOnly: true }, confirmed_at: { type: 'string', format: 'date-time', nullable: true, readOnly: true },
          },
        },
        Milestone: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            due_date: { type: 'string', format: 'date' },
            completed: { type: 'boolean' },
          },
        },
      },
    },
    paths: {
      '/healthz': {
        get: { tags: ['Health'], summary: 'Liveness', responses: { 200: json({ type: 'object', properties: { status: { type: 'string', example: 'ok' }, version: { type: 'string' } } }) } },
      },
      '/readyz': {
        get: {
          tags: ['Health'],
          summary: 'Readiness (database reachable)',
          responses: {
            200: json({ type: 'object', properties: { status: { type: 'string', example: 'ok' }, db: { type: 'string', example: 'ok' }, version: { type: 'string' } } }),
            503: json({ type: 'object', properties: { status: { type: 'string', example: 'degraded' }, db: { type: 'string', example: 'unreachable' } } }, 'Database unreachable'),
          },
        },
      },

      '/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Sign in',
          description: 'Unsuccessful attempts are limited per e-mail and per client (NIST 3.1.8): after the limit the route answers 429 with Retry-After.',
          requestBody: body(ref('LoginRequest')),
          responses: { 200: json(ref('LoginResponse')), 400: err('Validation'), 401: err('Wrong e-mail or password, or account disabled'), 429: err('Too many failed attempts; see Retry-After') },
        },
      },
      '/auth/me': { get: { tags: ['Auth'], security: bearer, summary: 'Current user (token claims)', responses: { 200: json(ref('User')), 401: common[401] } } },
      '/auth/roles': { get: { tags: ['Auth'], security: bearer, summary: 'Role list', responses: { 200: json({ type: 'array', items: ref('Role') }), 401: common[401] } } },
      '/auth/refresh': { post: { tags: ['Auth'], security: bearer, summary: 'Issue a fresh token before the current one expires', responses: { 200: json({ type: 'object', properties: { token: { type: 'string' } } }), 401: common[401] } } },
      '/auth/change-password': {
        post: {
          tags: ['Auth'],
          security: bearer,
          summary: 'Change own password (also clears the temporary-password flag)',
          requestBody: body({ type: 'object', required: ['current_password', 'new_password'], properties: { current_password: { type: 'string', format: 'password' }, new_password: { type: 'string', format: 'password', minLength: 12, maxLength: 128 } } }),
          responses: { 200: json({ type: 'object', properties: { token: { type: 'string' } } }), 400: err('Weak password or wrong current password'), 401: common[401] },
        },
      },
      '/auth/forgot-password': {
        post: {
          tags: ['Auth'],
          summary: 'Request a password-reset e-mail',
          description: 'Always answers 200, whether or not the e-mail exists (no account enumeration). Sends only when SMTP_URL is configured.',
          requestBody: body({ type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } }),
          responses: { 200: json({ type: 'object', properties: { ok: { type: 'boolean' } } }), 400: err('Validation'), 429: err('Rate limited') },
        },
      },
      '/auth/reset-password': {
        post: {
          tags: ['Auth'],
          summary: 'Set a new password with the e-mailed token',
          requestBody: body({ type: 'object', required: ['token', 'new_password'], properties: { token: { type: 'string' }, new_password: { type: 'string', format: 'password', minLength: 12 } } }),
          responses: { 200: json({ type: 'object', properties: { ok: { type: 'boolean' } } }), 400: err('Invalid, used or expired token, or weak password') },
        },
      },

      '/api/users': {
        get: { tags: ['Users'], security: bearer, summary: 'List users (platform_admin)', responses: { 200: json({ type: 'array', items: ref('User') }), ...common } },
        post: {
          tags: ['Users'],
          security: bearer,
          summary: 'Create a user with a temporary password (platform_admin)',
          requestBody: body(ref('CreateUser')),
          responses: {
            201: json({ type: 'object', properties: { user: ref('User'), temporary_password: { type: 'string', description: 'Shown once; the user must change it at first sign-in' } } }, 'Created'),
            400: err('Validation / UNKNOWN_ORGANIZATION'),
            409: err('EMAIL_TAKEN'),
            ...common,
          },
        },
      },
      '/api/users/organizations': { get: { tags: ['Users'], security: bearer, summary: 'Organisations (tenants) for the create-user form', responses: { 200: json({ type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } } }), ...common } } },
      '/api/users/{id}': {
        patch: { tags: ['Users'], security: bearer, summary: 'Update display name, role or disabled state', parameters: [pathParam('id', 'User id')], requestBody: body(ref('UpdateUser')), responses: { 200: json(ref('User')), 400: err('Validation'), 404: err('Not found'), ...common } },
      },
      '/api/users/{id}/reset-password': {
        post: { tags: ['Users'], security: bearer, summary: 'Issue a new temporary password for a user', parameters: [pathParam('id', 'User id')], responses: { 200: json({ type: 'object', properties: { temporary_password: { type: 'string' } } }), 404: err('Not found'), ...common } },
      },
      '/api/audit-events': {
        get: { tags: ['Users'], security: bearer, summary: 'Administration audit trail (platform_admin)', responses: { 200: json({ type: 'array', items: { type: 'object', properties: { at: { type: 'string', format: 'date-time' }, action: { type: 'string' }, actor_user_id: { type: 'string', nullable: true }, target_type: { type: 'string', nullable: true }, target_id: { type: 'string', nullable: true }, detail: { type: 'object', nullable: true } } } }), ...common } },
      },

      '/api/v1/ces-shared/families': { get: { tags: ['CES-Shared'], security: bearer, summary: 'The 14 control families with counts', responses: { 200: json({ type: 'array', items: { type: 'object', properties: { code: { type: 'string' }, name: { type: 'string' }, displayOrder: { type: 'integer' }, controlCount: { type: 'integer' } } } }), ...common } } },
      '/api/v1/ces-shared/requirements': {
        get: {
          tags: ['CES-Shared'],
          security: bearer,
          summary: 'The 110 requirements (locked reference) with SPRS weights and admin metadata',
          parameters: [
            { name: 'family', in: 'query', schema: { type: 'string' }, description: 'Family code, e.g. AC' },
            { name: 'level', in: 'query', schema: { type: 'string', enum: ['L1', 'L2'] } },
            { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Search in id, NIST reference and text' },
          ],
          responses: { 200: json({ type: 'array', items: ref('Requirement') }), ...common },
        },
      },
      '/api/v1/ces-shared/requirements/{controlId}': { get: { tags: ['CES-Shared'], security: bearer, summary: 'One requirement with its assessment objectives', parameters: [pathParam('controlId', 'e.g. AC.L1-3.1.1')], responses: { 200: json(ref('Requirement')), 404: err('Unknown control id'), ...common } } },
      '/api/v1/ces-shared/summary': { get: { tags: ['CES-Shared'], security: bearer, summary: 'Counts for the 110 Requirements page cards', responses: { 200: json({ type: 'object' }), ...common } } },
      '/api/v1/ces-shared/changes': { get: { tags: ['CES-Shared'], security: bearer, summary: 'Governance change log', responses: { 200: json({ type: 'array', items: { type: 'object' } }), ...common } } },
      '/api/v1/ces-shared/export': { get: { tags: ['CES-Shared'], security: bearer, summary: 'CSV export of the requirements table', responses: { 200: { description: 'text/csv', content: { 'text/csv': { schema: { type: 'string' } } } }, ...common } } },
      '/api/v1/ces-shared/items/{kind}': {
        get: { tags: ['CES-Shared'], security: bearer, summary: 'List governed items of a kind', parameters: [{ ...pathParam('kind', 'Item kind'), schema: { type: 'string', enum: SHARED_KINDS } }], responses: { 200: json({ type: 'array', items: ref('SharedItem') }), ...common } },
        post: { tags: ['CES-Shared'], security: bearer, summary: 'Create a draft item (platform_admin). kind=custom_requirement adds an organisation-defined requirement', parameters: [{ ...pathParam('kind', 'Item kind'), schema: { type: 'string', enum: SHARED_KINDS } }], requestBody: body({ type: 'object' }), responses: { 201: json(ref('SharedItem'), 'Created'), 400: err('Validation'), 409: err('Key already exists'), ...common } },
      },
      '/api/v1/ces-shared/items/{kind}/{key}': {
        get: { tags: ['CES-Shared'], security: bearer, summary: 'All versions of one item', parameters: [pathParam('kind', 'Item kind'), pathParam('key', 'Item key')], responses: { 200: json({ type: 'array', items: ref('SharedItem') }), 404: err('Not found'), ...common } },
        put: { tags: ['CES-Shared'], security: bearer, summary: 'Edit the draft (or open a new draft version of a published item)', parameters: [pathParam('kind', 'Item kind'), pathParam('key', 'Item key')], requestBody: body({ type: 'object' }), responses: { 200: json(ref('SharedItem')), 400: err('Validation'), 404: err('Not found'), ...common } },
      },
      '/api/v1/ces-shared/items/{kind}/{key}/draft': { delete: { tags: ['CES-Shared'], security: bearer, summary: 'Discard the draft version', parameters: [pathParam('kind', 'Item kind'), pathParam('key', 'Item key')], responses: { 204: { description: 'Deleted' }, 404: err('No draft'), ...common } } },
      '/api/v1/ces-shared/items/{kind}/{key}/publish': { post: { tags: ['CES-Shared'], security: bearer, summary: 'Publish the draft — must be a different administrator than the author (two-person rule)', parameters: [pathParam('kind', 'Item kind'), pathParam('key', 'Item key')], responses: { 200: json(ref('SharedItem')), 403: err('Author cannot publish own draft'), 404: err('No draft'), 401: common[401] } } },
      '/api/v1/ces-shared/items/{kind}/{key}/retire': { post: { tags: ['CES-Shared'], security: bearer, summary: 'Retire the published version', parameters: [pathParam('kind', 'Item kind'), pathParam('key', 'Item key')], responses: { 200: json(ref('SharedItem')), 404: err('Not found'), ...common } } },

      '/api/portfolio': { get: { tags: ['Portfolio'], security: bearer, summary: 'Home page: engagement portfolio (counts only for platform_admin)', responses: { 200: json({ type: 'object' }), ...common } } },

      '/api/engagements/{engagementId}/assessments': {
        get: { tags: ['Assess'], security: bearer, summary: 'Assessment runs of an engagement, newest first', parameters: [pathParam('engagementId', 'Engagement id')], responses: { 200: json({ type: 'array', items: ref('AssessmentRun') }), 404: err('Not found'), ...common } },
        post: { tags: ['Assess'], security: bearer, summary: 'Ingest a readiness-result record as a new run (prime, bhd_operator)', parameters: [pathParam('engagementId', 'Engagement id')], requestBody: body(ref('ReadinessResultRecord')), responses: { 201: json(ref('AssessmentRun'), 'Created'), 404: err('Not found'), 422: err('Validation'), ...common } },
      },
      '/api/engagements/{engagementId}/assessments/from-artifact/{artifactId}': {
        post: { tags: ['Assess'], security: bearer, summary: 'Ingest a delivered readiness_result artifact (Delivery lane) as a new run', parameters: [pathParam('engagementId', 'Engagement id'), pathParam('artifactId', 'Delivery artifact id')], responses: { 201: json(ref('AssessmentRun'), 'Created'), 404: err('Not found'), 409: err('ARTIFACT_KIND'), 410: err('ARTIFACT_PURGED'), 422: err('Validation'), ...common } },
      },
      '/api/engagements/{engagementId}/assessments/{runId}': {
        get: { tags: ['Assess'], security: bearer, summary: 'One run with its by-family summary', parameters: [pathParam('engagementId', 'Engagement id'), pathParam('runId', 'Run id')], responses: { 200: json(ref('AssessmentRun')), 404: err('Not found'), ...common } },
      },
      '/api/engagements/{engagementId}/assessments/{runId}/results': {
        get: { tags: ['Assess'], security: bearer, summary: 'The 110 requirement results of a run', parameters: [pathParam('engagementId', 'Engagement id'), pathParam('runId', 'Run id')], responses: { 200: json({ type: 'array', items: ref('AssessmentResult') }), 404: err('Not found'), ...common } },
      },
      '/api/engagements/{engagementId}/assessments/{runId}/gaps': {
        get: { tags: ['Assess'], security: bearer, summary: 'Gap analysis: results not met, heaviest first, with the registry-fixable projection', parameters: [pathParam('engagementId', 'Engagement id'), pathParam('runId', 'Run id')], responses: { 200: json(ref('GapAnalysis')), 404: err('Not found'), ...common } },
      },
      '/api/engagements/{engagementId}/assessments/{runId}/results/{requirementId}': {
        patch: { tags: ['Assess'], security: bearer, summary: 'Human override of one requirement status (reason required; engine status kept; run re-scored; audited)', parameters: [pathParam('engagementId', 'Engagement id'), pathParam('runId', 'Run id'), pathParam('requirementId', 'Requirement id, e.g. IA.L2-3.5.3')], requestBody: body({ type: 'object', required: ['status', 'reason'], properties: { status: { type: 'string', enum: ['met', 'partial', 'not_met', 'unknown'] }, reason: { type: 'string', minLength: 10 }, notes: { type: 'string', nullable: true } } }), responses: { 200: json({ type: 'object', properties: { result: ref('AssessmentResult'), run: ref('AssessmentRun') } }), 404: err('Not found'), 422: err('Validation'), ...common } },
      },
      '/api/organizations': {
        get: { tags: ['Onboard'], security: bearer, summary: 'List organisations of the caller’s tenant', responses: { 200: json({ type: 'array', items: ref('Organization') }), ...common } },
        post: { tags: ['Onboard'], security: bearer, summary: 'Create an organisation (prime, bhd_operator)', requestBody: body(ref('Organization')), responses: { 201: json(ref('Organization'), 'Created'), 409: err('Legal name already exists (ORGANIZATION_EXISTS)'), 422: err('Validation'), ...common } },
      },
      '/api/organizations/{id}': {
        get: { tags: ['Onboard'], security: bearer, summary: 'One organisation with its tenant registrations', parameters: [pathParam('id', 'Organisation id')], responses: { 200: json(ref('Organization')), 404: err('Not found'), ...common } },
        patch: { tags: ['Onboard'], security: bearer, summary: 'Update an organisation', parameters: [pathParam('id', 'Organisation id')], requestBody: body(ref('Organization')), responses: { 200: json(ref('Organization')), 404: err('Not found'), 422: err('Validation'), ...common } },
        delete: { tags: ['Onboard'], security: bearer, summary: 'Delete an organisation (refused while tenants reference it)', parameters: [pathParam('id', 'Organisation id')], responses: { 204: { description: 'Deleted' }, 404: err('Not found'), 409: err('ORGANIZATION_IN_USE'), ...common } },
      },
      '/api/customer-tenants': {
        get: { tags: ['Onboard'], security: bearer, summary: 'List customer Microsoft 365 tenant registrations', responses: { 200: json({ type: 'array', items: ref('CustomerTenant') }), ...common } },
        post: { tags: ['Onboard'], security: bearer, summary: 'Register a customer tenant (prime, bhd_operator)', requestBody: body(ref('CustomerTenant')), responses: { 201: json(ref('CustomerTenant'), 'Created'), 422: err('Validation'), ...common } },
      },
      '/api/customer-tenants/{id}': {
        get: { tags: ['Onboard'], security: bearer, summary: 'One tenant registration', parameters: [pathParam('id', 'Registration id')], responses: { 200: json(ref('CustomerTenant')), 404: err('Not found'), ...common } },
        patch: { tags: ['Onboard'], security: bearer, summary: 'Update a tenant registration', parameters: [pathParam('id', 'Registration id')], requestBody: body(ref('CustomerTenant')), responses: { 200: json(ref('CustomerTenant')), 404: err('Not found'), 422: err('Validation'), ...common } },
        delete: { tags: ['Onboard'], security: bearer, summary: 'Remove a registration (refused while live_enabled)', parameters: [pathParam('id', 'Registration id')], responses: { 204: { description: 'Deleted' }, 404: err('Not found'), 409: err('TENANT_LIVE'), ...common } },
      },
      '/api/customer-tenants/{id}/test-connection': {
        post: { tags: ['Onboard'], security: bearer, summary: 'Check connection prerequisites (never contacts the tenant; runner integration in Sprint 5)', parameters: [pathParam('id', 'Registration id')], responses: { 200: json(ref('ConnectionTest')), 404: err('Not found'), ...common } },
      },
      '/api/engagements/{engagementId}/scope/assets': {
        get: { tags: ['Onboard'], security: bearer, summary: 'Scope assets of an engagement', parameters: [pathParam('engagementId', 'Engagement id')], responses: { 200: json({ type: 'array', items: ref('ScopeAsset') }), 404: err('Not found'), ...common } },
        post: { tags: ['Onboard'], security: bearer, summary: 'Add a scope asset', parameters: [pathParam('engagementId', 'Engagement id')], requestBody: body(ref('ScopeAsset')), responses: { 201: json(ref('ScopeAsset'), 'Created'), 404: err('Not found'), 422: err('Validation'), ...common } },
      },
      '/api/engagements/{engagementId}/scope/assets/{id}': {
        patch: { tags: ['Onboard'], security: bearer, summary: 'Update a scope asset', parameters: [pathParam('engagementId', 'Engagement id'), pathParam('id', 'Asset id')], requestBody: body(ref('ScopeAsset')), responses: { 200: json(ref('ScopeAsset')), 404: err('Not found'), ...common } },
        delete: { tags: ['Onboard'], security: bearer, summary: 'Remove a scope asset', parameters: [pathParam('engagementId', 'Engagement id'), pathParam('id', 'Asset id')], responses: { 204: { description: 'Deleted' }, 404: err('Not found'), ...common } },
      },
      '/api/engagements/{engagementId}/scope/boundaries': {
        get: { tags: ['Onboard'], security: bearer, summary: 'Boundary versions (newest first)', parameters: [pathParam('engagementId', 'Engagement id')], responses: { 200: json({ type: 'array', items: ref('ScopeBoundary') }), 404: err('Not found'), ...common } },
        post: { tags: ['Onboard'], security: bearer, summary: 'Create the next draft boundary version from the current asset list', parameters: [pathParam('engagementId', 'Engagement id')], requestBody: body(ref('ScopeBoundary')), responses: { 201: json(ref('ScopeBoundary'), 'Created'), 404: err('Not found'), ...common } },
      },
      '/api/engagements/{engagementId}/scope/boundaries/{id}/confirm': {
        post: { tags: ['Onboard'], security: bearer, summary: 'Confirm a draft boundary (human act; supersedes the previous confirmed version)', parameters: [pathParam('engagementId', 'Engagement id'), pathParam('id', 'Boundary id')], responses: { 200: json(ref('ScopeBoundary')), 404: err('Not found'), 409: err('BOUNDARY_NOT_DRAFT or BOUNDARY_INCOMPLETE'), ...common } },
      },
      '/api/engagements': {
        get: { tags: ['Engagements'], security: bearer, summary: 'List engagements of the caller’s tenant', responses: { 200: json({ type: 'array', items: ref('Engagement') }), ...common } },
        post: { tags: ['Engagements'], security: bearer, summary: 'Create an engagement', requestBody: body(ref('Engagement')), responses: { 201: json(ref('Engagement'), 'Created'), 400: err('Validation (dates must be YYYY-MM-DD and in order)'), ...common } },
      },
      '/api/engagements/{id}': {
        get: { tags: ['Engagements'], security: bearer, summary: 'One engagement', parameters: [pathParam('id', 'Engagement id')], responses: { 200: json(ref('Engagement')), 404: err('Not found'), ...common } },
        patch: { tags: ['Engagements'], security: bearer, summary: 'Update details / status', parameters: [pathParam('id', 'Engagement id')], requestBody: body(ref('Engagement')), responses: { 200: json(ref('Engagement')), 400: err('Validation'), 404: err('Not found'), ...common } },
      },
      '/api/engagements/{id}/milestones': {
        get: { tags: ['Engagements'], security: bearer, summary: 'Milestones', parameters: [pathParam('id', 'Engagement id')], responses: { 200: json({ type: 'array', items: ref('Milestone') }), ...common } },
        post: { tags: ['Engagements'], security: bearer, summary: 'Add a milestone', parameters: [pathParam('id', 'Engagement id')], requestBody: body(ref('Milestone')), responses: { 201: json(ref('Milestone'), 'Created'), 400: err('Validation'), ...common } },
      },
      '/api/engagements/{id}/milestones/{mid}': {
        patch: { tags: ['Engagements'], security: bearer, summary: 'Update a milestone', parameters: [pathParam('id', 'Engagement id'), pathParam('mid', 'Milestone id')], requestBody: body(ref('Milestone')), responses: { 200: json(ref('Milestone')), 404: err('Not found'), ...common } },
        delete: { tags: ['Engagements'], security: bearer, summary: 'Delete a milestone', parameters: [pathParam('id', 'Engagement id'), pathParam('mid', 'Milestone id')], responses: { 204: { description: 'Deleted' }, 404: err('Not found'), ...common } },
      },
    },
  };
}
