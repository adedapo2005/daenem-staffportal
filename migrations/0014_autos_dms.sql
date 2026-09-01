PRAGMA foreign_keys = ON;

-- Daenem Autos: dealership + workshop DMS for Nigerian vehicle sales and service operations.
CREATE TABLE IF NOT EXISTS auto_vehicles (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-autos' REFERENCES companies(id) ON DELETE CASCADE,
  location_id TEXT REFERENCES company_locations(id) ON DELETE SET NULL,
  stock_no TEXT NOT NULL,
  vin TEXT,
  chassis_no TEXT,
  registration_no TEXT,
  year INTEGER,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  trim TEXT,
  body_type TEXT,
  fuel_type TEXT,
  transmission TEXT,
  drive_type TEXT,
  engine TEXT,
  exterior_color TEXT,
  interior_color TEXT,
  mileage_km REAL,
  source_type TEXT NOT NULL DEFAULT 'purchase' CHECK (source_type IN ('purchase','auction','trade_in','consignment','import','other')),
  source_name TEXT,
  source_reference TEXT,
  purchase_date TEXT,
  purchase_cost_kobo INTEGER NOT NULL DEFAULT 0,
  asking_price_kobo INTEGER NOT NULL DEFAULT 0,
  minimum_price_kobo INTEGER,
  landed_cost_kobo INTEGER NOT NULL DEFAULT 0,
  sale_price_kobo INTEGER,
  gross_profit_kobo INTEGER,
  status TEXT NOT NULL DEFAULT 'acquired' CHECK (status IN ('acquired','in_transit','clearing','inspection','repair','detailing','ready','reserved','sold','delivered','hold','retired')),
  condition_grade TEXT,
  keys_count INTEGER NOT NULL DEFAULT 1,
  image_key TEXT,
  notes TEXT,
  acquired_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  sold_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  sold_at TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, stock_no),
  UNIQUE(company_id, vin),
  UNIQUE(company_id, chassis_no)
);
CREATE INDEX IF NOT EXISTS idx_auto_vehicle_status ON auto_vehicles(company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auto_vehicle_make_model ON auto_vehicles(company_id, make, model, year);

CREATE TABLE IF NOT EXISTS auto_vehicle_costs (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES auto_vehicles(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL DEFAULT 'company-autos' REFERENCES companies(id) ON DELETE CASCADE,
  cost_type TEXT NOT NULL CHECK (cost_type IN ('purchase','auction_fee','inland_transport','shipping','port_charge','customs','clearing','mechanical','bodywork','parts','detailing','registration','storage','insurance','commission','fuel','other')),
  description TEXT NOT NULL,
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo >= 0),
  vendor_name TEXT,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  reference TEXT,
  receipt_key TEXT,
  cost_date TEXT NOT NULL,
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TEXT,
  recorded_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auto_vehicle_costs_vehicle ON auto_vehicle_costs(vehicle_id, cost_date DESC);

CREATE TABLE IF NOT EXISTS auto_leads (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-autos' REFERENCES companies(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  vehicle_id TEXT REFERENCES auto_vehicles(id) ON DELETE SET NULL,
  lead_no TEXT NOT NULL,
  source TEXT,
  customer_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  interested_make TEXT,
  interested_model TEXT,
  budget_kobo INTEGER,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','test_drive','negotiation','deposit','won','lost','dormant')),
  assigned_to TEXT REFERENCES employees(id) ON DELETE SET NULL,
  next_follow_up_at TEXT,
  last_contact_at TEXT,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, lead_no)
);
CREATE INDEX IF NOT EXISTS idx_auto_leads_status ON auto_leads(company_id, status, next_follow_up_at);

CREATE TABLE IF NOT EXISTS auto_lead_activities (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES auto_leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('call','whatsapp','email','visit','test_drive','quote','negotiation','deposit','note','follow_up','lost','won')),
  note TEXT,
  amount_kobo INTEGER,
  next_follow_up_at TEXT,
  recorded_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auto_lead_activity ON auto_lead_activities(lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS auto_test_drives (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-autos' REFERENCES companies(id) ON DELETE CASCADE,
  lead_id TEXT REFERENCES auto_leads(id) ON DELETE SET NULL,
  vehicle_id TEXT NOT NULL REFERENCES auto_vehicles(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  driver_license_ref TEXT,
  license_evidence_key TEXT,
  scheduled_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  start_mileage_km REAL,
  end_mileage_km REAL,
  accompanied_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  result TEXT CHECK (result IN ('interested','negotiating','not_interested','reschedule','unknown')),
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auto_offers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-autos' REFERENCES companies(id) ON DELETE CASCADE,
  lead_id TEXT REFERENCES auto_leads(id) ON DELETE SET NULL,
  vehicle_id TEXT NOT NULL REFERENCES auto_vehicles(id) ON DELETE RESTRICT,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  offer_no TEXT NOT NULL,
  asking_price_kobo INTEGER NOT NULL,
  offer_price_kobo INTEGER NOT NULL,
  deposit_required_kobo INTEGER NOT NULL DEFAULT 0,
  payment_terms TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','expired','superseded')),
  valid_until TEXT,
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, offer_no)
);

CREATE TABLE IF NOT EXISTS auto_sales (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-autos' REFERENCES companies(id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES auto_vehicles(id) ON DELETE RESTRICT,
  lead_id TEXT REFERENCES auto_leads(id) ON DELETE SET NULL,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  offer_id TEXT REFERENCES auto_offers(id) ON DELETE SET NULL,
  sale_no TEXT NOT NULL,
  sale_price_kobo INTEGER NOT NULL,
  deposit_kobo INTEGER NOT NULL DEFAULT 0,
  amount_paid_kobo INTEGER NOT NULL DEFAULT 0,
  balance_kobo INTEGER NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','part_paid','paid','refunded')),
  sale_status TEXT NOT NULL DEFAULT 'reserved' CHECK (sale_status IN ('reserved','documentation','paid','ready_for_delivery','delivered','cancelled')),
  invoice_no TEXT,
  payment_terms TEXT,
  documents_json TEXT,
  sold_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TEXT,
  sale_date TEXT NOT NULL,
  delivered_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, sale_no)
);
CREATE INDEX IF NOT EXISTS idx_auto_sales_date ON auto_sales(company_id, sale_date DESC, sale_status);

CREATE TABLE IF NOT EXISTS auto_vehicle_movements (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES auto_vehicles(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL DEFAULT 'company-autos' REFERENCES companies(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('yard_in','yard_out','workshop','wash','test_drive','fuel','inspection','delivery','transfer','other')),
  from_location TEXT,
  to_location TEXT,
  reason TEXT NOT NULL,
  driver_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  authorized_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  mileage_km REAL,
  keys_released INTEGER NOT NULL DEFAULT 0 CHECK (keys_released IN (0,1)),
  gate_pass_no TEXT,
  latitude REAL,
  longitude REAL,
  departed_at TEXT,
  returned_at TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auto_movements_vehicle ON auto_vehicle_movements(vehicle_id, created_at DESC);

CREATE TABLE IF NOT EXISTS auto_workshop_jobs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-autos' REFERENCES companies(id) ON DELETE CASCADE,
  location_id TEXT REFERENCES company_locations(id) ON DELETE SET NULL,
  vehicle_id TEXT NOT NULL REFERENCES auto_vehicles(id) ON DELETE RESTRICT,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  job_no TEXT NOT NULL,
  job_type TEXT NOT NULL DEFAULT 'internal' CHECK (job_type IN ('internal','customer_service','warranty','inspection','pre_sale','bodywork','detailing')),
  complaint TEXT,
  diagnosis TEXT,
  estimate_kobo INTEGER NOT NULL DEFAULT 0,
  actual_cost_kobo INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','inspection','estimate','awaiting_approval','approved','in_progress','waiting_parts','quality_check','ready','delivered','completed','cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  advisor_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  technician_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TEXT,
  promised_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  delivered_at TEXT,
  odometer_km REAL,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, job_no)
);
CREATE INDEX IF NOT EXISTS idx_auto_workshop_status ON auto_workshop_jobs(company_id, status, priority, created_at DESC);

CREATE TABLE IF NOT EXISTS auto_workshop_tasks (
  id TEXT PRIMARY KEY,
  workshop_job_id TEXT NOT NULL REFERENCES auto_workshop_jobs(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL CHECK (task_type IN ('inspection','mechanical','electrical','bodywork','paint','wash','detailing','tyre','diagnostic','other')),
  description TEXT NOT NULL,
  labour_cost_kobo INTEGER NOT NULL DEFAULT 0,
  assigned_to TEXT REFERENCES employees(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','blocked','completed','rework','cancelled')),
  started_at TEXT,
  completed_at TEXT,
  note TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auto_workshop_parts (
  id TEXT PRIMARY KEY,
  workshop_job_id TEXT NOT NULL REFERENCES auto_workshop_jobs(id) ON DELETE CASCADE,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_cost_kobo INTEGER NOT NULL DEFAULT 0,
  stock_movement_id TEXT REFERENCES stock_movements(id) ON DELETE SET NULL,
  issued_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note TEXT
);

CREATE TABLE IF NOT EXISTS auto_quality_checks (
  id TEXT PRIMARY KEY,
  workshop_job_id TEXT REFERENCES auto_workshop_jobs(id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES auto_vehicles(id) ON DELETE CASCADE,
  check_type TEXT NOT NULL DEFAULT 'pre_delivery' CHECK (check_type IN ('intake','post_repair','pre_sale','pre_delivery','return')),
  checklist_json TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('pass','attention','fail')),
  note TEXT,
  evidence_key TEXT,
  checked_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auto_gate_passes (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-autos' REFERENCES companies(id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES auto_vehicles(id) ON DELETE RESTRICT,
  pass_no TEXT NOT NULL,
  pass_type TEXT NOT NULL CHECK (pass_type IN ('test_drive','workshop','customer_delivery','transfer','vendor','other')),
  purpose TEXT NOT NULL,
  released_to TEXT,
  driver_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expected_return_at TEXT,
  returned_at TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','returned','closed','cancelled')),
  UNIQUE(company_id, pass_no)
);

INSERT OR IGNORE INTO inventory_categories(id,company_id,name,category_type) VALUES
 ('autos-category-parts','company-autos','Auto Parts','stock'),
 ('autos-category-consumables','company-autos','Workshop Consumables','consumable'),
 ('autos-category-detailing','company-autos','Detailing Supplies','supply'),
 ('autos-category-tyres','company-autos','Tyres & Wheels','stock');

INSERT OR IGNORE INTO app_settings(setting_key,setting_value,value_type) VALUES
 ('autos.require_cost_approval_threshold_kobo','50000000','number'),
 ('autos.require_qc_before_vehicle_delivery','true','boolean'),
 ('autos.require_gate_pass_for_vehicle_exit','true','boolean'),
 ('autos.require_paid_balance_before_delivery','true','boolean'),
 ('autos.default_location_id','location-autos-hq','string');

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level) VALUES
 ('autos-manager-dashboard','role-autos-manager','perm-dashboard','view'),
 ('autos-manager-sales','role-autos-manager','perm-sales','manage'),
 ('autos-manager-inventory','role-autos-manager','perm-inventory','manage'),
 ('autos-manager-finance','role-autos-manager','perm-finance','view'),
 ('autos-manager-procurement','role-autos-manager','perm-procurement','approve'),
 ('autos-manager-facilities','role-autos-manager','perm-facilities','edit'),
 ('autos-manager-forms','role-autos-manager','perm-forms','approve'),
 ('autos-mechanic-inventory','role-autos-mechanic','perm-inventory','view'),
 ('autos-mechanic-forms','role-autos-mechanic','perm-forms','create'),
 ('autos-advisor-sales','role-autos-advisor','perm-sales','create'),
 ('autos-advisor-inventory','role-autos-advisor','perm-inventory','view'),
 ('autos-admin-sales','role-autos-admin','perm-sales','manage'),
 ('autos-admin-inventory','role-autos-admin','perm-inventory','manage'),
 ('autos-admin-forms','role-autos-admin','perm-forms','edit');

INSERT OR IGNORE INTO role_data_requirements(id,company_id,role_id,module,requirement_code,description,cadence,blocking,reminder_policy_json) VALUES
 ('req-autos-mechanic-job','company-autos','role-autos-mechanic','autos','workshop_job_update','Update diagnosis, work performed and completion status on assigned workshop jobs.','per_action',1,'{"remind_after_minutes":60,"escalate_to_manager":true}'),
 ('req-autos-porter-movement','company-autos','role-autos-porter','autos','vehicle_movement','Record each authorized vehicle movement and key release/return.','per_action',1,'{"remind_after_minutes":15,"escalate_to_manager":true}'),
 ('req-autos-wash-status','company-autos','role-autos-washer','autos','vehicle_detailing','Record wash/detailing completion for assigned vehicles.','per_action',1,'{"remind_after_minutes":30,"escalate_to_manager":true}'),
 ('req-autos-manager-daily','company-autos','role-autos-manager','autos','daily_stock_sales_review','Review vehicle stock, open leads, workshop exceptions and vehicle movements.','daily',0,'{"remind_local_time":"17:30","escalate_to_owner":true}');
