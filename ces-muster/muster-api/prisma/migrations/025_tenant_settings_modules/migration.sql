-- Module visibility flags per tenant (portal show/hide; the API keeps enforcing the role matrix).
ALTER TABLE "tenant_settings" ADD COLUMN "modules" JSONB NOT NULL DEFAULT '{}';
