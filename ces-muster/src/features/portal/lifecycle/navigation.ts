// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// navigation.ts — Sprint 1 Foundation (S1-GD-02 / S1-GUI-03): the lifecycle
// navigation model, GENERATED from "CES Navigation.xlsx" (BHD, 2026-11-10,
// sheet "Navigation Structure": 9 sections, 50 groups, 245 pages). Do not edit
// by hand; regenerate with scripts/gen-navigation.mjs when the workbook changes.
//
// Each page has a stable path key (`/section/group/item`) that the shell turns
// into a route (`lc/section/group/item`) unless lifecycle/builtRoutes.ts maps it
// to a screen that already exists.

export type LifecycleSectionKey = 'shared' | 'onboard' | 'assess' | 'plan' | 'remediate' | 'evidence' | 'monitor' | 'prepare' | 'admin';

export type EngineModule = 'ces-shared' | 'muster' | 'stamper/adminops' | 'evidenceops' | 'platform';

export interface LifecycleItem {
  key: string;
  label: string;
  /** `/section/group/item` — stable across releases. */
  path: string;
  description: string;
}

export interface LifecycleGroup {
  key: string;
  label: string;
  path: string;
  items: LifecycleItem[];
}

export interface LifecycleSection {
  key: LifecycleSectionKey;
  label: string;
  module: EngineModule;
  description: string;
  groups: LifecycleGroup[];
}

