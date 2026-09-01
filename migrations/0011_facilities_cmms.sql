PRAGMA foreign_keys = ON;

-- Facilities & Building Maintenance CMMS extensions for Daenem Group.
-- Designed for Nigerian office/production realities: generator, diesel, solar/inverter,
-- borehole/water, AC, CCTV, fire equipment, electrical, plumbing, pest control and IT assets.

CREATE TABLE IF NOT EXISTS maintenance_categories (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  default_priority TEXT NOT NULL DEFAULT 'normal' CHECK (default_priority IN ('low','normal','high','critical')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1))
);

INSERT OR IGNORE INTO maintenance_categories (code,name,description,default_priority) VALUES
  ('generator','Generator & Power','Generator servicing, faults, diesel system and changeover','high'),
  ('solar','Solar / Inverter / Battery','Panels, inverter, charge controller and batteries','high'),
  ('electrical','Electrical','Wiring, sockets, breakers, lighting and distribution boards','high'),
  ('water','Borehole / Pump / Water','Borehole, pumps, tanks, plumbing supply and water treatment','high'),
  ('plumbing','Plumbing','Leaks, toilets, drains, taps and waste water','normal'),
  ('aircon','Air Conditioning','AC servicing, refrigerant, drainage and faults','normal'),
  ('security','CCTV / Access / Security','CCTV, NVR, access control, alarm, gate and locks','high'),
  ('fire','Fire & Safety','Extinguishers, alarms, signage, emergency lighting and inspections','critical'),
  ('building','Building / Roofing','Roof leaks, walls, doors, windows, ceilings and structural items','normal'),
  ('cleaning','Cleaning & Hygiene','Cleaning, waste, sanitation and consumables','normal'),
  ('pest','Pest Control','Rodent, insect and fumigation records','normal'),
  ('it','IT / Network','Computers, network, printers, UPS and connectivity equipment','normal'),
  ('furniture','Furniture & Fixtures','Desks, chairs, shelving and fittings','low'),
  ('other','Other','Other facility or asset maintenance','normal');

CREATE TABLE IF NOT EXISTS maintenance_vendors (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  service_category TEXT,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  tax_id TEXT,
  notes TEXT,
  approved INTEGER NOT NULL DEFAULT 0 CHECK (approved IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_maintenance_vendors_company ON maintenance_vendors(company_id, active, name);

CREATE TABLE IF NOT EXISTS preventive_maintenance_schedules (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  facility_id TEXT REFERENCES facilities(id) ON DELETE CASCADE,
  asset_id TEXT REFERENCES assets(id) ON DELETE CASCADE,
  category_code TEXT REFERENCES maintenance_categories(code) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  interval_type TEXT NOT NULL CHECK (interval_type IN ('days','weeks','months','running_hours','calendar')),
  interval_value INTEGER NOT NULL DEFAULT 1 CHECK (interval_value > 0),
  last_completed_at TEXT,
  last_meter_value REAL,
  next_due_at TEXT,
  next_meter_value REAL,
  default_assignee_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  default_vendor_id TEXT REFERENCES maintenance_vendors(id) ON DELETE SET NULL,
  checklist_json TEXT,
  estimated_cost_kobo INTEGER,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pm_schedule_due ON preventive_maintenance_schedules(company_id, active, next_due_at);

CREATE TABLE IF NOT EXISTS asset_readings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  facility_id TEXT REFERENCES facilities(id) ON DELETE SET NULL,
  asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  reading_type TEXT NOT NULL CHECK (reading_type IN ('running_hours','diesel_litres','fuel_added_litres','energy_kwh','battery_voltage','water_level','temperature','pressure','other')),
  reading_value REAL NOT NULL,
  unit TEXT,
  note TEXT,
  latitude REAL,
  longitude REAL,
  recorded_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_asset_readings_asset ON asset_readings(asset_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS maintenance_work_order_events (
  id TEXT PRIMARY KEY,
  work_order_id TEXT NOT NULL REFERENCES maintenance_work_orders(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  actor_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('reported','triaged','assigned','estimate','approval','status','note','material','photo','completed','verified','cancelled')),
  before_status TEXT,
  after_status TEXT,
  note TEXT,
  amount_kobo INTEGER,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_work_order_events_order ON maintenance_work_order_events(work_order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS facility_inspections (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  facility_id TEXT NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  inspection_type TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL,
  checklist_json TEXT NOT NULL,
  overall_status TEXT NOT NULL DEFAULT 'pending' CHECK (overall_status IN ('pending','pass','attention','fail')),
  findings TEXT,
  inspected_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  inspected_at TEXT,
  next_due_at TEXT,
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_facility_inspection_due ON facility_inspections(company_id, facility_id, next_due_at);

ALTER TABLE maintenance_work_orders ADD COLUMN issue_category TEXT DEFAULT 'other';
ALTER TABLE maintenance_work_orders ADD COLUMN vendor_id TEXT REFERENCES maintenance_vendors(id) ON DELETE SET NULL;
ALTER TABLE maintenance_work_orders ADD COLUMN resolution_note TEXT;
ALTER TABLE maintenance_work_orders ADD COLUMN downtime_minutes INTEGER;
ALTER TABLE maintenance_work_orders ADD COLUMN approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE maintenance_work_orders ADD COLUMN approved_at TEXT;
ALTER TABLE maintenance_work_orders ADD COLUMN requested_completion_at TEXT;

INSERT OR IGNORE INTO app_settings (setting_key, setting_value, value_type) VALUES
  ('facilities.require_before_after_photos', 'true', 'boolean'),
  ('facilities.manager_approval_threshold_kobo', '10000000', 'number'),
  ('facilities.generator_hour_log_enabled', 'true', 'boolean'),
  ('facilities.preventive_maintenance_alert_days', '7', 'number');
