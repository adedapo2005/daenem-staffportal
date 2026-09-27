PRAGMA foreign_keys = ON;

-- Append-only internal provider-cost evidence. Business ledgers remain separate.
-- This table stores no provider credentials or raw request/response payloads.
CREATE TABLE IF NOT EXISTS financial_provider_cost_events (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT
    CHECK (company_id IN ('company-printing','company-bakery','company-autos','company-properties','company-logistics')),
  actor_employee_id TEXT REFERENCES employees(id) ON DELETE RESTRICT,
  actor_role_code TEXT,
  action TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 100),
  amount_minor INTEGER CHECK (amount_minor IS NULL OR amount_minor >= 0),
  currency TEXT CHECK (currency IS NULL OR currency GLOB '[A-Z][A-Z][A-Z]'),
  provider TEXT,
  estimated_cost_minor INTEGER CHECK (estimated_cost_minor IS NULL OR estimated_cost_minor >= 0),
  actual_cost_minor INTEGER CHECK (actual_cost_minor IS NULL OR actual_cost_minor >= 0),
  cost_currency TEXT CHECK (cost_currency IS NULL OR cost_currency GLOB '[A-Z][A-Z][A-Z]'),
  pricing_id TEXT REFERENCES financial_provider_pricing(id) ON DELETE RESTRICT,
  pricing_verified_at TEXT,
  approval_id TEXT,
  maker_employee_id TEXT REFERENCES employees(id) ON DELETE RESTRICT,
  checker_employee_id TEXT REFERENCES employees(id) ON DELETE RESTRICT,
  provider_reference TEXT,
  provider_result TEXT,
  retry_of_event_id TEXT REFERENCES financial_provider_cost_events(id) ON DELETE RESTRICT,
  reversal_of_event_id TEXT REFERENCES financial_provider_cost_events(id) ON DELETE RESTRICT,
  occurred_at TEXT NOT NULL,
  evidence_reference TEXT CHECK (evidence_reference IS NULL OR length(evidence_reference) BETWEEN 1 AND 160),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((amount_minor IS NULL) = (currency IS NULL)),
  CHECK ((estimated_cost_minor IS NULL AND actual_cost_minor IS NULL) OR (cost_currency IS NOT NULL AND provider IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_financial_provider_cost_company_time
  ON financial_provider_cost_events(company_id, occurred_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_financial_provider_cost_provider_time
  ON financial_provider_cost_events(provider, occurred_at DESC, company_id);
CREATE INDEX IF NOT EXISTS idx_financial_provider_cost_pricing
  ON financial_provider_cost_events(pricing_id, occurred_at DESC)
  WHERE pricing_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS financial_provider_cost_events_no_update
BEFORE UPDATE ON financial_provider_cost_events
BEGIN
  SELECT RAISE(ABORT, 'financial provider-cost evidence is append-only');
END;

CREATE TRIGGER IF NOT EXISTS financial_provider_cost_events_no_delete
BEFORE DELETE ON financial_provider_cost_events
BEGIN
  SELECT RAISE(ABORT, 'financial provider-cost evidence is append-only');
END;
