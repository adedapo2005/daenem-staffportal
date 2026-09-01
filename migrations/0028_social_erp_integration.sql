PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS social_catalog_sync_runs (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  source_count INTEGER NOT NULL DEFAULT 0,
  created_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  hidden_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','partial','failed')),
  error_text TEXT,
  started_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_social_catalog_sync_brand ON social_catalog_sync_runs(brand_id,started_at DESC);

CREATE TABLE IF NOT EXISTS social_order_erp_links (
  social_order_id TEXT PRIMARY KEY REFERENCES social_orders(id) ON DELETE CASCADE,
  brand_id TEXT NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('sales_order','print_job','auto_lead','property_lead','logistics_quote','farms_external','none')),
  target_id TEXT,
  secondary_target_type TEXT,
  secondary_target_id TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending','synced','partial','blocked','failed')),
  sync_error TEXT,
  synced_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_social_order_erp_company ON social_order_erp_links(company_id,sync_status,synced_at DESC);

CREATE TABLE IF NOT EXISTS logistics_quote_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-logistics' REFERENCES companies(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  request_no TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'social',
  source_reference TEXT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  service_requested TEXT,
  cargo_description TEXT,
  pickup_address TEXT,
  delivery_address TEXT,
  weight_kg REAL,
  pieces INTEGER,
  preferred_date TEXT,
  quoted_kobo INTEGER,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','details_required','quoted','accepted','converted','lost','cancelled')),
  assigned_to TEXT REFERENCES employees(id) ON DELETE SET NULL,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,request_no)
);
CREATE INDEX IF NOT EXISTS idx_logistics_quote_requests_status ON logistics_quote_requests(company_id,status,created_at DESC);

INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
 ('perm-social-integrations','social.integrations','social','integrations','Synchronize Social Commerce catalogs and orders with Daenem ERP modules',1);

INSERT OR REPLACE INTO role_permissions(id,role_id,permission_id,access_level) VALUES
 ('social-owner-integrations','role-owner','perm-social-integrations','manage'),
 ('social-group-admin-integrations','role-group-admin','perm-social-integrations','manage'),
 ('social-print-manager-integrations','role-print-manager','perm-social-integrations','edit'),
 ('social-bakery-manager-integrations','role-bakery-manager','perm-social-integrations','edit'),
 ('social-autos-manager-integrations','role-autos-manager','perm-social-integrations','edit'),
 ('social-logistics-fleet-integrations','role-logistics-fleet','perm-social-integrations','edit'),
 ('social-properties-agent-integrations','role-properties-agent','perm-social-integrations','create');
