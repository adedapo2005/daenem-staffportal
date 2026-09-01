PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
 ('perm-bakery-report-bread','bakery.report.bread_accountability','bakery','report_bread_accountability','View where every produced loaf ended: sold, returned, damaged, promotional, staff consumption, in store or in transit',1),
 ('perm-bakery-report-returns','bakery.report.returns','bakery','report_returns','View returned bread by date and use the source ledger to investigate unusual return levels',1),
 ('perm-bakery-report-cash','bakery.report.cash_collection','bakery','report_cash_collection','View cash, POS and transfer collections recorded against Bakery dispatches',1),
 ('perm-bakery-report-pos','bakery.report.pos_charges','bakery','report_pos_charges','View POS fees charged against Bakery collections and compare fee trends',1),
 ('perm-bakery-report-debt','bakery.report.outstanding_debt','bakery','report_outstanding_debt','View outstanding Bakery sale balances requiring collection or investigation',1);

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level) VALUES
 ('bakery-report-bread-owner','role-owner','perm-bakery-report-bread','manage'),
 ('bakery-report-returns-owner','role-owner','perm-bakery-report-returns','manage'),
 ('bakery-report-cash-owner','role-owner','perm-bakery-report-cash','manage'),
 ('bakery-report-pos-owner','role-owner','perm-bakery-report-pos','manage'),
 ('bakery-report-debt-owner','role-owner','perm-bakery-report-debt','manage'),
 ('bakery-report-bread-manager','role-bakery-manager','perm-bakery-report-bread','approve'),
 ('bakery-report-returns-manager','role-bakery-manager','perm-bakery-report-returns','approve'),
 ('bakery-report-cash-manager','role-bakery-manager','perm-bakery-report-cash','approve'),
 ('bakery-report-pos-manager','role-bakery-manager','perm-bakery-report-pos','approve'),
 ('bakery-report-debt-manager','role-bakery-manager','perm-bakery-report-debt','approve'),
 ('bakery-report-bread-accountant','role-bakery-accountant','perm-bakery-report-bread','view'),
 ('bakery-report-returns-accountant','role-bakery-accountant','perm-bakery-report-returns','view'),
 ('bakery-report-cash-accountant','role-bakery-accountant','perm-bakery-report-cash','view'),
 ('bakery-report-pos-accountant','role-bakery-accountant','perm-bakery-report-pos','view'),
 ('bakery-report-debt-accountant','role-bakery-accountant','perm-bakery-report-debt','view');
