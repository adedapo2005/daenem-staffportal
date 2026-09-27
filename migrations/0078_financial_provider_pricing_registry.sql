PRAGMA foreign_keys = ON;

-- Shared pricing facts; business policy and financial ledgers remain separate.
-- No prices are seeded: unknown pricing must stay visibly unverified.
CREATE TABLE IF NOT EXISTS financial_provider_pricing (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (length(provider) BETWEEN 1 AND 80),
  service TEXT NOT NULL CHECK (length(service) BETWEEN 1 AND 120),
  pricing_model TEXT NOT NULL CHECK (pricing_model IN (
    'FREE','FIXED','PERCENTAGE','PERCENTAGE_FIXED','TIERED','PER_PAGE',
    'PER_REQUEST','PER_SUCCESSFUL_REQUEST','UNKNOWN_REVERIFY'
  )),
  fixed_amount_minor INTEGER CHECK (fixed_amount_minor IS NULL OR fixed_amount_minor >= 0),
  percentage_bps INTEGER CHECK (percentage_bps IS NULL OR percentage_bps BETWEEN 0 AND 10000),
  minimum_amount_minor INTEGER CHECK (minimum_amount_minor IS NULL OR minimum_amount_minor >= 0),
  maximum_amount_minor INTEGER CHECK (maximum_amount_minor IS NULL OR maximum_amount_minor >= 0),
  cap_amount_minor INTEGER CHECK (cap_amount_minor IS NULL OR cap_amount_minor >= 0),
  vat_treatment TEXT NOT NULL DEFAULT 'unknown' CHECK (vat_treatment IN ('included','excluded','not_applicable','unknown')),
  currency TEXT NOT NULL CHECK (currency GLOB '[A-Z][A-Z][A-Z]'),
  effective_at TEXT,
  last_verified_at TEXT,
  official_source TEXT,
  status TEXT NOT NULL DEFAULT 'unknown_reverify' CHECK (status IN ('verified','unknown_reverify','inactive')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (maximum_amount_minor IS NULL OR minimum_amount_minor IS NULL OR maximum_amount_minor >= minimum_amount_minor),
  UNIQUE(provider, service, currency)
);

CREATE TABLE IF NOT EXISTS financial_provider_pricing_businesses (
  pricing_id TEXT NOT NULL REFERENCES financial_provider_pricing(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  available INTEGER NOT NULL DEFAULT 0 CHECK (available IN (0,1)),
  PRIMARY KEY(pricing_id, company_id),
  CHECK (company_id IN ('company-printing','company-bakery','company-autos','company-properties','company-logistics'))
);
