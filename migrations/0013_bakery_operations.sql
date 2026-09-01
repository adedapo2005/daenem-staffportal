PRAGMA foreign_keys = ON;

-- Daenem Bakery: Nigerian bakery POS + production manufacturing controls.
CREATE TABLE IF NOT EXISTS bakery_products (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-bakery' REFERENCES companies(id) ON DELETE CASCADE,
  inventory_item_id TEXT REFERENCES inventory_items(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  barcode TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'bread' CHECK (category IN ('bread','snack','cake','pastry','other')),
  description TEXT,
  sales_unit TEXT NOT NULL DEFAULT 'piece',
  selling_price_kobo INTEGER NOT NULL DEFAULT 0,
  wholesale_price_kobo INTEGER,
  shelf_life_hours INTEGER,
  reorder_level REAL NOT NULL DEFAULT 0,
  image_key TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, code),
  UNIQUE(company_id, barcode)
);
CREATE INDEX IF NOT EXISTS idx_bakery_products_active ON bakery_products(company_id, active, category, name);

CREATE TABLE IF NOT EXISTS bakery_recipes (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-bakery' REFERENCES companies(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES bakery_products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version_no INTEGER NOT NULL DEFAULT 1,
  batch_yield_qty REAL NOT NULL,
  yield_unit TEXT NOT NULL DEFAULT 'piece',
  labour_cost_kobo INTEGER NOT NULL DEFAULT 0,
  energy_cost_kobo INTEGER NOT NULL DEFAULT 0,
  packaging_cost_kobo INTEGER NOT NULL DEFAULT 0,
  other_overhead_kobo INTEGER NOT NULL DEFAULT 0,
  instructions TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, version_no)
);

CREATE TABLE IF NOT EXISTS bakery_recipe_ingredients (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL REFERENCES bakery_recipes(id) ON DELETE CASCADE,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL,
  expected_waste_pct REAL NOT NULL DEFAULT 0,
  critical INTEGER NOT NULL DEFAULT 1 CHECK (critical IN (0,1)),
  note TEXT,
  UNIQUE(recipe_id, inventory_item_id)
);

