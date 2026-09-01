PRAGMA foreign_keys = ON;

-- Daenem Homes & Properties: listings, sales CRM, inspections, tenancy and rent management.
CREATE TABLE IF NOT EXISTS property_owners (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-properties' REFERENCES companies(id) ON DELETE CASCADE,
  owner_type TEXT NOT NULL DEFAULT 'individual' CHECK (owner_type IN ('individual','company','family','estate','government','other')),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  bank_name TEXT,
  bank_account_name TEXT,
  bank_account_no_masked TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-properties' REFERENCES companies(id) ON DELETE CASCADE,
  owner_id TEXT REFERENCES property_owners(id) ON DELETE SET NULL,
  property_code TEXT NOT NULL,
  name TEXT NOT NULL,
  property_type TEXT NOT NULL CHECK (property_type IN ('land','apartment','house','duplex','office','shop','warehouse','estate','shortlet','mixed_use','other')),
  ownership_type TEXT NOT NULL DEFAULT 'managed' CHECK (ownership_type IN ('daenem_owned','managed','agency_listing','joint_venture','other')),
  address TEXT NOT NULL,
  city TEXT,
  state TEXT NOT NULL DEFAULT 'Oyo',
  country TEXT NOT NULL DEFAULT 'Nigeria',
  latitude REAL,
  longitude REAL,
  land_size REAL,
  land_size_unit TEXT,
  bedrooms INTEGER,
  bathrooms INTEGER,
  title_document_type TEXT,
  title_reference TEXT,
  acquisition_cost_kobo INTEGER,
  market_value_kobo INTEGER,
  asking_price_kobo INTEGER,
  rent_amount_kobo INTEGER,
  rent_frequency TEXT CHECK (rent_frequency IN ('monthly','quarterly','biannual','annual','custom')),
  service_charge_kobo INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','available','occupied','reserved','under_offer','sold','maintenance','inactive','archived')),
  description TEXT,
  primary_image_key TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, property_code)
);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(company_id,status,property_type);
CREATE INDEX IF NOT EXISTS idx_properties_location ON properties(company_id,state,city);

CREATE TABLE IF NOT EXISTS property_units (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_code TEXT NOT NULL,
  unit_name TEXT,
  unit_type TEXT,
  floor_no TEXT,
  bedrooms INTEGER,
  bathrooms INTEGER,
  size REAL,
  size_unit TEXT,
  rent_amount_kobo INTEGER,
  service_charge_kobo INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','occupied','maintenance','inactive')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(property_id,unit_code)
);
CREATE INDEX IF NOT EXISTS idx_property_units_status ON property_units(property_id,status);

CREATE TABLE IF NOT EXISTS property_listings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-properties' REFERENCES companies(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id TEXT REFERENCES property_units(id) ON DELETE SET NULL,
  listing_no TEXT NOT NULL,
  listing_type TEXT NOT NULL CHECK (listing_type IN ('sale','rent','lease','shortlet')),
  headline TEXT NOT NULL,
  public_description TEXT,
  asking_price_kobo INTEGER NOT NULL DEFAULT 0,
  commission_type TEXT NOT NULL DEFAULT 'percentage' CHECK (commission_type IN ('percentage','fixed','included','none')),
  commission_value REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','paused','under_offer','closed','expired')),
  available_from TEXT,
  expires_at TEXT,
  published_at TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,listing_no)
);
CREATE INDEX IF NOT EXISTS idx_property_listings_status ON property_listings(company_id,status,listing_type);

CREATE TABLE IF NOT EXISTS property_leads (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-properties' REFERENCES companies(id) ON DELETE CASCADE,
  listing_id TEXT REFERENCES property_listings(id) ON DELETE SET NULL,
  property_id TEXT REFERENCES properties(id) ON DELETE SET NULL,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  lead_no TEXT NOT NULL,
  source TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  interest_type TEXT NOT NULL DEFAULT 'buy' CHECK (interest_type IN ('buy','rent','lease','shortlet','sell','property_management','other')),
  budget_min_kobo INTEGER,
  budget_max_kobo INTEGER,
  preferred_area TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','inspection_scheduled','inspected','negotiation','offer','deposit','won','lost','dormant')),
  assigned_agent_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  next_follow_up_at TEXT,
  last_contact_at TEXT,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,lead_no)
);
CREATE INDEX IF NOT EXISTS idx_property_leads_followup ON property_leads(company_id,status,next_follow_up_at);