export const LIFECYCLE_NAV: readonly LifecycleSection[] = [
  {
    "key": "shared",
    "label": "Shared Foundation",
    "module": "ces-shared",
    "description": "Common master data, schemas, contracts and shared services",
    "groups": [
      {
        "key": "overview",
        "label": "Overview",
        "path": "/shared/overview",
        "items": []
      },
      {
        "key": "reference-data",
        "label": "Reference Data",
        "path": "/shared/reference-data",
        "items": [
          {
            "key": "110-requirements",
            "label": "110 Requirements",
            "path": "/shared/reference-data/110-requirements",
            "description": ""
          },
          {
            "key": "sprs-weight-table",
            "label": "SPRS Weight Table",
            "path": "/shared/reference-data/sprs-weight-table",
            "description": ""
          },
          {
            "key": "version-compatibility",
            "label": "Version Compatibility",
            "path": "/shared/reference-data/version-compatibility",
            "description": ""
          }
        ]
      }
    ]
  },
  {
    "key": "onboard",
    "label": "Onboard",
    "module": "muster",
    "description": "Organization, tenant, engagement and scope registration",
    "groups": [
      {
        "key": "organization-management",
        "label": "Organization Management",
        "path": "/onboard/organization-management",
        "items": [
          {
            "key": "all-organizations",
            "label": "All Organizations",
            "path": "/onboard/organization-management/all-organizations",
            "description": ""
          },
          {
            "key": "organization-profile-view",
            "label": "Organization Profile View",
            "path": "/onboard/organization-management/organization-profile-view",
            "description": ""
          },
          {
            "key": "create-organization",
            "label": "Create Organization",
            "path": "/onboard/organization-management/create-organization",
            "description": ""
          },
          {
            "key": "edit-organization",
            "label": "Edit Organization",
            "path": "/onboard/organization-management/edit-organization",
            "description": ""
          },
          {
            "key": "delete-organization",
            "label": "Delete Organization",
            "path": "/onboard/organization-management/delete-organization",
            "description": ""
          }
        ]
      },
      {
        "key": "tenant-management",
        "label": "Tenant Management",
        "path": "/onboard/tenant-management",
        "items": [
          {
            "key": "all-tenants",
            "label": "All Tenants",
            "path": "/onboard/tenant-management/all-tenants",
            "description": ""
          },
          {
            "key": "register-tenant",
            "label": "Register Tenant",
            "path": "/onboard/tenant-management/register-tenant",
            "description": ""
          },
          {
            "key": "tenant-details",
            "label": "Tenant Details",
            "path": "/onboard/tenant-management/tenant-details",
            "description": ""
          },
          {
            "key": "tenant-configuration",
            "label": "Tenant Configuration",
            "path": "/onboard/tenant-management/tenant-configuration",
            "description": ""
          },
          {
            "key": "tenant-connections-test-status",
            "label": "Tenant Connections Test/Status",
            "path": "/onboard/tenant-management/tenant-connections-test-status",
            "description": ""
          },
          {
            "key": "edit-tenants",
            "label": "Edit Tenants",
            "path": "/onboard/tenant-management/edit-tenants",
            "description": ""
          },
          {
            "key": "delete-tenant",
            "label": "Delete Tenant",
            "path": "/onboard/tenant-management/delete-tenant",
            "description": ""
          }
        ]
      },
      {
        "key": "engagement-management",
        "label": "Engagement Management",
        "path": "/onboard/engagement-management",
        "items": [
          {
            "key": "all-engagements",
            "label": "All Engagements",
            "path": "/onboard/engagement-management/all-engagements",
            "description": ""
          },
          {
            "key": "create-engagement",
            "label": "Create Engagement",
            "path": "/onboard/engagement-management/create-engagement",
            "description": ""
          },
          {
            "key": "edit-engagement",
            "label": "Edit Engagement",
            "path": "/onboard/engagement-management/edit-engagement",
            "description": ""
          },
          {
            "key": "engagement-details",
            "label": "Engagement Details",
            "path": "/onboard/engagement-management/engagement-details",
            "description": ""
          },
          {
            "key": "delete-engagement",
            "label": "Delete Engagement",
            "path": "/onboard/engagement-management/delete-engagement",
            "description": ""
          },
          {
            "key": "engagement-status",
            "label": "Engagement Status",
            "path": "/onboard/engagement-management/engagement-status",
            "description": ""
          }
        ]
      },
      {
        "key": "system-environment-registry",
        "label": "System & Environment Registry",
        "path": "/onboard/system-environment-registry",
        "items": [
          {
            "key": "systems-inventory",
            "label": "Systems Inventory",
            "path": "/onboard/system-environment-registry/systems-inventory",
            "description": ""
          },
          {
            "key": "register-system",
            "label": "Register System",
            "path": "/onboard/system-environment-registry/register-system",
            "description": ""
          },
          {
            "key": "environments",
            "label": "Environments",
            "path": "/onboard/system-environment-registry/environments",
            "description": ""
          },
          {
            "key": "infrastructure-inventory",
            "label": "Infrastructure Inventory",
            "path": "/onboard/system-environment-registry/infrastructure-inventory",
            "description": ""
          },
          {
            "key": "cloud-on-premises-resources",
            "label": "Cloud / On-Premises Resources",
            "path": "/onboard/system-environment-registry/cloud-on-premises-resources",
            "description": ""
          }
        ]
      },
      {
        "key": "compliance-scope",
        "label": "Compliance Scope",
        "path": "/onboard/compliance-scope",
        "items": [
          {
            "key": "scope-definition",
            "label": "Scope Definition",
            "path": "/onboard/compliance-scope/scope-definition",
            "description": ""
          },
          {
            "key": "cui-boundary",
            "label": "CUI Boundary",
            "path": "/onboard/compliance-scope/cui-boundary",
            "description": ""
          },
          {
            "key": "in-scope-assets",
            "label": "In-Scope Assets",
            "path": "/onboard/compliance-scope/in-scope-assets",
            "description": ""
          },
          {
            "key": "out-of-scope-assets",
            "label": "Out-of-Scope Assets",
            "path": "/onboard/compliance-scope/out-of-scope-assets",
            "description": ""
          },
          {
            "key": "external-service-providers",
            "label": "External Service Providers",
            "path": "/onboard/compliance-scope/external-service-providers",
            "description": ""
          },
          {
            "key": "scope-approval",
            "label": "Scope Approval",
            "path": "/onboard/compliance-scope/scope-approval",
            "description": ""
          }
        ]
      },
      {
        "key": "onboarding-checklist",
        "label": "Onboarding Checklist",
        "path": "/onboard/onboarding-checklist",
        "items": [
          {
            "key": "organization-readiness",
            "label": "Organization Readiness",
            "path": "/onboard/onboarding-checklist/organization-readiness",
            "description": ""
          },
          {
            "key": "tenant-readiness",
            "label": "Tenant Readiness",
            "path": "/onboard/onboarding-checklist/tenant-readiness",
            "description": ""
          },
          {
            "key": "engagement-readiness",
            "label": "Engagement Readiness",
            "path": "/onboard/onboarding-checklist/engagement-readiness",
            "description": ""
          },
          {
            "key": "onboarding-summary",
            "label": "Onboarding Summary",
            "path": "/onboard/onboarding-checklist/onboarding-summary",
            "description": ""
          }
        ]
      }
    ]
  },
  {
    "key": "assess",
    "label": "Assess",
    "module": "muster",
    "description": "Muster – discovery, interviews, assessment and gap identification",
    "groups": [
      {
        "key": "assessment-overview",
        "label": "Assessment Overview",
        "path": "/assess/assessment-overview",
        "items": [
          {
            "key": "assessment-dashboard",
            "label": "Assessment Dashboard",
            "path": "/assess/assessment-overview/assessment-dashboard",
            "description": ""
          },
          {
            "key": "assessment-status",
            "label": "Assessment Status",
            "path": "/assess/assessment-overview/assessment-status",
            "description": ""
          },
          {
            "key": "assessment-progress",
            "label": "Assessment Progress",
            "path": "/assess/assessment-overview/assessment-progress",
            "description": ""
          }
        ]
      },
      {
        "key": "discovery",
        "label": "Discovery",
        "path": "/assess/discovery",
        "items": [
          {
            "key": "discovery-overview",
            "label": "Discovery Overview",
            "path": "/assess/discovery/discovery-overview",
            "description": ""
          },
          {
            "key": "sync-status",
            "label": "Sync Status",
            "path": "/assess/discovery/sync-status",
            "description": ""
          },
          {
            "key": "access-permissions",
            "label": "Access & Permissions",
            "path": "/assess/discovery/access-permissions",
            "description": ""
          },
          {
            "key": "inferred-insights",
            "label": "Inferred Insights",
            "path": "/assess/discovery/inferred-insights",
            "description": ""
          },
          {
            "key": "prior-results",
            "label": "Prior Results",
            "path": "/assess/discovery/prior-results",
            "description": ""
          },
          {
            "key": "resource-inventory",
            "label": "Resource Inventory",
            "path": "/assess/discovery/resource-inventory",
            "description": ""
          },
          {
            "key": "discovery-findings",
            "label": "Discovery Findings",
            "path": "/assess/discovery/discovery-findings",
            "description": ""
          }
        ]
      },
      {
        "key": "cui-boundary-assessment",
        "label": "CUI Boundary Assessment",
        "path": "/assess/cui-boundary-assessment",
        "items": [
          {
            "key": "resource-list",
            "label": "Resource List",
            "path": "/assess/cui-boundary-assessment/resource-list",
            "description": ""
          },
          {
            "key": "data-flows",
            "label": "Data Flows",
            "path": "/assess/cui-boundary-assessment/data-flows",
            "description": ""
          },
          {
            "key": "boundary-versions-history",
            "label": "Boundary Versions & History",
            "path": "/assess/cui-boundary-assessment/boundary-versions-history",
            "description": ""
          },
          {
            "key": "boundary-review",
            "label": "Boundary Review",
            "path": "/assess/cui-boundary-assessment/boundary-review",
            "description": ""
          }
        ]
      },
      {
        "key": "adaptive-interviews",
        "label": "Adaptive Interviews",
        "path": "/assess/adaptive-interviews",
        "items": [
          {
            "key": "interview-sessions",
            "label": "Interview Sessions",
            "path": "/assess/adaptive-interviews/interview-sessions",
            "description": ""
          },
          {
            "key": "interview-questions",
            "label": "Interview Questions",
            "path": "/assess/adaptive-interviews/interview-questions",
            "description": ""
          },
          {
            "key": "responses",
            "label": "Responses",
            "path": "/assess/adaptive-interviews/responses",
            "description": ""
          },
          {
            "key": "supporting-documents",
            "label": "Supporting Documents",
            "path": "/assess/adaptive-interviews/supporting-documents",
            "description": ""
          },
          {
            "key": "interview-review",
            "label": "Interview Review",
            "path": "/assess/adaptive-interviews/interview-review",
            "description": ""
          }
        ]
      },
      {
        "key": "compliance-assessment",
        "label": "Compliance Assessment",
        "path": "/assess/compliance-assessment",
        "items": [
          {
            "key": "110-requirements",
            "label": "110 Requirements",
            "path": "/assess/compliance-assessment/110-requirements",
            "description": ""
          },
          {
            "key": "requirement-assessment",
            "label": "Requirement Assessment",
            "path": "/assess/compliance-assessment/requirement-assessment",
            "description": ""
          },
          {
            "key": "assessment-objectives",
            "label": "Assessment Objectives",
            "path": "/assess/compliance-assessment/assessment-objectives",
            "description": ""
          },
          {
            "key": "implementation-status",
            "label": "Implementation Status",
            "path": "/assess/compliance-assessment/implementation-status",
            "description": ""
          },
          {
            "key": "assessment-findings",
            "label": "Assessment Findings",
            "path": "/assess/compliance-assessment/assessment-findings",
            "description": ""
          }
        ]
      },
      {
        "key": "readiness-assessment",
        "label": "Readiness Assessment",
        "path": "/assess/readiness-assessment",
        "items": [
          {
            "key": "readiness-overview",
            "label": "Readiness Overview",
            "path": "/assess/readiness-assessment/readiness-overview",
            "description": ""
          },
          {
            "key": "by-domain",
            "label": "By Domain",
            "path": "/assess/readiness-assessment/by-domain",
            "description": ""
          },
          {
            "key": "by-control-family",
            "label": "By Control Family",
            "path": "/assess/readiness-assessment/by-control-family",
            "description": ""
          },
          {
            "key": "by-system-environment",
            "label": "By System / Environment",
            "path": "/assess/readiness-assessment/by-system-environment",
            "description": ""
          },
          {
            "key": "trends-history",
            "label": "Trends & History",
            "path": "/assess/readiness-assessment/trends-history",
            "description": ""
          }
        ]
      },
      {
        "key": "gap-analysis",
        "label": "Gap Analysis",
        "path": "/assess/gap-analysis",
        "items": [
          {
            "key": "gap-summary",
            "label": "Gap Summary",
            "path": "/assess/gap-analysis/gap-summary",
            "description": ""
          },
          {
            "key": "gaps-by-requirement",
            "label": "Gaps by Requirement",
            "path": "/assess/gap-analysis/gaps-by-requirement",
            "description": ""
          },
          {
            "key": "gaps-by-control-family",
            "label": "Gaps by Control Family",
            "path": "/assess/gap-analysis/gaps-by-control-family",
            "description": ""
          },
          {
            "key": "gap-details",
            "label": "Gap Details",
            "path": "/assess/gap-analysis/gap-details",
            "description": ""
          },
          {
            "key": "risk-impact-analysis",
            "label": "Risk & Impact Analysis",
            "path": "/assess/gap-analysis/risk-impact-analysis",
            "description": ""
          },
          {
            "key": "assessment-review",
            "label": "Assessment Review",
            "path": "/assess/gap-analysis/assessment-review",
            "description": ""
          }
        ]
      }
    ]
  },
  {
    "key": "plan",
    "label": "Plan",
    "module": "muster",
    "description": "Readiness decisions, remediation planning and prioritization",
    "groups": [
      {
        "key": "planning-overview",
        "label": "Planning Overview",
        "path": "/plan/planning-overview",
        "items": []
      },
      {
        "key": "remediation-planning",
        "label": "Remediation Planning",
        "path": "/plan/remediation-planning",
        "items": [
          {
            "key": "remediation-plan",
            "label": "Remediation Plan",
            "path": "/plan/remediation-planning/remediation-plan",
            "description": ""
          },
          {
            "key": "create-remediation-plan",
            "label": "Create Remediation Plan",
            "path": "/plan/remediation-planning/create-remediation-plan",
            "description": ""
          },
          {
            "key": "plan-details",
            "label": "Plan Details",
            "path": "/plan/remediation-planning/plan-details",
            "description": ""
          },
          {
            "key": "plan-by-requirement",
            "label": "Plan by Requirement",
            "path": "/plan/remediation-planning/plan-by-requirement",
            "description": ""
          },
          {
            "key": "plan-by-control-family",
            "label": "Plan by Control Family",
            "path": "/plan/remediation-planning/plan-by-control-family",
            "description": ""
          }
        ]
      },
      {
        "key": "action-management",
        "label": "Action Management",
        "path": "/plan/action-management",
        "items": [
          {
            "key": "all-action-items",
            "label": "All Action Items",
            "path": "/plan/action-management/all-action-items",
            "description": ""
          },
          {
            "key": "create-action-item",
            "label": "Create Action Item",
            "path": "/plan/action-management/create-action-item",
            "description": ""
          },
          {
            "key": "assign-owners",
            "label": "Assign Owners",
            "path": "/plan/action-management/assign-owners",
            "description": ""
          },
          {
            "key": "dependencies",
            "label": "Dependencies",
            "path": "/plan/action-management/dependencies",
            "description": ""
          },
          {
            "key": "milestones",
            "label": "Milestones",
            "path": "/plan/action-management/milestones",
            "description": ""
          },
          {
            "key": "due-dates",
            "label": "Due Dates",
            "path": "/plan/action-management/due-dates",
            "description": ""
          }
        ]
      },
      {
        "key": "prioritization",
        "label": "Prioritization",
        "path": "/plan/prioritization",
        "items": [
          {
            "key": "risk-based-priorities",
            "label": "Risk-Based Priorities",
            "path": "/plan/prioritization/risk-based-priorities",
            "description": ""
          },
          {
            "key": "critical-gaps",
            "label": "Critical Gaps",
            "path": "/plan/prioritization/critical-gaps",
            "description": ""
          },
          {
            "key": "resource-effort-estimates",
            "label": "Resource & Effort Estimates",
            "path": "/plan/prioritization/resource-effort-estimates",
            "description": ""
          },
          {
            "key": "implementation-sequence",
            "label": "Implementation Sequence",
            "path": "/plan/prioritization/implementation-sequence",
            "description": ""
          }
        ]
      },
      {
        "key": "poa-m-planning",
        "label": "POA&M Planning",
        "path": "/plan/poa-m-planning",
        "items": [
          {
            "key": "poa-m-overview",
            "label": "POA&M Overview",
            "path": "/plan/poa-m-planning/poa-m-overview",
            "description": ""
          },
          {
            "key": "poa-m-items",
            "label": "POA&M Items",
            "path": "/plan/poa-m-planning/poa-m-items",
            "description": ""
          },
          {
            "key": "milestones-target-dates",
            "label": "Milestones & Target Dates",
            "path": "/plan/poa-m-planning/milestones-target-dates",
            "description": ""
          },
          {
            "key": "cost-resources",
            "label": "Cost / Resources",
            "path": "/plan/poa-m-planning/cost-resources",
            "description": ""
          }
        ]
      },
      {
        "key": "plan-artifacts",
        "label": "Plan Artifacts",
        "path": "/plan/plan-artifacts",
        "items": [
          {
            "key": "plan-summary",
            "label": "Plan Summary",
            "path": "/plan/plan-artifacts/plan-summary",
            "description": ""
          },
          {
            "key": "readiness-record",
            "label": "Readiness Record",
            "path": "/plan/plan-artifacts/readiness-record",
            "description": ""
          },
          {
            "key": "plan-bundle",
            "label": "Plan Bundle",
            "path": "/plan/plan-artifacts/plan-bundle",
            "description": ""
          },
          {
            "key": "approval-sign-off",
            "label": "Approval & Sign-off",
            "path": "/plan/plan-artifacts/approval-sign-off",
            "description": ""
          },
          {
            "key": "version-history",
            "label": "Version History",
            "path": "/plan/plan-artifacts/version-history",
            "description": ""
          }
        ]
      }
    ]
  },
  {
    "key": "remediate",
    "label": "Remediate",
    "module": "stamper/adminops",
    "description": "Stamper and AdminOps – security configuration and governed changes",
    "groups": [
      {
        "key": "remediation-overview",
        "label": "Remediation Overview",
        "path": "/remediate/remediation-overview",
        "items": [
          {
            "key": "remediation-dashboard",
            "label": "Remediation Dashboard",
            "path": "/remediate/remediation-overview/remediation-dashboard",
            "description": ""
          },
          {
            "key": "implementation-progress",
            "label": "Implementation Progress",
            "path": "/remediate/remediation-overview/implementation-progress",
            "description": ""
          },
          {
            "key": "pending-actions",
            "label": "Pending Actions",
            "path": "/remediate/remediation-overview/pending-actions",
            "description": ""
          }
        ]
      },
      {
        "key": "configuration-management-stamper",
        "label": "Configuration Management – Stamper",
        "path": "/remediate/configuration-management-stamper",
        "items": [
          {
            "key": "configuration-overview",
            "label": "Configuration Overview",
            "path": "/remediate/configuration-management-stamper/configuration-overview",
            "description": ""
          },
          {
            "key": "plan-intake",
            "label": "Plan Intake",
            "path": "/remediate/configuration-management-stamper/plan-intake",
            "description": ""
          },
          {
            "key": "plan-validation-translation",
            "label": "Plan Validation & Translation",
            "path": "/remediate/configuration-management-stamper/plan-validation-translation",
            "description": ""
          },
          {
            "key": "tenant-connection",
            "label": "Tenant Connection",
            "path": "/remediate/configuration-management-stamper/tenant-connection",
            "description": ""
          },
          {
            "key": "preflight-permissions",
            "label": "Preflight & Permissions",
            "path": "/remediate/configuration-management-stamper/preflight-permissions",
            "description": ""
          },
          {
            "key": "execution-plan",
            "label": "Execution Plan",
            "path": "/remediate/configuration-management-stamper/execution-plan",
            "description": ""
          },
          {
            "key": "run-configuration",
            "label": "Run Configuration",
            "path": "/remediate/configuration-management-stamper/run-configuration",
            "description": ""
          },
          {
            "key": "execution",
            "label": "Execution",
            "path": "/remediate/configuration-management-stamper/execution",
            "description": ""
          },
          {
            "key": "task-verification",
            "label": "Task Verification",
            "path": "/remediate/configuration-management-stamper/task-verification",
            "description": ""
          },
          {
            "key": "configuration-assessment",
            "label": "Configuration Assessment",
            "path": "/remediate/configuration-management-stamper/configuration-assessment",
            "description": ""
          },
          {
            "key": "run-results",
            "label": "Run Results",
            "path": "/remediate/configuration-management-stamper/run-results",
            "description": ""
          },
          {
            "key": "evidence-handoff",
            "label": "Evidence & Handoff",
            "path": "/remediate/configuration-management-stamper/evidence-handoff",
            "description": ""
          }
        ]
      },
      {
        "key": "administrative-operations-adminops",
        "label": "Administrative Operations – AdminOps",
        "path": "/remediate/administrative-operations-adminops",
        "items": [
          {
            "key": "adminops-overview",
            "label": "AdminOps Overview",
            "path": "/remediate/administrative-operations-adminops/adminops-overview",
            "description": ""
          },
          {
            "key": "change-requests",
            "label": "Change Requests",
            "path": "/remediate/administrative-operations-adminops/change-requests",
            "description": ""
          },
          {
            "key": "create-change-request",
            "label": "Create Change Request",
            "path": "/remediate/administrative-operations-adminops/create-change-request",
            "description": ""
          },
          {
            "key": "approval-queue",
            "label": "Approval Queue",
            "path": "/remediate/administrative-operations-adminops/approval-queue",
            "description": ""
          },
          {
            "key": "two-person-approval",
            "label": "Two-Person Approval",
            "path": "/remediate/administrative-operations-adminops/two-person-approval",
            "description": ""
          },
          {
            "key": "identity-access",
            "label": "Identity & Access",
            "path": "/remediate/administrative-operations-adminops/identity-access",
            "description": ""
          },
          {
            "key": "devices-endpoints",
            "label": "Devices & Endpoints",
            "path": "/remediate/administrative-operations-adminops/devices-endpoints",
            "description": ""
          },
          {
            "key": "credentials-keys",
            "label": "Credentials & Keys",
            "path": "/remediate/administrative-operations-adminops/credentials-keys",
            "description": ""
          },
          {
            "key": "data-protection-cui",
            "label": "Data Protection & CUI",
            "path": "/remediate/administrative-operations-adminops/data-protection-cui",
            "description": ""
          },
          {
            "key": "security-configuration",
            "label": "Security Configuration",
            "path": "/remediate/administrative-operations-adminops/security-configuration",
            "description": ""
          },
          {
            "key": "personnel-security",
            "label": "Personnel Security",
            "path": "/remediate/administrative-operations-adminops/personnel-security",
            "description": ""
          },
          {
            "key": "incident-response",
            "label": "Incident Response",
            "path": "/remediate/administrative-operations-adminops/incident-response",
            "description": ""
          },
          {
            "key": "execute-approved-changes",
            "label": "Execute Approved Changes",
            "path": "/remediate/administrative-operations-adminops/execute-approved-changes",
            "description": ""
          },
          {
            "key": "change-evidence",
            "label": "Change Evidence",
            "path": "/remediate/administrative-operations-adminops/change-evidence",
            "description": ""
          }
        ]
      },
      {
        "key": "remediation-tracking",
        "label": "Remediation Tracking",
        "path": "/remediate/remediation-tracking",
        "items": [
          {
            "key": "open-remediation-items",
            "label": "Open Remediation Items",
            "path": "/remediate/remediation-tracking/open-remediation-items",
            "description": ""
          },
          {
            "key": "in-progress",
            "label": "In Progress",
            "path": "/remediate/remediation-tracking/in-progress",
            "description": ""
          },
          {
            "key": "pending-verification",
            "label": "Pending Verification",
            "path": "/remediate/remediation-tracking/pending-verification",
            "description": ""
          },
          {
            "key": "completed",
            "label": "Completed",
            "path": "/remediate/remediation-tracking/completed",
            "description": ""
          },
          {
            "key": "failed-blocked",
            "label": "Failed / Blocked",
            "path": "/remediate/remediation-tracking/failed-blocked",
            "description": ""
          },
          {
            "key": "remediation-history",
            "label": "Remediation History",
            "path": "/remediate/remediation-tracking/remediation-history",
            "description": ""
          }
        ]
      }
    ]
  },
  {
    "key": "evidence",
    "label": "Collect Evidence",
    "module": "evidenceops",
    "description": "EvidenceOps – evidence collection, generation, mapping and validation",
    "groups": [
      {
        "key": "evidence-overview",
        "label": "Evidence Overview",
        "path": "/evidence/evidence-overview",
        "items": [
          {
            "key": "evidence-dashboard",
            "label": "Evidence Dashboard",
            "path": "/evidence/evidence-overview/evidence-dashboard",
            "description": ""
          },
          {
            "key": "evidence-collection-status",
            "label": "Evidence Collection Status",
            "path": "/evidence/evidence-overview/evidence-collection-status",
            "description": ""
          },
          {
            "key": "evidence-coverage",
            "label": "Evidence Coverage",
            "path": "/evidence/evidence-overview/evidence-coverage",
            "description": ""
          },
          {
            "key": "evidence-pending-review",
            "label": "Evidence Pending Review",
            "path": "/evidence/evidence-overview/evidence-pending-review",
            "description": ""
          }
        ]
      },
      {
        "key": "evidence-explorer",
        "label": "Evidence Explorer",
        "path": "/evidence/evidence-explorer",
        "items": [
          {
            "key": "all-evidence",
            "label": "All Evidence",
            "path": "/evidence/evidence-explorer/all-evidence",
            "description": ""
          },
          {
            "key": "evidence-by-requirement",
            "label": "Evidence by Requirement",
            "path": "/evidence/evidence-explorer/evidence-by-requirement",
            "description": ""
          },
          {
            "key": "evidence-by-control-family",
            "label": "Evidence by Control Family",
            "path": "/evidence/evidence-explorer/evidence-by-control-family",
            "description": ""
          },
          {
            "key": "evidence-by-system",
            "label": "Evidence by System",
            "path": "/evidence/evidence-explorer/evidence-by-system",
            "description": ""
          },
          {
            "key": "evidence-by-source",
            "label": "Evidence by Source",
            "path": "/evidence/evidence-explorer/evidence-by-source",
            "description": ""
          }
        ]
      },
      {
        "key": "evidence-collection",
        "label": "Evidence Collection",
        "path": "/evidence/evidence-collection",
        "items": [
          {
            "key": "manual-evidence-submission",
            "label": "Manual Evidence Submission",
            "path": "/evidence/evidence-collection/manual-evidence-submission",
            "description": ""
          },
          {
            "key": "automated-evidence-collection",
            "label": "Automated Evidence Collection",
            "path": "/evidence/evidence-collection/automated-evidence-collection",
            "description": ""
          },
          {
            "key": "stamper-evidence",
            "label": "Stamper Evidence",
            "path": "/evidence/evidence-collection/stamper-evidence",
            "description": ""
          },
          {
            "key": "adminops-evidence",
            "label": "AdminOps Evidence",
            "path": "/evidence/evidence-collection/adminops-evidence",
            "description": ""
          },
          {
            "key": "evidence-collector",
            "label": "Evidence Collector",
            "path": "/evidence/evidence-collection/evidence-collector",
            "description": ""
          },
          {
            "key": "upload-evidence",
            "label": "Upload Evidence",
            "path": "/evidence/evidence-collection/upload-evidence",
            "description": ""
          },
          {
            "key": "evidence-requests",
            "label": "Evidence Requests",
            "path": "/evidence/evidence-collection/evidence-requests",
            "description": ""
          }
        ]
      },
      {
        "key": "standard-evidence-catalog",
        "label": "Standard Evidence Catalog",
        "path": "/evidence/standard-evidence-catalog",
        "items": [
          {
            "key": "standard-evidence-documents",
            "label": "Standard Evidence Documents",
            "path": "/evidence/standard-evidence-catalog/standard-evidence-documents",
            "description": ""
          },
          {
            "key": "evidence-templates",
            "label": "Evidence Templates",
            "path": "/evidence/standard-evidence-catalog/evidence-templates",
            "description": ""
          },
          {
            "key": "evidence-registers",
            "label": "Evidence Registers",
            "path": "/evidence/standard-evidence-catalog/evidence-registers",
            "description": ""
          },
          {
            "key": "requirement-to-evidence-mapping",
            "label": "Requirement-to-Evidence Mapping",
            "path": "/evidence/standard-evidence-catalog/requirement-to-evidence-mapping",
            "description": ""
          },
          {
            "key": "evidence-instructions",
            "label": "Evidence Instructions",
            "path": "/evidence/standard-evidence-catalog/evidence-instructions",
            "description": ""
          }
        ]
      },
      {
        "key": "evidence-management",
        "label": "Evidence Management",
        "path": "/evidence/evidence-management",
        "items": [
          {
            "key": "evidence-details",
            "label": "Evidence Details",
            "path": "/evidence/evidence-management/evidence-details",
            "description": ""
          },
          {
            "key": "evidence-version-history",
            "label": "Evidence Version History",
            "path": "/evidence/evidence-management/evidence-version-history",
            "description": ""
          },
          {
            "key": "evidence-metadata",
            "label": "Evidence Metadata",
            "path": "/evidence/evidence-management/evidence-metadata",
            "description": ""
          },
          {
            "key": "evidence-classification",
            "label": "Evidence Classification",
            "path": "/evidence/evidence-management/evidence-classification",
            "description": ""
          },
          {
            "key": "evidence-ownership",
            "label": "Evidence Ownership",
            "path": "/evidence/evidence-management/evidence-ownership",
            "description": ""
          },
          {
            "key": "evidence-expiry-review",
            "label": "Evidence Expiry / Review",
            "path": "/evidence/evidence-management/evidence-expiry-review",
            "description": ""
          }
        ]
      },
      {
        "key": "evidence-validation",
        "label": "Evidence Validation",
        "path": "/evidence/evidence-validation",
        "items": [
          {
            "key": "validation-queue",
            "label": "Validation Queue",
            "path": "/evidence/evidence-validation/validation-queue",
            "description": ""
          },
          {
            "key": "completeness-checks",
            "label": "Completeness Checks",
            "path": "/evidence/evidence-validation/completeness-checks",
            "description": ""
          },
          {
            "key": "format-validation",
            "label": "Format Validation",
            "path": "/evidence/evidence-validation/format-validation",
            "description": ""
          },
          {
            "key": "requirement-mapping-validation",
            "label": "Requirement Mapping Validation",
            "path": "/evidence/evidence-validation/requirement-mapping-validation",
            "description": ""
          },
          {
            "key": "evidence-review-approval",
            "label": "Evidence Review & Approval",
            "path": "/evidence/evidence-validation/evidence-review-approval",
            "description": ""
          },
          {
            "key": "rejected-evidence",
            "label": "Rejected Evidence",
            "path": "/evidence/evidence-validation/rejected-evidence",
            "description": ""
          }
        ]
      },
      {
        "key": "evidence-repository",
        "label": "Evidence Repository",
        "path": "/evidence/evidence-repository",
        "items": [
          {
            "key": "evidence-library",
            "label": "Evidence Library",
            "path": "/evidence/evidence-repository/evidence-library",
            "description": ""
          },
          {
            "key": "document-repository",
            "label": "Document Repository",
            "path": "/evidence/evidence-repository/document-repository",
            "description": ""
          },
          {
            "key": "evidence-search",
            "label": "Evidence Search",
            "path": "/evidence/evidence-repository/evidence-search",
            "description": ""
          },
          {
            "key": "retention-archival",
            "label": "Retention & Archival",
            "path": "/evidence/evidence-repository/retention-archival",
            "description": ""
          }
        ]
      }
    ]
  },
  {
    "key": "monitor",
    "label": "Monitor",
    "module": "evidenceops",
    "description": "Continuous compliance, change tracking and control effectiveness",
    "groups": [
      {
        "key": "monitoring-overview",
        "label": "Monitoring Overview",
        "path": "/monitor/monitoring-overview",
        "items": [
          {
            "key": "compliance-dashboard",
            "label": "Compliance Dashboard",
            "path": "/monitor/monitoring-overview/compliance-dashboard",
            "description": ""
          },
          {
            "key": "overall-compliance-status",
            "label": "Overall Compliance Status",
            "path": "/monitor/monitoring-overview/overall-compliance-status",
            "description": ""
          },
          {
            "key": "readiness-trends",
            "label": "Readiness Trends",
            "path": "/monitor/monitoring-overview/readiness-trends",
            "description": ""
          },
          {
            "key": "compliance-score-trends",
            "label": "Compliance Score Trends",
            "path": "/monitor/monitoring-overview/compliance-score-trends",
            "description": ""
          }
        ]
      },
      {
        "key": "continuous-control-monitoring",
        "label": "Continuous Control Monitoring",
        "path": "/monitor/continuous-control-monitoring",
        "items": [
          {
            "key": "control-status",
            "label": "Control Status",
            "path": "/monitor/continuous-control-monitoring/control-status",
            "description": ""
          },
          {
            "key": "control-effectiveness",
            "label": "Control Effectiveness",
            "path": "/monitor/continuous-control-monitoring/control-effectiveness",
            "description": ""
          },
          {
            "key": "failed-controls",
            "label": "Failed Controls",
            "path": "/monitor/continuous-control-monitoring/failed-controls",
            "description": ""
          },
          {
            "key": "control-exceptions",
            "label": "Control Exceptions",
            "path": "/monitor/continuous-control-monitoring/control-exceptions",
            "description": ""
          },
          {
            "key": "security-configuration-drift",
            "label": "Security Configuration Drift",
            "path": "/monitor/continuous-control-monitoring/security-configuration-drift",
            "description": ""
          }
        ]
      },
      {
        "key": "evidence-monitoring",
        "label": "Evidence Monitoring",
        "path": "/monitor/evidence-monitoring",
        "items": [
          {
            "key": "evidence-freshness",
            "label": "Evidence Freshness",
            "path": "/monitor/evidence-monitoring/evidence-freshness",
            "description": ""
          },
          {
            "key": "expiring-evidence",
            "label": "Expiring Evidence",
            "path": "/monitor/evidence-monitoring/expiring-evidence",
            "description": ""
          },
          {
            "key": "missing-evidence",
            "label": "Missing Evidence",
            "path": "/monitor/evidence-monitoring/missing-evidence",
            "description": ""
          },
          {
            "key": "evidence-change-history",
            "label": "Evidence Change History",
            "path": "/monitor/evidence-monitoring/evidence-change-history",
            "description": ""
          },
          {
            "key": "evidence-revalidation",
            "label": "Evidence Revalidation",
            "path": "/monitor/evidence-monitoring/evidence-revalidation",
            "description": ""
          }
        ]
      },
      {
        "key": "change-monitoring",
        "label": "Change Monitoring",
        "path": "/monitor/change-monitoring",
        "items": [
          {
            "key": "system-changes",
            "label": "System Changes",
            "path": "/monitor/change-monitoring/system-changes",
            "description": ""
          },
          {
            "key": "configuration-changes",
            "label": "Configuration Changes",
            "path": "/monitor/change-monitoring/configuration-changes",
            "description": ""
          },
          {
            "key": "scope-changes",
            "label": "Scope Changes",
            "path": "/monitor/change-monitoring/scope-changes",
            "description": ""
          },
          {
            "key": "identity-access-changes",
            "label": "Identity & Access Changes",
            "path": "/monitor/change-monitoring/identity-access-changes",
            "description": ""
          },
          {
            "key": "change-impact-assessment",
            "label": "Change Impact Assessment",
            "path": "/monitor/change-monitoring/change-impact-assessment",
            "description": ""
          }
        ]
      },
      {
        "key": "alerts-notifications",
        "label": "Alerts & Notifications",
        "path": "/monitor/alerts-notifications",
        "items": [
          {
            "key": "active-alerts",
            "label": "Active Alerts",
            "path": "/monitor/alerts-notifications/active-alerts",
            "description": ""
          },
          {
            "key": "compliance-notifications",
            "label": "Compliance Notifications",
            "path": "/monitor/alerts-notifications/compliance-notifications",
            "description": ""
          },
          {
            "key": "overdue-actions",
            "label": "Overdue Actions",
            "path": "/monitor/alerts-notifications/overdue-actions",
            "description": ""
          },
          {
            "key": "escalations",
            "label": "Escalations",
            "path": "/monitor/alerts-notifications/escalations",
            "description": ""
          }
        ]
      },
      {
        "key": "compliance-trends",
        "label": "Compliance Trends",
        "path": "/monitor/compliance-trends",
        "items": [
          {
            "key": "requirement-trends",
            "label": "Requirement Trends",
            "path": "/monitor/compliance-trends/requirement-trends",
            "description": ""
          },
          {
            "key": "control-family-trends",
            "label": "Control Family Trends",
            "path": "/monitor/compliance-trends/control-family-trends",
            "description": ""
          },
          {
            "key": "risk-trends",
            "label": "Risk Trends",
            "path": "/monitor/compliance-trends/risk-trends",
            "description": ""
          },
          {
            "key": "historical-compliance",
            "label": "Historical Compliance",
            "path": "/monitor/compliance-trends/historical-compliance",
            "description": ""
          }
        ]
      },
      {
        "key": "audit-activity",
        "label": "Audit & Activity",
        "path": "/monitor/audit-activity",
        "items": [
          {
            "key": "user-activity",
            "label": "User Activity",
            "path": "/monitor/audit-activity/user-activity",
            "description": ""
          },
          {
            "key": "system-activity",
            "label": "System Activity",
            "path": "/monitor/audit-activity/system-activity",
            "description": ""
          },
          {
            "key": "compliance-event-history",
            "label": "Compliance Event History",
            "path": "/monitor/audit-activity/compliance-event-history",
            "description": ""
          }
        ]
      }
    ]
  },
  {
    "key": "prepare",
    "label": "Prepare for Assessment",
    "module": "evidenceops",
    "description": "Assessment readiness, documentation and assessor-facing packages",
    "groups": [
      {
        "key": "assessment-preparation-overview",
        "label": "Assessment Preparation Overview",
        "path": "/prepare/assessment-preparation-overview",
        "items": [
          {
            "key": "assessment-readiness-dashboard",
            "label": "Assessment Readiness Dashboard",
            "path": "/prepare/assessment-preparation-overview/assessment-readiness-dashboard",
            "description": ""
          },
          {
            "key": "readiness-checklist",
            "label": "Readiness Checklist",
            "path": "/prepare/assessment-preparation-overview/readiness-checklist",
            "description": ""
          },
          {
            "key": "outstanding-items",
            "label": "Outstanding Items",
            "path": "/prepare/assessment-preparation-overview/outstanding-items",
            "description": ""
          }
        ]
      },
      {
        "key": "assessment-documentation",
        "label": "Assessment Documentation",
        "path": "/prepare/assessment-documentation",
        "items": [
          {
            "key": "system-security-plan-ssp",
            "label": "System Security Plan (SSP)",
            "path": "/prepare/assessment-documentation/system-security-plan-ssp",
            "description": ""
          },
          {
            "key": "plan-of-action-milestones-poa-m",
            "label": "Plan of Action & Milestones (POA&M)",
            "path": "/prepare/assessment-documentation/plan-of-action-milestones-poa-m",
            "description": ""
          },
          {
            "key": "sprs-score",
            "label": "SPRS Score",
            "path": "/prepare/assessment-documentation/sprs-score",
            "description": ""
          },
          {
            "key": "requirement-assessment-results",
            "label": "Requirement Assessment Results",
            "path": "/prepare/assessment-documentation/requirement-assessment-results",
            "description": ""
          },
          {
            "key": "control-implementation-statements",
            "label": "Control Implementation Statements",
            "path": "/prepare/assessment-documentation/control-implementation-statements",
            "description": ""
          }
        ]
      },
      {
        "key": "evidence-packages",
        "label": "Evidence Packages",
        "path": "/prepare/evidence-packages",
        "items": [
          {
            "key": "all-evidence-packages",
            "label": "All Evidence Packages",
            "path": "/prepare/evidence-packages/all-evidence-packages",
            "description": ""
          },
          {
            "key": "create-evidence-package",
            "label": "Create Evidence Package",
            "path": "/prepare/evidence-packages/create-evidence-package",
            "description": ""
          },
          {
            "key": "package-by-requirement",
            "label": "Package by Requirement",
            "path": "/prepare/evidence-packages/package-by-requirement",
            "description": ""
          },
          {
            "key": "package-by-control-family",
            "label": "Package by Control Family",
            "path": "/prepare/evidence-packages/package-by-control-family",
            "description": ""
          },
          {
            "key": "package-by-assessment-objective",
            "label": "Package by Assessment Objective",
            "path": "/prepare/evidence-packages/package-by-assessment-objective",
            "description": ""
          },
          {
            "key": "package-validation",
            "label": "Package Validation",
            "path": "/prepare/evidence-packages/package-validation",
            "description": ""
          },
          {
            "key": "package-version-history",
            "label": "Package Version History",
            "path": "/prepare/evidence-packages/package-version-history",
            "description": ""
          }
        ]
      },
      {
        "key": "assessment-review",
        "label": "Assessment Review",
        "path": "/prepare/assessment-review",
        "items": [
          {
            "key": "internal-assessment-review",
            "label": "Internal Assessment Review",
            "path": "/prepare/assessment-review/internal-assessment-review",
            "description": ""
          },
          {
            "key": "evidence-completeness-review",
            "label": "Evidence Completeness Review",
            "path": "/prepare/assessment-review/evidence-completeness-review",
            "description": ""
          },
          {
            "key": "gap-closure-verification",
            "label": "Gap Closure Verification",
            "path": "/prepare/assessment-review/gap-closure-verification",
            "description": ""
          },
          {
            "key": "assessment-sign-off",
            "label": "Assessment Sign-off",
            "path": "/prepare/assessment-review/assessment-sign-off",
            "description": ""
          }
        ]
      },
      {
        "key": "assessor-workspace",
        "label": "Assessor Workspace",
        "path": "/prepare/assessor-workspace",
        "items": [
          {
            "key": "assessor-read-only-view",
            "label": "Assessor Read-Only View",
            "path": "/prepare/assessor-workspace/assessor-read-only-view",
            "description": ""
          },
          {
            "key": "requirement-evidence-view",
            "label": "Requirement Evidence View",
            "path": "/prepare/assessor-workspace/requirement-evidence-view",
            "description": ""
          },
          {
            "key": "evidence-navigation",
            "label": "Evidence Navigation",
            "path": "/prepare/assessor-workspace/evidence-navigation",
            "description": ""
          },
          {
            "key": "assessment-findings",
            "label": "Assessment Findings",
            "path": "/prepare/assessor-workspace/assessment-findings",
            "description": ""
          },
          {
            "key": "assessor-requests",
            "label": "Assessor Requests",
            "path": "/prepare/assessor-workspace/assessor-requests",
            "description": ""
          }
        ]
      },
      {
        "key": "reports-exports",
        "label": "Reports & Exports",
        "path": "/prepare/reports-exports",
        "items": [
          {
            "key": "cmmc-readiness-report",
            "label": "CMMC Readiness Report",
            "path": "/prepare/reports-exports/cmmc-readiness-report",
            "description": ""
          },
          {
            "key": "requirement-coverage-report",
            "label": "Requirement Coverage Report",
            "path": "/prepare/reports-exports/requirement-coverage-report",
            "description": ""
          },
          {
            "key": "gap-analysis-report",
            "label": "Gap Analysis Report",
            "path": "/prepare/reports-exports/gap-analysis-report",
            "description": ""
          },
          {
            "key": "sprs-report",
            "label": "SPRS Report",
            "path": "/prepare/reports-exports/sprs-report",
            "description": ""
          },
          {
            "key": "poa-m-report",
            "label": "POA&M Report",
            "path": "/prepare/reports-exports/poa-m-report",
            "description": ""
          },
          {
            "key": "evidence-inventory-report",
            "label": "Evidence Inventory Report",
            "path": "/prepare/reports-exports/evidence-inventory-report",
            "description": ""
          },
          {
            "key": "assessment-package-export",
            "label": "Assessment Package Export",
            "path": "/prepare/reports-exports/assessment-package-export",
            "description": ""
          }
        ]
      }
    ]
  },
  {
    "key": "admin",
    "label": "Administration",
    "module": "platform",
    "description": "Users, roles, access, audit, system health and settings",
    "groups": [
      {
        "key": "users-roles",
        "label": "Users & Roles",
        "path": "/admin/users-roles",
        "items": [
          {
            "key": "user-management",
            "label": "User Management",
            "path": "/admin/users-roles/user-management",
            "description": ""
          },
          {
            "key": "role-management",
            "label": "Role Management",
            "path": "/admin/users-roles/role-management",
            "description": ""
          },
          {
            "key": "permission-management",
            "label": "Permission Management",
            "path": "/admin/users-roles/permission-management",
            "description": ""
          },
          {
            "key": "role-assignment",
            "label": "Role Assignment",
            "path": "/admin/users-roles/role-assignment",
            "description": ""
          }
        ]
      },
      {
        "key": "access-management",
        "label": "Access Management",
        "path": "/admin/access-management",
        "items": [
          {
            "key": "rbac-policies",
            "label": "RBAC Policies",
            "path": "/admin/access-management/rbac-policies",
            "description": ""
          },
          {
            "key": "access-requests",
            "label": "Access Requests",
            "path": "/admin/access-management/access-requests",
            "description": ""
          },
          {
            "key": "access-reviews",
            "label": "Access Reviews",
            "path": "/admin/access-management/access-reviews",
            "description": ""
          }
        ]
      },
      {
        "key": "audit-log",
        "label": "Audit Log",
        "path": "/admin/audit-log",
        "items": []
      },
      {
        "key": "system-health",
        "label": "System Health",
        "path": "/admin/system-health",
        "items": [
          {
            "key": "service-status",
            "label": "Service Status",
            "path": "/admin/system-health/service-status",
            "description": ""
          },
          {
            "key": "api-health",
            "label": "API Health",
            "path": "/admin/system-health/api-health",
            "description": ""
          },
          {
            "key": "database-health",
            "label": "Database Health",
            "path": "/admin/system-health/database-health",
            "description": ""
          },
          {
            "key": "background-jobs",
            "label": "Background Jobs",
            "path": "/admin/system-health/background-jobs",
            "description": ""
          },
          {
            "key": "integration-health",
            "label": "Integration Health",
            "path": "/admin/system-health/integration-health",
            "description": ""
          }
        ]
      },
      {
        "key": "settings",
        "label": "Settings",
        "path": "/admin/settings",
        "items": [
          {
            "key": "organization-settings",
            "label": "Organization Settings",
            "path": "/admin/settings/organization-settings",
            "description": ""
          },
          {
            "key": "system-settings",
            "label": "System Settings",
            "path": "/admin/settings/system-settings",
            "description": ""
          },
          {
            "key": "notification-settings",
            "label": "Notification Settings",
            "path": "/admin/settings/notification-settings",
            "description": ""
          },
          {
            "key": "security-settings",
            "label": "Security Settings",
            "path": "/admin/settings/security-settings",
            "description": ""
          },
          {
            "key": "retention-settings",
            "label": "Retention Settings",
            "path": "/admin/settings/retention-settings",
            "description": ""
          }
        ]
      }
    ]
  }
] as const satisfies readonly LifecycleSection[];

/** Every page keyed by its path (`/section/group/item`). */
export const LIFECYCLE_PAGES: ReadonlyMap<string, { section: LifecycleSection; group: LifecycleGroup; item: LifecycleItem }> = (() => {
  const m = new Map<string, { section: LifecycleSection; group: LifecycleGroup; item: LifecycleItem }>();
  for (const section of LIFECYCLE_NAV) {
    for (const group of section.groups) {
      // A group without pages (Overview, Audit Log) is a page itself.
      if (group.items.length === 0) m.set(group.path, { section, group, item: { key: group.key, label: group.label, path: group.path, description: '' } });
      for (const item of group.items) m.set(item.path, { section, group, item });
    }
  }
  return m;
})();

export const LIFECYCLE_COUNTS = {
  sections: LIFECYCLE_NAV.length,
  groups: LIFECYCLE_NAV.reduce((n, s) => n + s.groups.length, 0),
  pages: LIFECYCLE_NAV.reduce((n, s) => n + s.groups.reduce((k, g) => k + g.items.length, 0), 0),
} as const;
