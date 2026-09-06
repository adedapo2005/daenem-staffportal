PRAGMA foreign_keys = ON;

-- Batch 1 extends the already accepted receipt table without changing its
-- identity or uniqueness semantics.  Receipts remain append-only evidence.
PRAGMA foreign_keys = OFF;
ALTER TABLE offline_sync_receipts RENAME TO offline_sync_receipts_0054;
CREATE TABLE offline_sync_receipts (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES auth_sessions(id) ON DELETE SET NULL,
  operation_kind TEXT NOT NULL CHECK (operation_kind IN ('forms.submit','expense.draft.save','expense.request.submit','expense.evidence.upload')),
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  state TEXT NOT NULL CHECK (state IN ('processing','completed','rejected','conflict','failed_retryable')),
  attempt_count INTEGER NOT NULL DEFAULT 1,
  last_error_category TEXT,
  result_json TEXT,
  server_received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO offline_sync_receipts(
  id,operation_id,idempotency_key,employee_id,company_id,session_id,
  operation_kind,entity_type,entity_id,state,attempt_count,last_error_category,
  result_json,server_received_at,started_at,completed_at,created_at,updated_at
)
SELECT id,operation_id,idempotency_key,employee_id,company_id,session_id,
  operation_kind,entity_type,entity_id,state,attempt_count,last_error_category,
  result_json,server_received_at,started_at,completed_at,created_at,updated_at
FROM offline_sync_receipts_0054;
DROP TABLE offline_sync_receipts_0054;
PRAGMA foreign_keys = ON;
CREATE INDEX IF NOT EXISTS idx_offline_receipts_employee ON offline_sync_receipts(employee_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_offline_receipts_company ON offline_sync_receipts(company_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_offline_receipts_state ON offline_sync_receipts(state, updated_at DESC);

CREATE TABLE IF NOT EXISTS spend_accounting_treatments (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  profit_effect TEXT NOT NULL CHECK (profit_effect IN ('cogs','operating','payroll_canonical','non_pnl')),
  is_p_and_l INTEGER NOT NULL DEFAULT 0 CHECK (is_p_and_l IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  source TEXT NOT NULL DEFAULT 'system' CHECK (source IN ('system','admin')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS spend_cost_centers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  source TEXT NOT NULL DEFAULT 'system' CHECK (source IN ('system','admin')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,code)
);
CREATE INDEX IF NOT EXISTS idx_spend_cost_centers_scope ON spend_cost_centers(company_id,active,name);

CREATE TABLE IF NOT EXISTS spend_categories (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  accounting_treatment_id TEXT NOT NULL REFERENCES spend_accounting_treatments(id) ON DELETE RESTRICT,
  employee_request_allowed INTEGER NOT NULL DEFAULT 1 CHECK (employee_request_allowed IN (0,1)),
  evidence_required INTEGER NOT NULL DEFAULT 1 CHECK (evidence_required IN (0,1)),
  direct_shared_policy TEXT NOT NULL DEFAULT 'either' CHECK (direct_shared_policy IN ('direct','shared','either')),
  default_cost_center_id TEXT REFERENCES spend_cost_centers(id) ON DELETE SET NULL,
  allowed_erp_json TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  source TEXT NOT NULL DEFAULT 'system' CHECK (source IN ('system','admin')),
  superseded_by TEXT REFERENCES spend_categories(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,normalized_name)
);
CREATE INDEX IF NOT EXISTS idx_spend_categories_scope ON spend_categories(company_id,active,name);

CREATE TABLE IF NOT EXISTS spend_suppliers (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  tax_reference TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  source TEXT NOT NULL DEFAULT 'admin' CHECK (source IN ('system','admin')),
  superseded_by TEXT REFERENCES spend_suppliers(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,normalized_name)
);
CREATE INDEX IF NOT EXISTS idx_spend_suppliers_scope ON spend_suppliers(company_id,active,name);

CREATE TABLE IF NOT EXISTS spend_master_proposals (
  id TEXT PRIMARY KEY,
  submitted_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  company_id TEXT REFERENCES companies(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('supplier','category','cost_center')),
  proposed_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','admin_review','approved','rejected','merged')),
  reviewed_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  merged_into_id TEXT,
  review_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_spend_master_proposals_status ON spend_master_proposals(company_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS spend_allocation_templates (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('percentage','fixed_amount','equal_split')),
  default_treatment_id TEXT REFERENCES spend_accounting_treatments(id) ON DELETE SET NULL,
  default_cost_center_id TEXT REFERENCES spend_cost_centers(id) ON DELETE SET NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,normalized_name)
);
CREATE TABLE IF NOT EXISTS spend_allocation_template_items (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES spend_allocation_templates(id) ON DELETE RESTRICT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  department TEXT,
  cost_center_id TEXT REFERENCES spend_cost_centers(id) ON DELETE SET NULL,
  percentage REAL,
  fixed_amount_kobo INTEGER,
  basis TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(template_id,company_id)
);

CREATE TABLE IF NOT EXISTS spend_approval_rules (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE RESTRICT,
  branch_location_id TEXT REFERENCES company_locations(id) ON DELETE SET NULL,
  department TEXT,
  category_id TEXT REFERENCES spend_categories(id) ON DELETE SET NULL,
  cost_center_id TEXT REFERENCES spend_cost_centers(id) ON DELETE SET NULL,
  project_id TEXT REFERENCES construction_projects(id) ON DELETE SET NULL,
  requester_role_code TEXT,
  min_amount_kobo INTEGER NOT NULL DEFAULT 0,
  max_amount_kobo INTEGER,
  step_no INTEGER NOT NULL DEFAULT 1,
  approver_role_code TEXT NOT NULL,
  required_permission TEXT NOT NULL DEFAULT 'expense.approve',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_spend_approval_rules_match ON spend_approval_rules(company_id,category_id,min_amount_kobo,max_amount_kobo,step_no,active);

CREATE TABLE IF NOT EXISTS spend_evidence_policies (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE RESTRICT,
  category_id TEXT REFERENCES spend_categories(id) ON DELETE SET NULL,
  min_amount_kobo INTEGER NOT NULL DEFAULT 0,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('receipt','invoice','quote','delivery_note','payment_evidence','other')),
  required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0,1)),
  minimum_count INTEGER NOT NULL DEFAULT 1 CHECK (minimum_count >= 0),
  requires_reason_if_missing INTEGER NOT NULL DEFAULT 1 CHECK (requires_reason_if_missing IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS spend_expense_requests (
  id TEXT PRIMARY KEY,
  request_no TEXT NOT NULL UNIQUE,
  requester_employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  branch_location_id TEXT REFERENCES company_locations(id) ON DELETE SET NULL,
  department TEXT,
  cost_center_id TEXT REFERENCES spend_cost_centers(id) ON DELETE RESTRICT,
  category_id TEXT REFERENCES spend_categories(id) ON DELETE RESTRICT,
  supplier_id TEXT REFERENCES spend_suppliers(id) ON DELETE RESTRICT,
  project_id TEXT REFERENCES construction_projects(id) ON DELETE SET NULL,
  erp_module TEXT,
  context_entity_type TEXT,
  context_entity_id TEXT,
  currency TEXT NOT NULL DEFAULT 'NGN',
  purpose TEXT NOT NULL,
  business_reason TEXT NOT NULL,
  needed_by TEXT,
  total_kobo INTEGER NOT NULL CHECK (total_kobo > 0),
  direct_shared TEXT NOT NULL DEFAULT 'direct' CHECK (direct_shared IN ('direct','shared','mixed')),
  payment_method TEXT,
  bank_reference TEXT,
  accounting_treatment_id TEXT NOT NULL REFERENCES spend_accounting_treatments(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','reviewed','approved','committed','purchased','paid','evidence_verified','finance_posted','bank_reconciled','closed','returned','rejected','cancelled','voided','reversed','superseded')),
  captured_at TEXT,
  submitted_at TEXT,
  approved_at TEXT,
  committed_at TEXT,
  paid_at TEXT,
  posted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_spend_requests_owner_scope ON spend_expense_requests(company_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spend_requests_employee ON spend_expense_requests(requester_employee_id,created_at DESC);

CREATE TABLE IF NOT EXISTS spend_expense_lines (
  id TEXT PRIMARY KEY,
  expense_request_id TEXT NOT NULL REFERENCES spend_expense_requests(id) ON DELETE RESTRICT,
  line_no INTEGER NOT NULL,
  description TEXT NOT NULL,
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo > 0),
  category_id TEXT NOT NULL REFERENCES spend_categories(id) ON DELETE RESTRICT,
  direct_shared TEXT NOT NULL CHECK (direct_shared IN ('direct','shared')),
  accounting_treatment_id TEXT NOT NULL REFERENCES spend_accounting_treatments(id) ON DELETE RESTRICT,
  UNIQUE(expense_request_id,line_no)
);

CREATE TABLE IF NOT EXISTS spend_expense_allocations (
  id TEXT PRIMARY KEY,
  expense_request_id TEXT NOT NULL REFERENCES spend_expense_requests(id) ON DELETE RESTRICT,
  expense_line_id TEXT REFERENCES spend_expense_lines(id) ON DELETE RESTRICT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  department TEXT,
  cost_center_id TEXT REFERENCES spend_cost_centers(id) ON DELETE RESTRICT,
  allocation_method TEXT NOT NULL CHECK (allocation_method IN ('percentage','fixed_amount','equal_split')),
  basis_json TEXT NOT NULL DEFAULT '{}',
  source_amount_kobo INTEGER NOT NULL CHECK (source_amount_kobo >= 0),
  allocated_amount_kobo INTEGER NOT NULL CHECK (allocated_amount_kobo >= 0),
  rounding_adjustment_kobo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_spend_allocations_request ON spend_expense_allocations(expense_request_id,company_id);

CREATE TABLE IF NOT EXISTS spend_expense_evidence (
  id TEXT PRIMARY KEY,
  expense_request_id TEXT NOT NULL REFERENCES spend_expense_requests(id) ON DELETE RESTRICT,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('receipt','invoice','quote','delivery_note','payment_evidence','other')),
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  sha256 TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('pending','uploaded','verified','rejected','orphaned')),
  captured_at TEXT,
  client_timezone TEXT,
  uploaded_at TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_spend_evidence_request ON spend_expense_evidence(expense_request_id,created_at DESC);

CREATE TABLE IF NOT EXISTS spend_expense_approvals (
  id TEXT PRIMARY KEY,
  expense_request_id TEXT NOT NULL REFERENCES spend_expense_requests(id) ON DELETE RESTRICT,
  rule_id TEXT REFERENCES spend_approval_rules(id) ON DELETE SET NULL,
  step_no INTEGER NOT NULL,
  approver_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approver_role_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','returned','rejected','skipped')),
  reason TEXT,
  acted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(expense_request_id,step_no)
);
CREATE INDEX IF NOT EXISTS idx_spend_approvals_queue ON spend_expense_approvals(approver_employee_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS spend_accounting_postings (
  id TEXT PRIMARY KEY,
  expense_request_id TEXT NOT NULL REFERENCES spend_expense_requests(id) ON DELETE RESTRICT,
  journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE RESTRICT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  accounting_treatment_id TEXT NOT NULL REFERENCES spend_accounting_treatments(id) ON DELETE RESTRICT,
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo > 0),
  recognized_kobo INTEGER NOT NULL DEFAULT 0 CHECK (recognized_kobo >= 0),
  posting_date TEXT NOT NULL,
  posted_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  correlation_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(expense_request_id)
);

CREATE TABLE IF NOT EXISTS spend_expense_events (
  id TEXT PRIMARY KEY,
  expense_request_id TEXT NOT NULL REFERENCES spend_expense_requests(id) ON DELETE RESTRICT,
  actor_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  previous_status TEXT,
  next_status TEXT,
  reason TEXT,
  request_id TEXT,
  source TEXT NOT NULL DEFAULT 'web',
  captured_at TEXT,
  server_received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_spend_events_request ON spend_expense_events(expense_request_id,server_received_at);

-- Controlled accounting treatments. Non-P&L treatments are deliberately
-- explicit so they cannot be mistaken for operating expense.
INSERT OR IGNORE INTO spend_accounting_treatments(id,code,name,profit_effect,is_p_and_l,source) VALUES
 ('spend-treatment-cogs','COGS','Cost of Goods Sold','cogs',1,'system'),
 ('spend-treatment-opex','OPERATING_EXPENSE','Operating Expense','operating',1,'system'),
 ('spend-treatment-payroll','PAYROLL','Payroll (canonical payroll source)','payroll_canonical',1,'system'),
 ('spend-treatment-capex','CAPITAL_EXPENDITURE','Capital Expenditure','non_pnl',0,'system'),
 ('spend-treatment-prepaid','PREPAID_EXPENSE','Prepaid Expense','non_pnl',0,'system'),
 ('spend-treatment-recoverable','RECOVERABLE_EXPENSE','Recoverable Expense','non_pnl',0,'system'),
 ('spend-treatment-employee-advance','EMPLOYEE_ADVANCE','Employee Advance','non_pnl',0,'system'),
 ('spend-treatment-supplier-advance','SUPPLIER_ADVANCE','Supplier Advance','non_pnl',0,'system'),
 ('spend-treatment-intercompany','INTERCOMPANY','Intercompany','non_pnl',0,'system'),
 ('spend-treatment-tax','TAX','Tax','non_pnl',0,'system'),
 ('spend-treatment-non-pnl','NON_P_AND_L','Non-P&L Cash Movement','non_pnl',0,'system');

-- The accepted starter chart does not have a non-P&L account. Add one so a
-- future posting can remain visible without reducing operating profit.
INSERT OR IGNORE INTO finance_accounts(id,company_id,code,name,account_type,allow_manual_posting)
SELECT 'coa-'||c.code||'-1300',c.id,'1300','Capital & Other Non-P&L Assets','asset',1 FROM companies c;

INSERT OR IGNORE INTO spend_cost_centers(id,company_id,code,name,source)
SELECT 'spend-cc-'||c.code||'-general',c.id,'GENERAL','General operations','system' FROM companies c;
INSERT OR IGNORE INTO spend_cost_centers(id,company_id,code,name,source)
SELECT 'spend-cc-'||c.code||'-finance',c.id,'FINANCE','Finance and control','system' FROM companies c;

INSERT OR IGNORE INTO spend_categories(id,company_id,code,name,normalized_name,accounting_treatment_id,employee_request_allowed,evidence_required,direct_shared_policy,default_cost_center_id,allowed_erp_json,source)
SELECT 'spend-category-'||lower(replace(c.code,' ','-'))||'-general',c.id,'GENERAL','General business expense','general business expense','spend-treatment-opex',1,1,'either','spend-cc-'||c.code||'-general','["finance","printing","bakery","autos","logistics","properties"]','system' FROM companies c;
INSERT OR IGNORE INTO spend_categories(id,company_id,code,name,normalized_name,accounting_treatment_id,employee_request_allowed,evidence_required,direct_shared_policy,default_cost_center_id,allowed_erp_json,source) VALUES
 ('spend-category-printing-materials',NULL,'PRINTING_MATERIALS','Printing materials','printing materials','spend-treatment-cogs',1,1,'direct',NULL,'["printing"]','system'),
 ('spend-category-ingredients-packaging',NULL,'INGREDIENTS_PACKAGING','Ingredients and packaging','ingredients and packaging','spend-treatment-cogs',1,1,'direct',NULL,'["bakery"]','system'),
 ('spend-category-fuel-utilities',NULL,'FUEL_UTILITIES','Fuel and utilities','fuel and utilities','spend-treatment-opex',1,1,'either',NULL,'["printing","bakery","logistics","properties","finance"]','system'),
 ('spend-category-maintenance-repairs',NULL,'MAINTENANCE_REPAIRS','Maintenance and repairs','maintenance and repairs','spend-treatment-opex',1,1,'either',NULL,'["printing","bakery","autos","logistics","properties"]','system'),
 ('spend-category-travel-transport',NULL,'TRAVEL_TRANSPORT','Travel and transport','travel and transport','spend-treatment-opex',1,1,'either',NULL,'["logistics","finance"]','system'),
 ('spend-category-professional-services',NULL,'PROFESSIONAL_SERVICES','Professional services','professional services','spend-treatment-opex',1,1,'either',NULL,'["finance","properties"]','system'),
 ('spend-category-property-operations',NULL,'PROPERTY_OPERATIONS','Property operations','property operations','spend-treatment-opex',1,1,'direct',NULL,'["properties"]','system'),
 ('spend-category-vehicle-landed-costs',NULL,'VEHICLE_LANDED_COSTS','Vehicle landed costs','vehicle landed costs','spend-treatment-capex',1,1,'direct',NULL,'["autos"]','system'),
 ('spend-category-construction-projects',NULL,'CONSTRUCTION_PROJECTS','Construction project costs','construction project costs','spend-treatment-capex',1,1,'shared',NULL,'["finance"]','system'),
 ('spend-category-office-supplies',NULL,'OFFICE_SUPPLIES','Office supplies','office supplies','spend-treatment-opex',1,1,'either',NULL,'["finance","printing","bakery","autos","logistics","properties"]','system');

INSERT OR IGNORE INTO spend_evidence_policies(id,company_id,category_id,min_amount_kobo,evidence_type,required,minimum_count,requires_reason_if_missing)
VALUES ('spend-evidence-default',NULL,NULL,0,'receipt',1,1,1);
INSERT OR IGNORE INTO spend_approval_rules(id,company_id,min_amount_kobo,max_amount_kobo,step_no,approver_role_code,required_permission)
VALUES ('spend-approval-default',NULL,0,NULL,1,'manager','expense.approve');

-- Reusable headquarters allocation templates. The final split is still
-- calculated from selected participants and reconciled server-side.
INSERT OR IGNORE INTO spend_allocation_templates(id,company_id,name,normalized_name,method,default_treatment_id,active)
VALUES
 ('spend-template-complex-generator-fuel',NULL,'Daenem Complex Generator Fuel','daenem complex generator fuel','percentage','spend-treatment-opex',1),
 ('spend-template-complex-security',NULL,'Daenem Complex Security','daenem complex security','equal_split','spend-treatment-opex',1),
 ('spend-template-complex-cleaning',NULL,'Daenem Complex Cleaning','daenem complex cleaning','equal_split','spend-treatment-opex',1),
 ('spend-template-complex-electricity',NULL,'Daenem Complex Electricity','daenem complex electricity','equal_split','spend-treatment-opex',1),
 ('spend-template-complex-internet',NULL,'Daenem Complex Internet','daenem complex internet','equal_split','spend-treatment-opex',1),
 ('spend-template-complex-maintenance',NULL,'Daenem Complex Maintenance','daenem complex maintenance','equal_split','spend-treatment-opex',1);

-- One approved headquarters template proves that reusable beneficiaries and
-- deterministic percentages are stored as controlled data, not free text.
INSERT OR IGNORE INTO spend_allocation_template_items(id,template_id,company_id,cost_center_id,percentage,basis,sort_order) VALUES
 ('spend-template-generator-print','spend-template-complex-generator-fuel','company-printing','spend-cc-PRINT-general',40,'admin-approved headquarters split',0),
 ('spend-template-generator-bakery','spend-template-complex-generator-fuel','company-bakery','spend-cc-BAKERY-general',35,'admin-approved headquarters split',1),
 ('spend-template-generator-logistics','spend-template-complex-generator-fuel','company-logistics','spend-cc-LOGISTICS-general',15,'admin-approved headquarters split',2),
 ('spend-template-generator-properties','spend-template-complex-generator-fuel','company-properties','spend-cc-PROPERTIES-general',10,'admin-approved headquarters split',3);

INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
 ('perm-expense-requests','expense.requests','expense','requests','Create and submit employee expense requests',1),
 ('perm-expense-own','expense.own','expense','own','View the employee''s own expense requests',1),
 ('perm-expense-review','expense.review','expense','review','Review assigned expense requests',1),
 ('perm-expense-approve','expense.approve','expense','approve','Approve, return or reject expense requests',1),
 ('perm-expense-post','expense.post','expense','post','Create the controlled Finance posting for approved expense requests',1),
 ('perm-expense-master','expense.master','expense','master','Manage controlled spend master data',1),
 ('perm-expense-allocations','expense.allocations','expense','allocations','Manage and review shared expense allocations',1),
 ('perm-expense-intelligence','expense.intelligence','expense','intelligence','View Owner Spend and Profit Intelligence',1);

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'spend-own-'||r.id||'-'||p.id,r.id,p.id,
  CASE WHEN p.code='expense.requests' THEN 'create' ELSE 'view' END
FROM roles r CROSS JOIN permissions p
WHERE r.is_system=0 AND p.code IN ('expense.requests','expense.own');
INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'spend-review-'||r.id||'-'||p.id,r.id,p.id,'approve'
FROM roles r CROSS JOIN permissions p
WHERE r.is_system=0 AND r.code IN ('manager','company_admin','admin','accountant','fleet_manager','facility_manager')
  AND p.code IN ('expense.review','expense.approve');
INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'spend-finance-'||r.id||'-'||p.id,r.id,p.id,'manage'
FROM roles r CROSS JOIN permissions p
WHERE r.is_system=0 AND r.code IN ('admin','accountant') AND p.code IN ('expense.post','expense.master','expense.allocations');
INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'spend-owner-'||p.id,'role-owner',p.id,'manage'
FROM permissions p WHERE p.code IN ('expense.requests','expense.own','expense.review','expense.approve','expense.post','expense.master','expense.allocations','expense.intelligence');

UPDATE offline_policy
SET allowed_operations_json='["forms.submit","expense.draft.save","expense.request.submit","expense.evidence.upload"]', updated_at=CURRENT_TIMESTAMP
WHERE id='global';
