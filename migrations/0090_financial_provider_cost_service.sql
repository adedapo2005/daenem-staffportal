-- Preserve the service as event-time evidence; current pricing can change.
-- Existing append-only events remain unattributed rather than guessed/backfilled.
ALTER TABLE financial_provider_cost_events ADD COLUMN service TEXT
  CHECK (service IS NULL OR (length(service) BETWEEN 1 AND 120 AND length(trim(service)) > 0
    AND service NOT GLOB '*[' || char(1) || '-' || char(31) || char(127) || ']*'
    AND instr(service, char(0)) = 0));

CREATE INDEX idx_financial_provider_cost_service_time
  ON financial_provider_cost_events(company_id,service,occurred_at DESC)
  WHERE service IS NOT NULL;
