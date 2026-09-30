PRAGMA foreign_keys = ON;

-- Optional attribution for new provider-cost evidence. Existing events remain
-- unassigned; append-only history must not be rewritten to guess a cost centre.
ALTER TABLE financial_provider_cost_events
  ADD COLUMN cost_center_id TEXT REFERENCES spend_cost_centers(id) ON DELETE RESTRICT;

CREATE TRIGGER financial_provider_cost_events_cost_center_scope
BEFORE INSERT ON financial_provider_cost_events
WHEN NEW.cost_center_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM spend_cost_centers
    WHERE id=NEW.cost_center_id AND company_id=NEW.company_id
  )
BEGIN
  SELECT RAISE(ABORT, 'provider-cost centre must belong to the event company');
END;

CREATE INDEX idx_financial_provider_cost_center_time
  ON financial_provider_cost_events(company_id,cost_center_id,occurred_at DESC)
  WHERE cost_center_id IS NOT NULL;