CREATE TABLE IF NOT EXISTS property_lead_activities (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES property_leads(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('call','whatsapp','email','visit','inspection','offer','negotiation','deposit','follow_up','note','won','lost')),
  note TEXT,
  amount_kobo INTEGER,
  next_follow_up_at TEXT,
  latitude REAL,
  longitude REAL,
  recorded_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS property_inspections (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-properties' REFERENCES companies(id) ON DELETE CASCADE,
  lead_id TEXT REFERENCES property_leads(id) ON DELETE SET NULL,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  unit_id TEXT REFERENCES property_units(id) ON DELETE SET NULL,
  inspection_no TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  visitor_name TEXT NOT NULL,
  visitor_phone TEXT,
  agent_employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  meeting_point TEXT,
  latitude REAL,
  longitude REAL,
  result TEXT CHECK (result IN ('interested','negotiating','not_interested','reschedule','no_show','unknown')),
  notes TEXT,
  evidence_key TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,inspection_no)
);
CREATE INDEX IF NOT EXISTS idx_property_inspections_date ON property_inspections(company_id,scheduled_at,result);

CREATE TABLE IF NOT EXISTS property_offers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-properties' REFERENCES companies(id) ON DELETE CASCADE,
  lead_id TEXT REFERENCES property_leads(id) ON DELETE SET NULL,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  unit_id TEXT REFERENCES property_units(id) ON DELETE SET NULL,
  offer_no TEXT NOT NULL,
  offer_type TEXT NOT NULL CHECK (offer_type IN ('sale','rent','lease')),
  asking_amount_kobo INTEGER NOT NULL,
  offered_amount_kobo INTEGER NOT NULL,
  deposit_required_kobo INTEGER NOT NULL DEFAULT 0,
  payment_terms TEXT,
  valid_until TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','expired','withdrawn','superseded')),
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,offer_no)
);

CREATE TABLE IF NOT EXISTS property_tenants (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-properties' REFERENCES companies(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  tenant_type TEXT NOT NULL DEFAULT 'individual' CHECK (tenant_type IN ('individual','company','organization','other')),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  id_type TEXT,
  id_reference TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','former','blacklisted','inactive')),
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS property_leases (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-properties' REFERENCES companies(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  unit_id TEXT REFERENCES property_units(id) ON DELETE SET NULL,
  tenant_id TEXT NOT NULL REFERENCES property_tenants(id) ON DELETE RESTRICT,
  lease_no TEXT NOT NULL,
  lease_type TEXT NOT NULL DEFAULT 'residential' CHECK (lease_type IN ('residential','commercial','shortlet','land','other')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  rent_amount_kobo INTEGER NOT NULL,
  rent_frequency TEXT NOT NULL DEFAULT 'annual' CHECK (rent_frequency IN ('monthly','quarterly','biannual','annual','custom')),
  service_charge_kobo INTEGER NOT NULL DEFAULT 0,
  security_deposit_kobo INTEGER NOT NULL DEFAULT 0,
  caution_fee_kobo INTEGER NOT NULL DEFAULT 0,
  management_fee_kobo INTEGER NOT NULL DEFAULT 0,
  payment_due_day INTEGER,
  renewal_notice_days INTEGER NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','expiring','expired','renewed','terminated','cancelled')),
  agreement_file_key TEXT,
  notes TEXT,
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,lease_no)
);
CREATE INDEX IF NOT EXISTS idx_property_leases_expiry ON property_leases(company_id,status,end_date);

CREATE TABLE IF NOT EXISTS property_rent_schedule (
  id TEXT PRIMARY KEY,
  lease_id TEXT NOT NULL REFERENCES property_leases(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL DEFAULT 'company-properties' REFERENCES companies(id) ON DELETE CASCADE,
  due_date TEXT NOT NULL,
  period_start TEXT,
  period_end TEXT,
  charge_type TEXT NOT NULL DEFAULT 'rent' CHECK (charge_type IN ('rent','service_charge','security_deposit','caution_fee','management_fee','utility','penalty','other')),
  description TEXT,
  amount_due_kobo INTEGER NOT NULL,
  amount_paid_kobo INTEGER NOT NULL DEFAULT 0,
  balance_kobo INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','part_paid','paid','overdue','waived','cancelled')),
  last_reminder_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_property_rent_due ON property_rent_schedule(company_id,status,due_date);

CREATE TABLE IF NOT EXISTS property_rent_payments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-properties' REFERENCES companies(id) ON DELETE CASCADE,
  lease_id TEXT NOT NULL REFERENCES property_leases(id) ON DELETE RESTRICT,
  schedule_id TEXT REFERENCES property_rent_schedule(id) ON DELETE SET NULL,
  tenant_id TEXT NOT NULL REFERENCES property_tenants(id) ON DELETE RESTRICT,
  receipt_no TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash','pos_terminal','bank_transfer','cheque','wallet','other')),
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo > 0),
  reference TEXT,
  payment_date TEXT NOT NULL,
  evidence_key TEXT,
  received_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,receipt_no)
);
CREATE INDEX IF NOT EXISTS idx_property_rent_payments_date ON property_rent_payments(company_id,payment_date DESC);

