PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS logistics_vehicles (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-logistics' REFERENCES companies(id) ON DELETE CASCADE,
  location_id TEXT REFERENCES company_locations(id) ON DELETE SET NULL,
  fleet_no TEXT NOT NULL,
  registration_no TEXT,
  vin TEXT,
  make TEXT,
  model TEXT,
  year INTEGER,
  vehicle_type TEXT NOT NULL DEFAULT 'van',
  capacity_kg REAL,
  capacity_volume_m3 REAL,
  odometer_km REAL NOT NULL DEFAULT 0,
  fuel_type TEXT,
  insurance_expires_at TEXT,
  roadworthiness_expires_at TEXT,
  registration_expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','assigned','in_trip','maintenance','out_of_service','retired')),
  gps_device_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, fleet_no),
  UNIQUE(company_id, registration_no)
);
CREATE INDEX IF NOT EXISTS idx_logistics_vehicle_status ON logistics_vehicles(company_id,status);

CREATE TABLE IF NOT EXISTS logistics_driver_profiles (
  employee_id TEXT PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL DEFAULT 'company-logistics' REFERENCES companies(id) ON DELETE CASCADE,
  driver_license_no TEXT,
  license_class TEXT,
  license_expires_at TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  preferred_vehicle_id TEXT REFERENCES logistics_vehicles(id) ON DELETE SET NULL,
  driving_status TEXT NOT NULL DEFAULT 'available' CHECK (driving_status IN ('available','assigned','in_trip','rest','suspended','inactive')),
  safety_score REAL,
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS logistics_customers (
  customer_id TEXT PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  billing_terms TEXT,
  default_pickup_address TEXT,
  default_delivery_address TEXT,
  credit_limit_kobo INTEGER,
  account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active','hold','suspended')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS logistics_shipments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-logistics' REFERENCES companies(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  shipment_no TEXT NOT NULL,
  reference TEXT,
  cargo_description TEXT NOT NULL,
  cargo_type TEXT,
  weight_kg REAL,
  volume_m3 REAL,
  pieces INTEGER,
  declared_value_kobo INTEGER,
  pickup_name TEXT,
  pickup_phone TEXT,
  pickup_address TEXT NOT NULL,
  pickup_latitude REAL,
  pickup_longitude REAL,
  delivery_name TEXT,
  delivery_phone TEXT,
  delivery_address TEXT NOT NULL,
  delivery_latitude REAL,
  delivery_longitude REAL,
  pickup_window_start TEXT,
  pickup_window_end TEXT,
  delivery_window_start TEXT,
  delivery_window_end TEXT,
  quoted_kobo INTEGER NOT NULL DEFAULT 0,
  invoiced_kobo INTEGER NOT NULL DEFAULT 0,
  amount_paid_kobo INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','quoted','approved','scheduled','picked_up','in_transit','out_for_delivery','delivered','failed','returned','cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  proof_of_delivery_required INTEGER NOT NULL DEFAULT 1 CHECK (proof_of_delivery_required IN (0,1)),
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,shipment_no)
);
CREATE INDEX IF NOT EXISTS idx_logistics_shipments_status ON logistics_shipments(company_id,status,priority,created_at DESC);

CREATE TABLE IF NOT EXISTS logistics_trips (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-logistics' REFERENCES companies(id) ON DELETE CASCADE,
  trip_no TEXT NOT NULL,
  vehicle_id TEXT NOT NULL REFERENCES logistics_vehicles(id) ON DELETE RESTRICT,
  driver_employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  dispatcher_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  route_name TEXT,
  origin TEXT,
  destination TEXT,
  planned_distance_km REAL,
  actual_distance_km REAL,
  start_odometer_km REAL,
  end_odometer_km REAL,
  planned_departure_at TEXT,
  departed_at TEXT,
  planned_return_at TEXT,
  returned_at TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','assigned','dispatched','in_progress','completed','cancelled','incident')),
  fuel_budget_kobo INTEGER NOT NULL DEFAULT 0,
  expense_budget_kobo INTEGER NOT NULL DEFAULT 0,
  revenue_kobo INTEGER NOT NULL DEFAULT 0,
  total_expense_kobo INTEGER NOT NULL DEFAULT 0,
  gross_profit_kobo INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,trip_no)
);
CREATE INDEX IF NOT EXISTS idx_logistics_trips_status ON logistics_trips(company_id,status,planned_departure_at);

CREATE TABLE IF NOT EXISTS logistics_trip_shipments (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES logistics_trips(id) ON DELETE CASCADE,
  shipment_id TEXT NOT NULL REFERENCES logistics_shipments(id) ON DELETE RESTRICT,
  stop_sequence INTEGER NOT NULL DEFAULT 1,
  stop_type TEXT NOT NULL DEFAULT 'delivery' CHECK (stop_type IN ('pickup','delivery','both')),
  planned_arrival_at TEXT,
  arrived_at TEXT,
  departed_at TEXT,
  stop_status TEXT NOT NULL DEFAULT 'pending' CHECK (stop_status IN ('pending','arrived','completed','failed','skipped')),
  note TEXT,
  UNIQUE(trip_id,shipment_id)
);

