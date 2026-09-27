PRAGMA foreign_keys = ON;

-- Provider spend limits are policy records, not ledger entries. Each row is
-- scoped to one of the five approved businesses and a provider/module slice.
-- '*' means all providers or modules for that business.
CREATE TABLE IF NOT EXISTS financial_provider_budgets (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
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
  CHECK (company_id IN ('company-printing','company-bakery','company-autos','company-properties','company-logistics')),
  UNIQUE(company_id, provider_scope, module_scope, period, currency)
);

CREATE INDEX IF NOT EXISTS idx_financial_provider_budgets_active_scope
  ON financial_provider_budgets(active, company_id, period, provider_scope, module_scope);
