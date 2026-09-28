PRAGMA foreign_keys = ON;

-- Organization-wide provider spend ceiling across the five approved businesses.
-- Business budgets remain independent and continue to use financial_provider_budgets.
CREATE TABLE IF NOT EXISTS financial_provider_group_budgets (
  id TEXT PRIMARY KEY,
  provider_scope TEXT NOT NULL DEFAULT '*' CHECK (length(provider_scope) BETWEEN 1 AND 80),
  module_scope TEXT NOT NULL DEFAULT '*' CHECK (length(module_scope) BETWEEN 1 AND 80),
  period TEXT NOT NULL CHECK (period IN ('monthly','daily')),
  budget_minor INTEGER NOT NULL CHECK (budget_minor > 0),
  currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  alert_threshold_percent INTEGER NOT NULL DEFAULT 80 CHECK (alert_threshold_percent BETWEEN 1 AND 100),
  exhausted_action TEXT NOT NULL DEFAULT 'require_approval'
    CHECK (exhausted_action IN ('require_approval','block_noncritical')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider_scope, module_scope, period, currency)
);

CREATE INDEX IF NOT EXISTS idx_financial_provider_group_budgets_active
  ON financial_provider_group_budgets(active, period, provider_scope, module_scope);