CREATE TABLE IF NOT EXISTS logistics_trip_expenses (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES logistics_trips(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL DEFAULT 'company-logistics' REFERENCES companies(id) ON DELETE CASCADE,
  expense_type TEXT NOT NULL CHECK (expense_type IN ('fuel','toll','parking','loading','offloading','repair','allowance','accommodation','fine','other')),
  description TEXT NOT NULL,
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo >= 0),
  receipt_key TEXT,
  latitude REAL,
  longitude REAL,
  occurred_at TEXT NOT NULL,
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TEXT,
  recorded_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_logistics_trip_expense ON logistics_trip_expenses(trip_id,occurred_at DESC);

CREATE TABLE IF NOT EXISTS logistics_fuel_logs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-logistics' REFERENCES companies(id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES logistics_vehicles(id) ON DELETE RESTRICT,
  trip_id TEXT REFERENCES logistics_trips(id) ON DELETE SET NULL,
  driver_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  odometer_km REAL,
  litres REAL NOT NULL CHECK (litres > 0),
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo >= 0),
  station_name TEXT,
  reference TEXT,
  receipt_key TEXT,
  latitude REAL,
  longitude REAL,
  fueled_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_logistics_fuel_vehicle ON logistics_fuel_logs(vehicle_id,fueled_at DESC);

CREATE TABLE IF NOT EXISTS logistics_pod (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES logistics_shipments(id) ON DELETE CASCADE,
  trip_id TEXT REFERENCES logistics_trips(id) ON DELETE SET NULL,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT,
  signature_key TEXT,
  photo_key TEXT,
  document_key TEXT,
  latitude REAL,
  longitude REAL,
  note TEXT,
  delivered_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  delivered_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_logistics_pod_shipment ON logistics_pod(shipment_id,delivered_at DESC);

CREATE TABLE IF NOT EXISTS logistics_vehicle_documents (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES logistics_vehicles(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('registration','insurance','roadworthiness','permit','inspection','service','other')),
  document_no TEXT,
  issued_at TEXT,
  expires_at TEXT,
  file_key TEXT,
  reminder_days INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','expiring','expired','superseded')),
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_logistics_vehicle_docs_expiry ON logistics_vehicle_documents(vehicle_id,expires_at);

CREATE TABLE IF NOT EXISTS logistics_vehicle_maintenance (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES logistics_vehicles(id) ON DELETE CASCADE,
  maintenance_type TEXT NOT NULL,
  description TEXT NOT NULL,
  odometer_km REAL,
  next_due_odometer_km REAL,
  next_due_at TEXT,
  vendor_name TEXT,
  amount_kobo INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  completed_at TEXT,
  recorded_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_logistics_maintenance_due ON logistics_vehicle_maintenance(vehicle_id,status,next_due_at);

CREATE TABLE IF NOT EXISTS logistics_incidents (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-logistics' REFERENCES companies(id) ON DELETE CASCADE,
  trip_id TEXT REFERENCES logistics_trips(id) ON DELETE SET NULL,
  vehicle_id TEXT REFERENCES logistics_vehicles(id) ON DELETE SET NULL,
  driver_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  incident_type TEXT NOT NULL CHECK (incident_type IN ('accident','breakdown','security','cargo_damage','cargo_loss','delay','customer_issue','other')),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  description TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  evidence_key TEXT,
  occurred_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','closed')),
  reported_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO app_settings(setting_key,setting_value,value_type) VALUES
 ('logistics.require_pod_before_delivery_complete','true','boolean'),
 ('logistics.require_driver_gps_tracking','true','boolean'),
 ('logistics.require_trip_odometer_closeout','true','boolean'),
 ('logistics.fuel_variance_alert_pct','20','number'),
 ('logistics.document_expiry_alert_days','30','number');

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level) VALUES
 ('logistics-driver-forms','role-logistics-driver','perm-forms','create'),
 ('logistics-driver-tracking','role-logistics-driver','perm-tracking','create'),
 ('logistics-driver-facilities','role-logistics-driver','perm-facilities','view'),
 ('logistics-dispatch-dashboard','role-logistics-dispatcher','perm-dashboard','view'),
 ('logistics-dispatch-sales','role-logistics-dispatcher','perm-sales','create'),
 ('logistics-dispatch-tracking','role-logistics-dispatcher','perm-tracking','view'),
 ('logistics-dispatch-forms','role-logistics-dispatcher','perm-forms','edit'),
 ('logistics-fleet-dashboard','role-logistics-fleet','perm-dashboard','view'),
 ('logistics-fleet-tracking','role-logistics-fleet','perm-tracking','manage'),
 ('logistics-fleet-inventory','role-logistics-fleet','perm-inventory','view'),
 ('logistics-fleet-facilities','role-logistics-fleet','perm-facilities','manage'),
 ('logistics-fleet-finance','role-logistics-fleet','perm-finance','view'),
 ('logistics-fleet-forms','role-logistics-fleet','perm-forms','approve');

INSERT OR IGNORE INTO role_data_requirements(id,company_id,role_id,module,requirement_code,description,cadence,blocking,reminder_policy_json) VALUES
 ('req-logistics-driver-pod','company-logistics','role-logistics-driver','logistics','proof_of_delivery','Submit proof of delivery for every shipment requiring POD before delivery can be completed.','per_action',1,'{"remind_after_minutes":15,"escalate_to_dispatcher":true}'),
 ('req-logistics-driver-trip','company-logistics','role-logistics-driver','logistics','trip_closeout','Submit end odometer, fuel/expense evidence and trip closeout before a trip is completed.','per_action',1,'{"remind_after_minutes":30,"escalate_to_fleet_manager":true}'),
 ('req-logistics-dispatch-review','company-logistics','role-logistics-dispatcher','logistics','dispatch_review','Review all planned and delayed shipments before daily close.','daily',0,'{"remind_local_time":"17:00","escalate_to_fleet_manager":true}');
