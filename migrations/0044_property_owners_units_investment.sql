PRAGMA foreign_keys = ON;

-- Homes & Properties phase: owner portfolio, unit register and investment recovery.
CREATE TABLE IF NOT EXISTS property_investments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-properties' REFERENCES companies(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  land_cost_kobo INTEGER NOT NULL DEFAULT 0 CHECK (land_cost_kobo >= 0),
  construction_cost_kobo INTEGER NOT NULL DEFAULT 0 CHECK (construction_cost_kobo >= 0),
  renovation_cost_kobo INTEGER NOT NULL DEFAULT 0 CHECK (renovation_cost_kobo >= 0),
  documentation_cost_kobo INTEGER NOT NULL DEFAULT 0 CHECK (documentation_cost_kobo >= 0),
  agency_cost_kobo INTEGER NOT NULL DEFAULT 0 CHECK (agency_cost_kobo >= 0),
  legal_cost_kobo INTEGER NOT NULL DEFAULT 0 CHECK (legal_cost_kobo >= 0),
  miscellaneous_cost_kobo INTEGER NOT NULL DEFAULT 0 CHECK (miscellaneous_cost_kobo >= 0),
  expected_annual_net_income_kobo INTEGER NOT NULL DEFAULT 0 CHECK (expected_annual_net_income_kobo >= 0),
  recovered_amount_kobo INTEGER NOT NULL DEFAULT 0 CHECK (recovered_amount_kobo >= 0),
  notes TEXT,
  updated_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, property_id)
);
CREATE INDEX IF NOT EXISTS idx_property_investments_property ON property_investments(company_id, property_id);

INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
 ('perm-properties-investment','properties.investment','properties','investment','View and maintain property acquisition costs, ROI, payback period and recovery progress for the selected Properties business',1);

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level) VALUES
 ('properties-investment-owner','role-owner','perm-properties-investment','manage'),
 ('properties-investment-group-admin','role-group-admin','perm-properties-investment','approve'),
 ('properties-investment-accountant','role-properties-accountant','perm-properties-investment','edit'),
 ('properties-investment-agent','role-properties-agent','perm-properties-investment','view');

INSERT OR IGNORE INTO app_settings(setting_key,setting_value,value_type) VALUES
 ('properties.investment_healthy_roi_percent','10','number'),
 ('properties.investment_watch_roi_percent','5','number');
