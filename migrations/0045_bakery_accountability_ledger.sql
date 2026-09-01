PRAGMA foreign_keys = ON;

-- Bakery accountability: every loaf and every naira must have a traceable state.
CREATE TABLE IF NOT EXISTS bakery_custodians (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-bakery' REFERENCES companies(id) ON DELETE CASCADE,
  custodian_type TEXT NOT NULL CHECK (custodian_type IN ('store','dispatch','sales_agent','reseller','staff','customer')),
  employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bakery_custodians_company ON bakery_custodians(company_id,custodian_type,active);

CREATE TABLE IF NOT EXISTS bakery_dispatches (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-bakery' REFERENCES companies(id) ON DELETE CASCADE,
  dispatch_no TEXT NOT NULL UNIQUE,
  location_id TEXT NOT NULL REFERENCES company_locations(id) ON DELETE RESTRICT,
  custodian_id TEXT NOT NULL REFERENCES bakery_custodians(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_transit','received','reconciling','closed','cancelled')),
  dispatched_at TEXT,
  received_at TEXT,
  closed_at TEXT,
  note TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  closed_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bakery_dispatches_company ON bakery_dispatches(company_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS bakery_dispatch_items (
  id TEXT PRIMARY KEY,
  dispatch_id TEXT NOT NULL REFERENCES bakery_dispatches(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES bakery_products(id) ON DELETE RESTRICT,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_price_kobo INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_kobo >= 0),
  UNIQUE(dispatch_id,product_id)
);

CREATE TABLE IF NOT EXISTS bakery_bread_ledger (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-bakery' REFERENCES companies(id) ON DELETE CASCADE,
  business_date TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES bakery_products(id) ON DELETE RESTRICT,
  batch_id TEXT REFERENCES bakery_batches(id) ON DELETE SET NULL,
  dispatch_id TEXT REFERENCES bakery_dispatches(id) ON DELETE SET NULL,
  custodian_id TEXT REFERENCES bakery_custodians(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('produced','sold','returned','damaged','promotional','staff_consumption','in_store','in_transit')),
  quantity REAL NOT NULL CHECK (quantity > 0),
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  reference_type TEXT NOT NULL,
  reference_id TEXT,
  reason TEXT,
  recorded_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bakery_bread_ledger_day ON bakery_bread_ledger(company_id,business_date,product_id,status);
CREATE INDEX IF NOT EXISTS idx_bakery_bread_ledger_dispatch ON bakery_bread_ledger(dispatch_id,custodian_id);

CREATE TABLE IF NOT EXISTS bakery_money_ledger (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-bakery' REFERENCES companies(id) ON DELETE CASCADE,
  business_date TEXT NOT NULL,
  dispatch_id TEXT REFERENCES bakery_dispatches(id) ON DELETE SET NULL,
  custodian_id TEXT REFERENCES bakery_custodians(id) ON DELETE SET NULL,
  sales_order_id TEXT REFERENCES sales_orders(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('cash_received','pos_received','transfer_received','outstanding','refunded','pos_charges')),
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo > 0),
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  reference TEXT,
  reason TEXT,
  recorded_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bakery_money_ledger_day ON bakery_money_ledger(company_id,business_date,status);
CREATE INDEX IF NOT EXISTS idx_bakery_money_ledger_dispatch ON bakery_money_ledger(dispatch_id,custodian_id);

CREATE TABLE IF NOT EXISTS bakery_accountability_exceptions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-bakery' REFERENCES companies(id) ON DELETE CASCADE,
  business_date TEXT NOT NULL,
  dispatch_id TEXT REFERENCES bakery_dispatches(id) ON DELETE SET NULL,
  custodian_id TEXT REFERENCES bakery_custodians(id) ON DELETE SET NULL,
  exception_type TEXT NOT NULL CHECK (exception_type IN ('bread_variance','unremitted_sales','missing_evidence','late_reconciliation')),
  severity TEXT NOT NULL DEFAULT 'high' CHECK (severity IN ('medium','high','critical')),
  quantity_variance REAL,
  amount_variance_kobo INTEGER,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','dismissed')),
  resolution_note TEXT,
  resolved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bakery_exceptions_open ON bakery_accountability_exceptions(company_id,status,severity,created_at DESC);

INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
 ('perm-bakery-dispatch','bakery.dispatch','bakery','dispatch','Create bread dispatches, assign custody and record bread movement between the bakery, agents and resellers',1),
 ('perm-bakery-reconciliation','bakery.reconciliation','bakery','reconciliation','Reconcile every loaf and every naira, investigate shortages and close accountable dispatches',1),
 ('perm-bakery-remittance','bakery.remittance','bakery','remittance','Record cash, POS, transfer, outstanding balances, refunds and POS charges against assigned bakery sales',1);

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level) VALUES
 ('bakery-dispatch-owner','role-owner','perm-bakery-dispatch','manage'),
 ('bakery-reconciliation-owner','role-owner','perm-bakery-reconciliation','manage'),
 ('bakery-remittance-owner','role-owner','perm-bakery-remittance','manage'),
 ('bakery-dispatch-manager','role-bakery-manager','perm-bakery-dispatch','approve'),
 ('bakery-reconciliation-manager','role-bakery-manager','perm-bakery-reconciliation','approve'),
 ('bakery-remittance-manager','role-bakery-manager','perm-bakery-remittance','approve'),
 ('bakery-reconciliation-accountant','role-bakery-accountant','perm-bakery-reconciliation','edit'),
 ('bakery-remittance-accountant','role-bakery-accountant','perm-bakery-remittance','edit'),
 ('bakery-dispatch-production','role-bakery-production','perm-bakery-dispatch','create'),
 ('bakery-dispatch-baker','role-bakery-baker','perm-bakery-dispatch','view');

INSERT OR IGNORE INTO app_settings(setting_key,setting_value,value_type) VALUES
 ('bakery.accountability_zero_tolerance','true','boolean'),
 ('bakery.reconciliation_close_requires_zero_variance','true','boolean'),
 ('bakery.reconciliation_warning_text','No bread and no money should disappear.','string');

CREATE TRIGGER IF NOT EXISTS bakery_bread_ledger_immutable_update
BEFORE UPDATE ON bakery_bread_ledger BEGIN SELECT RAISE(ABORT,'Bread accountability entries are immutable; post a correcting entry.'); END;
CREATE TRIGGER IF NOT EXISTS bakery_bread_ledger_immutable_delete
BEFORE DELETE ON bakery_bread_ledger BEGIN SELECT RAISE(ABORT,'Bread accountability entries cannot be deleted.'); END;
CREATE TRIGGER IF NOT EXISTS bakery_money_ledger_immutable_update
BEFORE UPDATE ON bakery_money_ledger BEGIN SELECT RAISE(ABORT,'Money accountability entries are immutable; post a correcting entry.'); END;
CREATE TRIGGER IF NOT EXISTS bakery_money_ledger_immutable_delete
BEFORE DELETE ON bakery_money_ledger BEGIN SELECT RAISE(ABORT,'Money accountability entries cannot be deleted.'); END;