CREATE TABLE IF NOT EXISTS bakery_production_plans (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-bakery' REFERENCES companies(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES company_locations(id) ON DELETE RESTRICT,
  plan_date TEXT NOT NULL,
  shift TEXT NOT NULL DEFAULT 'day' CHECK (shift IN ('early','day','evening','night','custom')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','in_progress','completed','cancelled')),
  note TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bakery_plans_date ON bakery_production_plans(company_id, plan_date DESC, status);

CREATE TABLE IF NOT EXISTS bakery_production_plan_items (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES bakery_production_plans(id) ON DELETE CASCADE,
  recipe_id TEXT NOT NULL REFERENCES bakery_recipes(id) ON DELETE RESTRICT,
  planned_batches REAL NOT NULL DEFAULT 1 CHECK (planned_batches > 0),
  planned_output_qty REAL NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  note TEXT
);

CREATE TABLE IF NOT EXISTS bakery_batches (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-bakery' REFERENCES companies(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES company_locations(id) ON DELETE RESTRICT,
  plan_item_id TEXT REFERENCES bakery_production_plan_items(id) ON DELETE SET NULL,
  recipe_id TEXT NOT NULL REFERENCES bakery_recipes(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES bakery_products(id) ON DELETE RESTRICT,
  batch_no TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','mixing','proofing','baking','cooling','packaging','completed','on_hold','cancelled')),
  planned_yield_qty REAL NOT NULL DEFAULT 0,
  actual_yield_qty REAL NOT NULL DEFAULT 0,
  waste_qty REAL NOT NULL DEFAULT 0,
  rejected_qty REAL NOT NULL DEFAULT 0,
  ingredient_cost_kobo INTEGER NOT NULL DEFAULT 0,
  labour_cost_kobo INTEGER NOT NULL DEFAULT 0,
  energy_cost_kobo INTEGER NOT NULL DEFAULT 0,
  packaging_cost_kobo INTEGER NOT NULL DEFAULT 0,
  other_cost_kobo INTEGER NOT NULL DEFAULT 0,
  total_batch_cost_kobo INTEGER NOT NULL DEFAULT 0,
  unit_cost_kobo INTEGER NOT NULL DEFAULT 0,
  best_before_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  operator_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  supervisor_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  note TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, batch_no)
);
CREATE INDEX IF NOT EXISTS idx_bakery_batches_status ON bakery_batches(company_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS bakery_batch_ingredients (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES bakery_batches(id) ON DELETE CASCADE,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  planned_quantity REAL NOT NULL DEFAULT 0,
  actual_quantity REAL NOT NULL DEFAULT 0,
  waste_quantity REAL NOT NULL DEFAULT 0,
  unit TEXT,
  unit_cost_kobo INTEGER NOT NULL DEFAULT 0,
  stock_movement_id TEXT REFERENCES stock_movements(id) ON DELETE SET NULL,
  issued_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_bakery_batch_ingredients ON bakery_batch_ingredients(batch_id, inventory_item_id);

CREATE TABLE IF NOT EXISTS bakery_waste_records (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-bakery' REFERENCES companies(id) ON DELETE CASCADE,
  location_id TEXT REFERENCES company_locations(id) ON DELETE SET NULL,
  batch_id TEXT REFERENCES bakery_batches(id) ON DELETE SET NULL,
  product_id TEXT REFERENCES bakery_products(id) ON DELETE SET NULL,
  inventory_item_id TEXT REFERENCES inventory_items(id) ON DELETE SET NULL,
  stage TEXT NOT NULL CHECK (stage IN ('ingredient','mixing','proofing','baking','cooling','packaging','finished_goods','sales_return','expired','other')),
  reason TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit TEXT,
  estimated_cost_kobo INTEGER NOT NULL DEFAULT 0,
  evidence_key TEXT,
  recorded_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bakery_waste_date ON bakery_waste_records(company_id, recorded_at DESC, stage);

CREATE TABLE IF NOT EXISTS bakery_order_details (
  sales_order_id TEXT PRIMARY KEY REFERENCES sales_orders(id) ON DELETE CASCADE,
  order_type TEXT NOT NULL DEFAULT 'walk_in' CHECK (order_type IN ('walk_in','preorder','custom','wholesale','delivery')),
  pickup_or_delivery_at TEXT,
  delivery_address TEXT,
  special_instructions TEXT,
  fulfillment_status TEXT NOT NULL DEFAULT 'pending' CHECK (fulfillment_status IN ('pending','reserved','in_production','ready','fulfilled','cancelled')),
  barcode_mode INTEGER NOT NULL DEFAULT 0 CHECK (barcode_mode IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bakery_returns (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-bakery' REFERENCES companies(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES company_locations(id) ON DELETE RESTRICT,
  sales_order_id TEXT REFERENCES sales_orders(id) ON DELETE SET NULL,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  product_id TEXT NOT NULL REFERENCES bakery_products(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL CHECK (quantity > 0),
  reason TEXT NOT NULL,
  disposition TEXT NOT NULL DEFAULT 'waste' CHECK (disposition IN ('resell','waste','quality_review','supplier_return','other')),
  refund_kobo INTEGER NOT NULL DEFAULT 0,
  received_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  returned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bakery_customer_loyalty (
  customer_id TEXT PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  points_balance INTEGER NOT NULL DEFAULT 0,
  lifetime_points INTEGER NOT NULL DEFAULT 0,
  birthday TEXT,
  birthday_greeting_enabled INTEGER NOT NULL DEFAULT 0 CHECK (birthday_greeting_enabled IN (0,1)),
  regular_customer_discount_bp INTEGER NOT NULL DEFAULT 0,
  last_purchase_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bakery_daily_reconciliations (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-bakery' REFERENCES companies(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES company_locations(id) ON DELETE RESTRICT,
  business_date TEXT NOT NULL,
  sales_kobo INTEGER NOT NULL DEFAULT 0,
  cash_kobo INTEGER NOT NULL DEFAULT 0,
  pos_kobo INTEGER NOT NULL DEFAULT 0,
  transfer_kobo INTEGER NOT NULL DEFAULT 0,
  wallet_kobo INTEGER NOT NULL DEFAULT 0,
  credit_kobo INTEGER NOT NULL DEFAULT 0,
  refunds_kobo INTEGER NOT NULL DEFAULT 0,
  waste_cost_kobo INTEGER NOT NULL DEFAULT 0,
  units_produced REAL NOT NULL DEFAULT 0,
  units_sold REAL NOT NULL DEFAULT 0,
  expected_cash_kobo INTEGER NOT NULL DEFAULT 0,
  counted_cash_kobo INTEGER,
  variance_kobo INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','locked')),
  prepared_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(location_id, business_date)
);

INSERT OR IGNORE INTO inventory_categories (id, company_id, name, category_type) VALUES
  ('bakery-category-ingredients', 'company-bakery', 'Bakery Ingredients', 'stock'),
  ('bakery-category-packaging', 'company-bakery', 'Bakery Packaging', 'consumable'),
  ('bakery-category-finished', 'company-bakery', 'Finished Bread & Snacks', 'finished_good'),
  ('bakery-category-cleaning', 'company-bakery', 'Bakery Cleaning & Hygiene', 'supply');

INSERT OR IGNORE INTO app_settings (setting_key,setting_value,value_type) VALUES
  ('bakery.require_ingredient_issue_before_batch_completion','true','boolean'),
  ('bakery.require_actual_yield_before_batch_completion','true','boolean'),
  ('bakery.require_waste_reason_when_waste_recorded','true','boolean'),
  ('bakery.default_location_id','location-bakery-hq','string'),
  ('bakery.low_stock_alert_enabled','true','boolean'),
  ('bakery.daily_reconciliation_required','true','boolean'),
  ('bakery.loyalty_enabled','true','boolean');

INSERT OR IGNORE INTO role_permissions (id,role_id,permission_id,access_level) VALUES
  ('bakery-manager-dashboard','role-bakery-manager','perm-dashboard','view'),
  ('bakery-manager-inventory','role-bakery-manager','perm-inventory','manage'),
  ('bakery-manager-sales','role-bakery-manager','perm-sales','manage'),
  ('bakery-manager-procurement','role-bakery-manager','perm-procurement','approve'),
  ('bakery-manager-forms','role-bakery-manager','perm-forms','approve'),
  ('bakery-manager-facilities','role-bakery-manager','perm-facilities','edit'),
  ('bakery-manager-broadcasts','role-bakery-manager','perm-broadcasts','create'),
  ('bakery-production-inventory','role-bakery-production','perm-inventory','view'),
  ('bakery-production-forms','role-bakery-production','perm-forms','create'),
  ('bakery-baker-inventory','role-bakery-baker','perm-inventory','view'),
  ('bakery-baker-forms','role-bakery-baker','perm-forms','create'),
  ('bakery-accountant-dashboard','role-bakery-accountant','perm-dashboard','view'),
  ('bakery-accountant-finance','role-bakery-accountant','perm-finance','manage'),
  ('bakery-accountant-sales','role-bakery-accountant','perm-sales','manage'),
  ('bakery-accountant-inventory','role-bakery-accountant','perm-inventory','view'),
  ('bakery-accountant-payroll','role-bakery-accountant','perm-payroll','view');

INSERT OR IGNORE INTO role_data_requirements(id,company_id,role_id,module,requirement_code,description,cadence,blocking,reminder_policy_json) VALUES
  ('req-bakery-production-yield','company-bakery','role-bakery-production','bakery','batch_actual_yield','Record actual batch yield and wastage before a bakery batch can be completed.','per_action',1,'{"remind_after_minutes":30,"escalate_to_manager":true}'),
  ('req-bakery-baker-ingredients','company-bakery','role-bakery-baker','bakery','batch_ingredient_usage','Record ingredient usage for assigned batches before completion.','per_action',1,'{"remind_after_minutes":30,"escalate_to_manager":true}'),
  ('req-bakery-manager-reconcile','company-bakery','role-bakery-manager','bakery','daily_reconciliation','Review daily production, sales, returns and wastage reconciliation.','daily',0,'{"remind_local_time":"18:00","escalate_to_owner":true}');
