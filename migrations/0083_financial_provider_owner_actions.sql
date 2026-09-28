PRAGMA foreign_keys = ON;

-- Track provider setup gates independently so one business/provider cannot block another.
CREATE TABLE IF NOT EXISTS financial_provider_owner_actions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE
    CHECK (company_id IN ('company-printing','company-bakery','company-autos','company-properties','company-logistics')),
  provider TEXT NOT NULL CHECK (length(provider) BETWEEN 1 AND 80),
  action TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 240),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 1000),
  blocked TEXT NOT NULL CHECK (length(blocked) BETWEEN 1 AND 1000),
  not_blocked TEXT NOT NULL CHECK (length(not_blocked) BETWEEN 1 AND 1000),
  clearing_evidence TEXT NOT NULL CHECK (length(clearing_evidence) BETWEEN 1 AND 1000),
  status TEXT NOT NULL DEFAULT 'waiting_owner' CHECK (status IN ('waiting_owner','cleared','cancelled')),
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,provider,action)
);

CREATE INDEX IF NOT EXISTS idx_financial_provider_owner_actions_scope
  ON financial_provider_owner_actions(company_id,status,updated_at DESC);
