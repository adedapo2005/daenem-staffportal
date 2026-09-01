PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS finance_accounts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK(account_type IN ('asset','liability','equity','revenue','expense','cost_of_sales')),
  parent_id TEXT REFERENCES finance_accounts(id) ON DELETE SET NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  allow_manual_posting INTEGER NOT NULL DEFAULT 1 CHECK(allow_manual_posting IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,code)
);
CREATE INDEX IF NOT EXISTS idx_finance_accounts_company ON finance_accounts(company_id,account_type,active);

CREATE TABLE IF NOT EXISTS fiscal_periods (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','soft_closed','closed')),
  closed_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,start_date,end_date)
);
CREATE INDEX IF NOT EXISTS idx_fiscal_period_company ON fiscal_periods(company_id,start_date,end_date,status);

CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fiscal_period_id TEXT REFERENCES fiscal_periods(id) ON DELETE SET NULL,
  entry_no TEXT NOT NULL,
  entry_date TEXT NOT NULL,
  description TEXT NOT NULL,
  source_module TEXT NOT NULL DEFAULT 'manual',
  source_type TEXT,
  source_id TEXT,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','posted','reversed','void')),
  currency TEXT NOT NULL DEFAULT 'NGN',
  prepared_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TEXT,
  posted_at TEXT,
  reversal_of_id TEXT REFERENCES journal_entries(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,entry_no)
);
CREATE INDEX IF NOT EXISTS idx_journal_company_date ON journal_entries(company_id,entry_date DESC,status);

CREATE TABLE IF NOT EXISTS journal_lines (
  id TEXT PRIMARY KEY,
  journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES finance_accounts(id) ON DELETE RESTRICT,
  description TEXT,
  debit_kobo INTEGER NOT NULL DEFAULT 0 CHECK(debit_kobo>=0),
  credit_kobo INTEGER NOT NULL DEFAULT 0 CHECK(credit_kobo>=0),
  customer_id TEXT,
  supplier_id TEXT,
  employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  cost_center TEXT,
  metadata_json TEXT,
  CHECK(NOT(debit_kobo>0 AND credit_kobo>0))
);
CREATE INDEX IF NOT EXISTS idx_journal_lines_account ON journal_lines(account_id,journal_entry_id);

