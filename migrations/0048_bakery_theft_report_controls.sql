PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
 ('perm-bakery-report-theft','bakery.report.theft_investigation','bakery','report_theft_investigation','View bread shortages, unremitted sales, missing evidence and late reconciliation investigations with their assignment and resolution status',1);

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level) VALUES
 ('bakery-report-theft-owner','role-owner','perm-bakery-report-theft','manage'),
 ('bakery-report-theft-manager','role-bakery-manager','perm-bakery-report-theft','approve'),
 ('bakery-report-theft-accountant','role-bakery-accountant','perm-bakery-report-theft','view');

CREATE INDEX IF NOT EXISTS idx_bakery_money_debt_age ON bakery_money_ledger(company_id,status,business_date,custodian_id);
CREATE INDEX IF NOT EXISTS idx_bakery_exception_assignee ON bakery_accountability_exceptions(company_id,assigned_to,status,created_at DESC);
