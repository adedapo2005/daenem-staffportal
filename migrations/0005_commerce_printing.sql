PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_no TEXT,
  name TEXT NOT NULL,
  business_name TEXT,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  address TEXT,
  customer_type TEXT NOT NULL DEFAULT 'retail' CHECK (customer_type IN ('retail','wholesale','corporate','government','internal','other')),
  credit_limit_kobo INTEGER NOT NULL DEFAULT 0,
  balance_kobo INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, customer_no)
);

CREATE INDEX IF NOT EXISTS idx_customers_company_name ON customers(company_id, active, name);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_no TEXT,
  name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  address TEXT,
  payment_terms TEXT,
  tax_id TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, supplier_no)
);

CREATE TABLE IF NOT EXISTS inventory_categories (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category_type TEXT NOT NULL DEFAULT 'stock' CHECK (category_type IN ('stock','supply','finished_good','spare_part','consumable','asset_related')),
  parent_id TEXT REFERENCES inventory_categories(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  UNIQUE(company_id, name)
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES inventory_categories(id) ON DELETE SET NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  brand TEXT,
  unit TEXT NOT NULL DEFAULT 'unit',
  unit_cost_kobo INTEGER NOT NULL DEFAULT 0,
  selling_price_kobo INTEGER NOT NULL DEFAULT 0,
  reorder_level REAL NOT NULL DEFAULT 0,
  track_lot INTEGER NOT NULL DEFAULT 0 CHECK (track_lot IN (0,1)),
  track_expiry INTEGER NOT NULL DEFAULT 0 CHECK (track_expiry IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_inventory_items_company ON inventory_items(company_id, active, category_id);

CREATE TABLE IF NOT EXISTS stock_balances (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES company_locations(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  quantity REAL NOT NULL DEFAULT 0,
  reserved_quantity REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(location_id, item_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('opening','receipt','issue','sale','return_in','return_out','transfer_out','transfer_in','adjustment_in','adjustment_out','waste','borrow_out','borrow_return')),
  quantity REAL NOT NULL,
  unit_cost_kobo INTEGER,
  from_location_id TEXT REFERENCES company_locations(id) ON DELETE SET NULL,
  to_location_id TEXT REFERENCES company_locations(id) ON DELETE SET NULL,
  reference_type TEXT,
  reference_id TEXT,
  reason TEXT,
  lot_no TEXT,
  expiry_date TEXT,
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_company_time ON stock_movements(company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item_time ON stock_movements(item_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS inventory_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  location_id TEXT REFERENCES company_locations(id) ON DELETE SET NULL,
  request_no TEXT NOT NULL,
  request_type TEXT NOT NULL DEFAULT 'internal' CHECK (request_type IN ('internal','purchase','transfer','borrow')),
  requested_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  department TEXT,
  purpose TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','rejected','partially_issued','issued','cancelled')),
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, request_no)
);

CREATE TABLE IF NOT EXISTS inventory_request_items (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES inventory_requests(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity_requested REAL NOT NULL,
  quantity_approved REAL,
  quantity_issued REAL NOT NULL DEFAULT 0,
  note TEXT
);

CREATE TABLE IF NOT EXISTS borrowed_items (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  external_borrower TEXT,
  quantity REAL NOT NULL,
  borrowed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  due_at TEXT,
  returned_quantity REAL NOT NULL DEFAULT 0,
  returned_at TEXT,
  status TEXT NOT NULL DEFAULT 'out' CHECK (status IN ('out','partially_returned','returned','lost','damaged')),
  condition_out TEXT,
  condition_return TEXT,
  authorized_by TEXT REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  location_id TEXT REFERENCES company_locations(id) ON DELETE SET NULL,
  po_no TEXT NOT NULL,
  order_date TEXT NOT NULL,
  expected_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','ordered','partially_received','received','cancelled')),
  currency TEXT NOT NULL DEFAULT 'NGN',
  subtotal_kobo INTEGER NOT NULL DEFAULT 0,
  tax_kobo INTEGER NOT NULL DEFAULT 0,
  total_kobo INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, po_no)
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id TEXT REFERENCES inventory_items(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_cost_kobo INTEGER NOT NULL,
  received_quantity REAL NOT NULL DEFAULT 0,
  line_total_kobo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS goods_receipts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  purchase_order_id TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  location_id TEXT NOT NULL REFERENCES company_locations(id) ON DELETE RESTRICT,
  receipt_no TEXT NOT NULL,
  supplier_reference TEXT,
  received_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  UNIQUE(company_id, receipt_no)
);

CREATE TABLE IF NOT EXISTS goods_receipt_items (
  id TEXT PRIMARY KEY,
  goods_receipt_id TEXT NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL,
  unit_cost_kobo INTEGER,
  lot_no TEXT,
  expiry_date TEXT,
  condition_note TEXT
);

CREATE TABLE IF NOT EXISTS sales_orders (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  location_id TEXT REFERENCES company_locations(id) ON DELETE SET NULL,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  order_no TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'counter' CHECK (channel IN ('counter','website','whatsapp','phone','sales_rep','internal','other')),
  order_date TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','quoted','approved','in_progress','ready','completed','cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','part_paid','paid','refunded','credit')),
  currency TEXT NOT NULL DEFAULT 'NGN',
  subtotal_kobo INTEGER NOT NULL DEFAULT 0,
  discount_kobo INTEGER NOT NULL DEFAULT 0,
  tax_kobo INTEGER NOT NULL DEFAULT 0,
  total_kobo INTEGER NOT NULL DEFAULT 0,
  amount_paid_kobo INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, order_no)
);

CREATE INDEX IF NOT EXISTS idx_sales_orders_company_date ON sales_orders(company_id, order_date DESC, status);

CREATE TABLE IF NOT EXISTS sales_order_items (
  id TEXT PRIMARY KEY,
  sales_order_id TEXT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  inventory_item_id TEXT REFERENCES inventory_items(id) ON DELETE SET NULL,
  service_code TEXT,
  description TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price_kobo INTEGER NOT NULL,
  unit_cost_kobo INTEGER NOT NULL DEFAULT 0,
  discount_kobo INTEGER NOT NULL DEFAULT 0,
  line_total_kobo INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  sales_order_id TEXT REFERENCES sales_orders(id) ON DELETE SET NULL,
  payment_no TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('cash','pos_terminal','bank_transfer','wallet','cheque','credit','other')),
  amount_kobo INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  reference TEXT,
  bank_or_provider TEXT,
  received_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  evidence_key TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending','confirmed','reversed','refunded')),
  UNIQUE(company_id, payment_no)
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  location_id TEXT REFERENCES company_locations(id) ON DELETE SET NULL,
  expense_no TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_kobo INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  payment_method TEXT,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  receipt_key TEXT,
  expense_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft','submitted','approved','rejected','paid','void')),
  submitted_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, expense_no)
);

-- Daenem Printing & Technology operations.
CREATE TABLE IF NOT EXISTS printing_services (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-printing' REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  pricing_unit TEXT NOT NULL DEFAULT 'job',
  base_price_kobo INTEGER NOT NULL DEFAULT 0,
  standard_turnaround_hours INTEGER,
  requires_artwork INTEGER NOT NULL DEFAULT 1 CHECK (requires_artwork IN (0,1)),
  requires_proof INTEGER NOT NULL DEFAULT 1 CHECK (requires_proof IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  metadata_json TEXT,
  UNIQUE(company_id, code)
);

CREATE TABLE IF NOT EXISTS print_jobs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-printing' REFERENCES companies(id) ON DELETE CASCADE,
  location_id TEXT REFERENCES company_locations(id) ON DELETE SET NULL,
  sales_order_id TEXT REFERENCES sales_orders(id) ON DELETE SET NULL,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  service_id TEXT REFERENCES printing_services(id) ON DELETE SET NULL,
  job_no TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'job',
  size_spec TEXT,
  color_spec TEXT,
  finishing_spec TEXT,
  artwork_status TEXT NOT NULL DEFAULT 'not_received' CHECK (artwork_status IN ('not_received','received','designing','ready','approved')),
  proof_status TEXT NOT NULL DEFAULT 'not_required' CHECK (proof_status IN ('not_required','pending','sent','changes_requested','approved')),
  production_status TEXT NOT NULL DEFAULT 'enquiry' CHECK (production_status IN ('enquiry','quoted','customer_approved','design','proof','queued','printing','finishing','quality_control','packaging','ready','delivered','completed','on_hold','cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  assigned_designer_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  assigned_operator_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  due_at TEXT,
  started_at TEXT,
  ready_at TEXT,
  completed_at TEXT,
  quoted_kobo INTEGER NOT NULL DEFAULT 0,
  invoiced_kobo INTEGER NOT NULL DEFAULT 0,
  material_cost_kobo INTEGER NOT NULL DEFAULT 0,
  labour_cost_kobo INTEGER NOT NULL DEFAULT 0,
  finishing_cost_kobo INTEGER NOT NULL DEFAULT 0,
  other_cost_kobo INTEGER NOT NULL DEFAULT 0,
  gross_profit_kobo INTEGER NOT NULL DEFAULT 0,
  margin_basis_points INTEGER NOT NULL DEFAULT 0,
  internal_note TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, job_no)
);

CREATE INDEX IF NOT EXISTS idx_print_jobs_status_due ON print_jobs(company_id, production_status, due_at);
CREATE INDEX IF NOT EXISTS idx_print_jobs_customer ON print_jobs(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS print_job_materials (
  id TEXT PRIMARY KEY,
  print_job_id TEXT NOT NULL REFERENCES print_jobs(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  planned_quantity REAL,
  actual_quantity REAL NOT NULL DEFAULT 0,
  waste_quantity REAL NOT NULL DEFAULT 0,
  unit_cost_kobo INTEGER NOT NULL DEFAULT 0,
  issued_from_location_id TEXT REFERENCES company_locations(id) ON DELETE SET NULL,
  issued_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note TEXT
);

CREATE TABLE IF NOT EXISTS print_job_status_events (
  id TEXT PRIMARY KEY,
  print_job_id TEXT NOT NULL REFERENCES print_jobs(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  note TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_print_job_events_job ON print_job_status_events(print_job_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS print_proofs (
  id TEXT PRIMARY KEY,
  print_job_id TEXT NOT NULL REFERENCES print_jobs(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL DEFAULT 1,
  file_key TEXT,
  preview_key TEXT,
  sent_at TEXT,
  sent_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  customer_response TEXT CHECK (customer_response IN ('pending','approved','changes_requested','rejected') OR customer_response IS NULL),
  customer_comment TEXT,
  responded_at TEXT,
  approved_by_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(print_job_id, version_no)
);

CREATE TABLE IF NOT EXISTS print_quality_checks (
  id TEXT PRIMARY KEY,
  print_job_id TEXT NOT NULL REFERENCES print_jobs(id) ON DELETE CASCADE,
  checked_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  result TEXT NOT NULL CHECK (result IN ('pass','rework','reject')),
  checklist_json TEXT,
  note TEXT,
  photo_key TEXT,
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO inventory_categories (id, company_id, name, category_type) VALUES
  ('print-category-paper', 'company-printing', 'Paper & Card', 'stock'),
  ('print-category-ink', 'company-printing', 'Ink & Toner', 'stock'),
  ('print-category-large-format', 'company-printing', 'Large Format Media', 'stock'),
  ('print-category-finishing', 'company-printing', 'Finishing Supplies', 'consumable'),
  ('print-category-packaging', 'company-printing', 'Packaging', 'consumable'),
  ('print-category-internal', 'company-printing', 'Internal Supplies', 'supply');

INSERT OR IGNORE INTO printing_services (id, code, name, category, pricing_unit, requires_artwork, requires_proof) VALUES
  ('print-service-large-format', 'LARGE-FORMAT', 'Large Format Printing', 'Large Format', 'square_meter', 1, 1),
  ('print-service-digital', 'DIGITAL', 'Digital Printing', 'Digital Print', 'job', 1, 1),
  ('print-service-branding', 'BRANDING', 'Branding & Promotional Print', 'Branding', 'job', 1, 1),
  ('print-service-finishing', 'FINISHING', 'Print Finishing', 'Finishing', 'job', 0, 0);

INSERT OR IGNORE INTO role_data_requirements (
  id, company_id, role_id, module, requirement_code, description, cadence, blocking, reminder_policy_json
) VALUES
  ('req-print-operator-materials', 'company-printing', 'role-print-large-format', 'printing', 'print_material_usage', 'Record actual material usage and wastage before a production job can be completed.', 'per_action', 1, '{"remind_after_minutes":30,"escalate_to_manager":true}'),
  ('req-print-designer-proof', 'company-printing', 'role-print-designer', 'printing', 'proof_status', 'Update proof status for assigned design jobs before production handoff.', 'per_action', 1, '{"remind_after_minutes":60,"escalate_to_manager":true}'),
  ('req-print-manager-daily', 'company-printing', 'role-print-manager', 'printing', 'daily_jobs_review', 'Review open and overdue print jobs before end of day.', 'daily', 0, '{"remind_local_time":"16:00","escalate_to_owner":false}');
