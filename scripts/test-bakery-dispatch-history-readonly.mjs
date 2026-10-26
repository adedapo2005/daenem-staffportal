// Read-only Bakery pre-release exception report: no Cloudflare or money writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const sql=fs.readFileSync(new URL('./bakery-dispatch-history-readonly.sql',import.meta.url),'utf8');
assert(!/^\s*(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|REPLACE|PRAGMA|ATTACH|DETACH)\b/im.test(sql),
 'The release audit must never contain a mutating SQL statement');
const db=new DatabaseSync(':memory:');
db.exec(`
 CREATE TABLE bakery_dispatches(id TEXT,company_id TEXT,status TEXT,location_id TEXT);
 CREATE TABLE bakery_dispatch_items(dispatch_id TEXT,product_id TEXT,quantity REAL);
 CREATE TABLE bakery_products(id TEXT,company_id TEXT,inventory_item_id TEXT);
 CREATE TABLE stock_movements(id TEXT,company_id TEXT,reference_type TEXT,
  reference_id TEXT,movement_type TEXT,item_id TEXT,from_location_id TEXT,quantity REAL);
 CREATE TABLE audit_logs(company_id TEXT,entity_id TEXT,module TEXT,action TEXT,
  entity_type TEXT,source TEXT);
 INSERT INTO bakery_products VALUES('bread','company-bakery','inv-bread');
 INSERT INTO bakery_dispatches VALUES('clean-close','company-bakery','closed','bakery-hq');
 INSERT INTO bakery_dispatch_items VALUES('clean-close','bread',2);
 INSERT INTO stock_movements VALUES('stock-clean','company-bakery',
  'bakery_dispatch','clean-close','transfer_out','inv-bread','bakery-hq',2);
 INSERT INTO audit_logs VALUES('company-bakery','clean-close','bakery','issue_dispatch',
  'bakery_dispatch','database');
 INSERT INTO audit_logs VALUES('company-bakery','clean-close','bakery','close_reconciliation',
  'bakery_dispatch','database');
`);
const audit=db.prepare(sql);
const changes=()=>db.prepare('SELECT total_changes() AS changes').get().changes;
const initialChanges=changes();
assert.deepEqual(audit.all(),[],'A completely evidenced closed dispatch has no false exceptions');
assert.equal(changes(),initialChanges,'A read-only report cannot modify normal financial records');

// Historical data can contain rows predating new triggers. Flag them for
// human review, without inventing missing audits or changing stock.
db.exec(`
 INSERT INTO bakery_dispatches VALUES('legacy-closed','company-bakery','closed','bakery-hq');
 INSERT INTO bakery_dispatches VALUES('legacy-draft','company-bakery','draft','bakery-hq');
 INSERT INTO bakery_dispatch_items VALUES('legacy-draft','bread',2);
 INSERT INTO stock_movements VALUES('stock-legacy','company-bakery',
  'bakery_dispatch','legacy-draft','transfer_out','inv-bread','bakery-hq',1);
 INSERT INTO stock_movements VALUES('stock-wrong-location','company-bakery',
  'bakery_dispatch','clean-close','transfer_out','inv-bread','wrong-location',1);
 INSERT INTO bakery_dispatches VALUES('other-company','company-printing','closed','bakery-hq');
`);
const before=changes();
const issues=audit.all();
const flags=id=>new Set(issues.filter(x=>x.dispatch_id===id).map(x=>x.issue_code));
assert.deepEqual([...flags('legacy-closed')].sort(),[
 'CLOSED_WITHOUT_DATABASE_AUDIT_REVIEW','ISSUED_WITHOUT_BREAD_ITEMS',
 'ISSUED_WITHOUT_DATABASE_AUDIT_REVIEW'
].sort(),'A fabricated or legacy close with no items/audits must be surfaced');
assert(flags('legacy-draft').has('DISPATCH_STOCK_QUANTITY_MISMATCH'),
 'Partially debited draft quantity mismatch must be surfaced');
assert(flags('legacy-draft').has('DRAFT_WITH_STOCK_ALREADY_DEBITED'),
 'An incomplete draft holding deducted inventory must be surfaced');
assert(flags('clean-close').has('UNEXPECTED_DISPATCH_STOCK_MOVEMENT'),
 'Wrong-location stock movement must be surfaced');
assert.equal(flags('other-company').size,0,'Other companies remain outside Bakery scope');
assert.equal(changes(),before,'The release audit must not change financial records');
db.close();
console.log('PASS Bakery release history: clean records pass; missing stock, closure and issuance evidence flagged');
console.log('PASS Bakery history exceptions are read-only and company-scoped; no financial adjustments');
