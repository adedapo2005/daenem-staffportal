-- Staging-only StaffPortal Microsoft multitenant account links.
-- Additive migration. Do NOT apply to production.
-- Stable (tenant ID, Microsoft object ID) identity, never mutable email/UPN.
-- Rollback: set MICROSOFT_AUTH_MODE=single_tenant; retain historical links for audit.
CREATE TABLE IF NOT EXISTS staffportal_external_identity_links (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'microsoft' CHECK (provider='microsoft'),
  tenant_id TEXT NOT NULL,
  object_id TEXT NOT NULL,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  linked_by_employee_id TEXT NOT NULL REFERENCES employees(id),
  linked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  UNIQUE(provider,tenant_id,object_id),
  UNIQUE(provider,employee_id)
);
CREATE INDEX IF NOT EXISTS idx_staffportal_oauth_links_employee
  ON staffportal_external_identity_links(employee_id,revoked_at);
