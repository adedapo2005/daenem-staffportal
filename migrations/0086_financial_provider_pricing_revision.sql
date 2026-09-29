PRAGMA foreign_keys = ON;

-- Identify the exact registry facts used when estimating or recording a cost.
ALTER TABLE financial_provider_pricing
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0);

ALTER TABLE financial_provider_cost_events
  ADD COLUMN pricing_revision INTEGER CHECK (pricing_revision IS NULL OR pricing_revision > 0);