CREATE TABLE IF NOT EXISTS finance_receivables (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_ref TEXT,
  invoice_no TEXT,
  source_module TEXT,
  source_id TEXT,
  invoice_date TEXT NOT NULL,
  due_date TEXT,
  amount_kobo INTEGER NOT NULL CHECK(amount_kobo>=0),
  paid_kobo INTEGER NOT NULL DEFAULT 0 CHECK(paid_kobo>=0),
  balance_kobo INTEGER NOT NULL CHECK(balance_kobo>=0),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','part_paid','paid','overdue','written_off','cancelled')),
  notes TEXT,
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_receivables_company_due ON finance_receivables(company_id,status,due_date);

CREATE TABLE IF NOT EXISTS finance_receivable_payments (
  id TEXT PRIMARY KEY,
  receivable_id TEXT NOT NULL REFERENCES finance_receivables(id) ON DELETE CASCADE,
  amount_kobo INTEGER NOT NULL CHECK(amount_kobo>0),
  payment_method TEXT NOT NULL CHECK(payment_method IN ('cash','pos','bank_transfer','wallet','cheque','other')),
  reference TEXT,
  paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  recorded_by TEXT REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fiscal_period_id TEXT REFERENCES fiscal_periods(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','locked','archived')),
  currency TEXT NOT NULL DEFAULT 'NGN',
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS budget_lines (
  id TEXT PRIMARY KEY,
  budget_id TEXT NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES finance_accounts(id) ON DELETE RESTRICT,
  period_key TEXT NOT NULL,
  amount_kobo INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  UNIQUE(budget_id,account_id,period_key)
);

CREATE TABLE IF NOT EXISTS funding_events (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_date TEXT NOT NULL,
  funding_type TEXT NOT NULL CHECK(funding_type IN ('owner_injection','loan','grant','transfer_in','transfer_out','dividend','other')),
  source_name TEXT,
  amount_kobo INTEGER NOT NULL CHECK(amount_kobo>=0),
  currency TEXT NOT NULL DEFAULT 'NGN',
  reference TEXT,
  notes TEXT,
  recorded_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
 ('perm-finance-entry','finance.entry','finance','entry','Create and manage finance entries',1),
 ('perm-finance-receivables','finance.receivables','finance','receivables','Manage accounts receivable and customer payments',1),
 ('perm-finance-ledger','finance.ledger','finance','ledger','Explore posted ledger balances and journal history',1),
 ('perm-finance-journal','finance.journal','finance','journal','Create, approve and post manual journals',1),
 ('perm-finance-reports','finance.reports','finance','reports','View financial reports',1),
 ('perm-finance-periods','finance.periods','finance','periods','Manage fiscal periods',1),
 ('perm-finance-budgets','finance.budgets','finance','budgets','Create and approve budgets',1),
 ('perm-finance-coa','finance.coa','finance','coa','Govern chart of accounts',1),
 ('perm-finance-funding','finance.funding','finance','funding','Record and review funding events',1);

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'owner-'||p.id,'role-owner',p.id,'manage' FROM permissions p WHERE p.module='finance';
INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'accountant-'||r.id||'-'||p.id,r.id,p.id,CASE WHEN p.code IN ('finance.journal','finance.periods','finance.budgets','finance.coa') THEN 'edit' ELSE 'manage' END
FROM roles r CROSS JOIN permissions p
WHERE r.code='accountant' AND r.company_id IS NOT NULL AND p.module='finance';
INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'manager-finance-report-'||r.id,r.id,'perm-finance-reports','view'
FROM roles r WHERE r.code IN ('manager','fleet_manager','admin') AND r.company_id IS NOT NULL;

-- Standard starter chart of accounts for each Daenem company. Administrators can extend it.
INSERT OR IGNORE INTO finance_accounts(id,company_id,code,name,account_type,allow_manual_posting)
SELECT 'coa-'||c.code||'-1000',c.id,'1000','Cash & Bank','asset',1 FROM companies c;
INSERT OR IGNORE INTO finance_accounts(id,company_id,code,name,account_type,allow_manual_posting)
SELECT 'coa-'||c.code||'-1100',c.id,'1100','Accounts Receivable','asset',0 FROM companies c;
INSERT OR IGNORE INTO finance_accounts(id,company_id,code,name,account_type,allow_manual_posting)
SELECT 'coa-'||c.code||'-1200',c.id,'1200','Inventory','asset',0 FROM companies c;
INSERT OR IGNORE INTO finance_accounts(id,company_id,code,name,account_type,allow_manual_posting)
SELECT 'coa-'||c.code||'-2000',c.id,'2000','Accounts Payable','liability',0 FROM companies c;
INSERT OR IGNORE INTO finance_accounts(id,company_id,code,name,account_type,allow_manual_posting)
SELECT 'coa-'||c.code||'-3000',c.id,'3000','Owner Equity','equity',1 FROM companies c;
INSERT OR IGNORE INTO finance_accounts(id,company_id,code,name,account_type,allow_manual_posting)
SELECT 'coa-'||c.code||'-4000',c.id,'4000','Sales Revenue','revenue',1 FROM companies c;
INSERT OR IGNORE INTO finance_accounts(id,company_id,code,name,account_type,allow_manual_posting)
SELECT 'coa-'||c.code||'-5000',c.id,'5000','Cost of Sales','cost_of_sales',1 FROM companies c;
INSERT OR IGNORE INTO finance_accounts(id,company_id,code,name,account_type,allow_manual_posting)
SELECT 'coa-'||c.code||'-6000',c.id,'6000','Operating Expenses','expense',1 FROM companies c;
INSERT OR IGNORE INTO finance_accounts(id,company_id,code,name,account_type,allow_manual_posting)
SELECT 'coa-'||c.code||'-6100',c.id,'6100','Payroll Expense','expense',1 FROM companies c;
INSERT OR IGNORE INTO finance_accounts(id,company_id,code,name,account_type,allow_manual_posting)
SELECT 'coa-'||c.code||'-6200',c.id,'6200','Repairs & Maintenance','expense',1 FROM companies c;
