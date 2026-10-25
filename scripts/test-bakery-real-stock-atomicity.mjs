// Test real Bakery SQL in an isolated SQLite transaction; no Cloudflare access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const bakery=fs.readFileSync(new URL('../worker/bakery.ts',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../migrations/0005_commerce_printing.sql',import.meta.url),'utf8');
const stockGuard=fs.readFileSync(new URL('../migrations/0102_bakery_financial_integrity.sql',import.meta.url),'utf8');
function sql(source,marker){
 const index=source.indexOf(marker);
 assert(index>=0,'Missing real Bakery SQL: '+marker);
 const tick=String.fromCharCode(96);
 const a=source.lastIndexOf(tick,index),b=source.indexOf(tick,index);
 assert(a>=0&&b>a,'Could not extract Bakery prepared SQL');
 return source.slice(a+1,b);
}
function table(name){
 const a=migration.indexOf('CREATE TABLE IF NOT EXISTS '+name+' (');
 const b=migration.indexOf('\n);',a);
 assert(a>=0&&b>a,'Missing original inventory table');
 return migration.slice(a,b+3)+';';
}
const posSource=bakery.slice(bakery.indexOf('async function posSale('));
const issueSource=bakery.slice(bakery.indexOf('async function issueIngredient('),bakery.indexOf('async function batchStatus('));
// Expand the actual unvalued branch of the conditional stock-movement SQL.
// Searching for 'issue' alone accidentally selected the new valuation-event INSERT.
const guardSql='AND NOT EXISTS(SELECT 1 FROM bakery_material_valuation_balances bv WHERE bv.company_id=? AND bv.location_id=? AND bv.inventory_item_id=?)';
const guardInterpolation="${valuation?'':`"+guardSql+"`}";
assert(issueSource.includes(guardInterpolation),'The real issue must retain its atomic valuation guard');
const issueLegacySource=issueSource.replace(guardInterpolation,guardSql);
function sqlLast(source,marker){const index=source.lastIndexOf(marker);assert(index>=0);const tick=String.fromCharCode(96),a=source.lastIndexOf(tick,index),b=source.indexOf(tick,index);assert(a>=0&&b>a);return source.slice(a+1,b)}
const statements={
 pos:[sql(posSource,'UPDATE stock_balances SET quantity=quantity-?,updated_at=CURRENT_TIMESTAMP WHERE location_id=? AND item_id=? AND company_id=? AND quantity-reserved_quantity>=?'),sql(posSource,"'sale',CASE WHEN changes()=1 THEN ? ELSE NULL END")],
 issue:[sqlLast(issueSource,'UPDATE stock_balances SET quantity=quantity-?,updated_at=CURRENT_TIMESTAMP WHERE location_id=? AND item_id=? AND company_id=? AND quantity-reserved_quantity>=?'),sql(issueLegacySource,"'issue',CASE WHEN changes()=1 AND NOT EXISTS(")]
};
const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=OFF;');
db.exec(table('stock_balances')+table('stock_movements'));
db.exec('CREATE TABLE bakery_material_valuation_balances(company_id TEXT,location_id TEXT,inventory_item_id TEXT,UNIQUE(company_id,location_id,inventory_item_id));');
db.exec(stockGuard.slice(stockGuard.indexOf('CREATE TRIGGER IF NOT EXISTS bakery_prevent_negative_stock')));
function seed(location,item,quantity,reserved,company='company-bakery'){
 db.prepare('INSERT INTO stock_balances(id,company_id,location_id,item_id,quantity,reserved_quantity) VALUES(?,?,?,?,?,?)').run(location+'-'+item,company,location,item,quantity,reserved);
}
seed('office','bread700',10,6);seed('office','flour',10,0);seed('office','bread350',10,7);
seed('other-location','bread700',12,0,'company-other');
let sequence=0;
function stockMove(kind,quantity,location,item){
 const [update,movement]=statements[kind];
 db.prepare(update).run(quantity,location,item,'company-bakery',quantity);
 const id='test-stock-move-'+(++sequence);
 const values=kind==='issue'?
 [id,'company-bakery',item,'company-bakery',location,item,quantity,125,location,'batch-test','employee-test','{}']:
 [id,'company-bakery',item,quantity,location,'order-test','employee-test'];
 db.prepare(movement).run(...values);
}
function moveBatch(lines){
 const oldCount=count();
 db.exec('BEGIN IMMEDIATE');
 try{for(const line of lines)stockMove(...line);db.exec('COMMIT');return true}
 catch(error){db.exec('ROLLBACK');assert.match(String(error),/NOT NULL|constraint/i);assert.equal(count(),oldCount,'Movement must roll back');return false}
}
const count=()=>db.prepare('SELECT COUNT(*) AS n FROM stock_movements').get().n;
const balance=(loc,item)=>db.prepare('SELECT quantity FROM stock_balances WHERE location_id=? AND item_id=?').get(loc,item).quantity;
assert.equal(moveBatch([['pos',4,'office','bread700']]),true);
assert.equal(balance('office','bread700'),6);
assert.equal(moveBatch([['pos',1,'office','bread700']]),false);
assert.equal(balance('office','bread700'),6);
assert.equal(moveBatch([['issue',4,'office','flour']]),true);
assert.equal(balance('office','flour'),6);
assert.equal(moveBatch([['issue',7,'office','flour']]),false);
assert.equal(balance('office','flour'),6);
assert.equal(moveBatch([['pos',1,'other-location','bread700']]),false);
assert.equal(balance('other-location','bread700'),12);
const before=count();
assert.equal(moveBatch([['issue',5,'office','flour'],['issue',5,'office','flour']]),false);
assert.equal(balance('office','flour'),6);
assert.equal(count(),before);
// A legacy production issue must fail once a financial valuation exists.
db.prepare('INSERT INTO bakery_material_valuation_balances(company_id,location_id,inventory_item_id) VALUES(?,?,?)').run('company-bakery','office','flour');
const valuedIssueCount=count(),valuedIssueStock=balance('office','flour');
assert.equal(moveBatch([['issue',1,'office','flour']]),false,'Legacy issue cannot bypass an approved material valuation');
assert.equal(count(),valuedIssueCount);
assert.equal(balance('office','flour'),valuedIssueStock);
db.close();
console.log('PASS actual Bakery SQL: cash sale and ingredient stock movements require successful deduction');
console.log('PASS dispatch stock movements are separately tested with D1 migration 0115 in test-bakery-dispatch-custody-lock.mjs');
console.log('PASS fail-closed SQLite transaction rollback: reserved stock, missing stock, wrong company, and multi-line stale stock');
