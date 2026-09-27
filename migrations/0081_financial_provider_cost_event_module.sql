-- Preserve historical event truth while enabling module-scoped cost evidence.
-- Existing rows remain NULL because their requesting module is not recoverable.
ALTER TABLE financial_provider_cost_events
  ADD COLUMN requesting_module TEXT
  CHECK (requesting_module IS NULL OR length(requesting_module) BETWEEN 1 AND 80);

CREATE INDEX IF NOT EXISTS idx_financial_provider_cost_module_time
  ON financial_provider_cost_events(company_id, requesting_module, occurred_at DESC);
