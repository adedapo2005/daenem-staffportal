PRAGMA foreign_keys = ON;

-- Routing policy is configuration only. No provider selection or external call
-- is performed by this registry until a separately authorized executor exists.
CREATE TABLE IF NOT EXISTS financial_provider_routing_policies (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE
    CHECK (company_id IN ('company-printing','company-bakery','company-autos','company-properties','company-logistics')),
  service TEXT NOT NULL CHECK (length(service) BETWEEN 1 AND 120),
  provider TEXT NOT NULL CHECK (provider IN ('paystack','monnify','mono','manual_import')),
  priority INTEGER NOT NULL CHECK (priority BETWEEN 1 AND 20),
  status TEXT NOT NULL DEFAULT 'disabled' CHECK (status IN ('enabled','disabled','owner_action_required')),
  routing_reason TEXT NOT NULL CHECK (length(routing_reason) BETWEEN 1 AND 1000),
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,service,provider),
  UNIQUE(company_id,service,priority)
);

CREATE INDEX IF NOT EXISTS idx_financial_provider_routing_scope
  ON financial_provider_routing_policies(company_id,service,status,priority);