CREATE TABLE IF NOT EXISTS property_commissions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-properties' REFERENCES companies(id) ON DELETE CASCADE,
  property_id TEXT REFERENCES properties(id) ON DELETE SET NULL,
  listing_id TEXT REFERENCES property_listings(id) ON DELETE SET NULL,
  lead_id TEXT REFERENCES property_leads(id) ON DELETE SET NULL,
  agent_employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('sale','rent','lease','management','referral')),
  transaction_reference TEXT,
  gross_transaction_kobo INTEGER NOT NULL DEFAULT 0,
  commission_rate REAL,
  commission_amount_kobo INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','cancelled')),
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS property_documents (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-properties' REFERENCES companies(id) ON DELETE CASCADE,
  property_id TEXT REFERENCES properties(id) ON DELETE CASCADE,
  unit_id TEXT REFERENCES property_units(id) ON DELETE CASCADE,
  lease_id TEXT REFERENCES property_leases(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('deed','survey','c_of_o','governors_consent','allocation','building_plan','lease_agreement','tenancy_agreement','id','receipt','inspection','valuation','insurance','other')),
  document_no TEXT,
  file_key TEXT NOT NULL,
  issued_at TEXT,
  expires_at TEXT,
  confidential INTEGER NOT NULL DEFAULT 1 CHECK (confidential IN (0,1)),
  uploaded_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS property_maintenance_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-properties' REFERENCES companies(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  unit_id TEXT REFERENCES property_units(id) ON DELETE SET NULL,
  tenant_id TEXT REFERENCES property_tenants(id) ON DELETE SET NULL,
  request_no TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent','emergency')),
  status TEXT NOT NULL DEFAULT 'reported' CHECK (status IN ('reported','triaged','awaiting_approval','approved','in_progress','waiting_parts','completed','verified','cancelled')),
  assigned_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  vendor_name TEXT,
  estimate_kobo INTEGER,
  actual_cost_kobo INTEGER,
  before_key TEXT,
  after_key TEXT,
  reported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  verified_at TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  UNIQUE(company_id,request_no)
);
CREATE INDEX IF NOT EXISTS idx_property_maintenance_status ON property_maintenance_requests(company_id,status,priority);

INSERT OR IGNORE INTO app_settings(setting_key,setting_value,value_type) VALUES
 ('properties.default_location_id','location-properties-hq','string'),
 ('properties.lease_renewal_alert_days','60','number'),
 ('properties.rent_overdue_grace_days','0','number'),
 ('properties.require_inspection_gps','true','boolean'),
 ('properties.require_management_approval_below_asking_pct','5','number'),
 ('properties.auto_mark_overdue_schedule','true','boolean');

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level) VALUES
 ('properties-agent-dashboard','role-properties-agent','perm-dashboard','view'),
 ('properties-agent-sales','role-properties-agent','perm-sales','create'),
 ('properties-agent-forms','role-properties-agent','perm-forms','create'),
 ('properties-agent-tracking','role-properties-agent','perm-tracking','create'),
 ('properties-facility-dashboard','role-properties-facility','perm-dashboard','view'),
 ('properties-facility-facilities','role-properties-facility','perm-facilities','manage'),
 ('properties-facility-forms','role-properties-facility','perm-forms','approve'),
 ('properties-accountant-dashboard','role-properties-accountant','perm-dashboard','view'),
 ('properties-accountant-finance','role-properties-accountant','perm-finance','manage'),
 ('properties-accountant-sales','role-properties-accountant','perm-sales','view'),
 ('properties-accountant-payroll','role-properties-accountant','perm-payroll','view'),
 ('properties-accountant-forms','role-properties-accountant','perm-forms','view');

INSERT OR IGNORE INTO role_data_requirements(id,company_id,role_id,module,requirement_code,description,cadence,blocking,reminder_policy_json) VALUES
 ('req-properties-agent-inspection','company-properties','role-properties-agent','properties','inspection_result','Record inspection result, client feedback and GPS location after each property inspection.','per_action',1,'{"remind_after_minutes":30,"escalate_to_manager":true}'),
 ('req-properties-agent-followup','company-properties','role-properties-agent','properties','lead_followup','Update assigned property leads and next follow-up after customer contact.','per_action',0,'{"remind_after_minutes":120,"escalate_to_manager":true}'),
 ('req-properties-facility-maintenance','company-properties','role-properties-facility','properties','maintenance_closeout','Record completion evidence and cost before verifying a property maintenance request.','per_action',1,'{"remind_after_minutes":60,"escalate_to_owner":true}'),
 ('req-properties-accountant-arrears','company-properties','role-properties-accountant','properties','arrears_review','Review overdue rent/service charges and payment allocation daily.','daily',0,'{"remind_local_time":"16:30","escalate_to_owner":true}');
