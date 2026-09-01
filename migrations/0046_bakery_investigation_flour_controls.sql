PRAGMA foreign_keys = ON;

ALTER TABLE bakery_accountability_exceptions ADD COLUMN assigned_to TEXT REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE bakery_accountability_exceptions ADD COLUMN assigned_by TEXT REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE bakery_accountability_exceptions ADD COLUMN assigned_at TEXT;
ALTER TABLE bakery_accountability_exceptions ADD COLUMN resolution_approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE bakery_accountability_exceptions ADD COLUMN resolution_approved_at TEXT;

CREATE TABLE IF NOT EXISTS bakery_exception_evidence (
  id TEXT PRIMARY KEY,
  exception_id TEXT NOT NULL REFERENCES bakery_accountability_exceptions(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL DEFAULT 'company-bakery' REFERENCES companies(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('note','receipt','photo','document','witness','system_record','other')),
  description TEXT NOT NULL,
  file_path TEXT,
  reference TEXT,
  recorded_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bakery_exception_evidence ON bakery_exception_evidence(company_id,exception_id,recorded_at DESC);

CREATE TABLE IF NOT EXISTS bakery_flour_bag_settings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-bakery' REFERENCES companies(id) ON DELETE CASCADE,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  bag_weight_kg REAL NOT NULL CHECK (bag_weight_kg > 0 AND bag_weight_kg <= 1000),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  updated_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,inventory_item_id)
);

INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
 ('perm-bakery-flour-control','bakery.flour_control','bakery','flour_control','Configure flour bag sizes and review planned, used, wasted and variance quantities for Bakery production',1),
 ('perm-bakery-investigation','bakery.investigation','bakery','investigation','Assign, investigate, evidence, resolve, approve or reopen bread and money accountability exceptions',1);

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level) VALUES
 ('bakery-flour-owner','role-owner','perm-bakery-flour-control','manage'),
 ('bakery-investigation-owner','role-owner','perm-bakery-investigation','manage'),
 ('bakery-flour-manager','role-bakery-manager','perm-bakery-flour-control','approve'),
 ('bakery-investigation-manager','role-bakery-manager','perm-bakery-investigation','approve'),
 ('bakery-flour-accountant','role-bakery-accountant','perm-bakery-flour-control','edit'),
 ('bakery-investigation-accountant','role-bakery-accountant','perm-bakery-investigation','edit'),
 ('bakery-flour-production','role-bakery-production','perm-bakery-flour-control','view');

INSERT OR IGNORE INTO app_settings(setting_key,setting_value,value_type) VALUES
 ('bakery.default_flour_bag_weight_kg','50','number'),
 ('bakery.investigation_requires_independent_approval','true','boolean');
