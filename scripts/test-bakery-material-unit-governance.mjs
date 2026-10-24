// Real Bakery unit endpoints and migration against isolated SQLite; no Cloudflare mutations.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const sql=fs.readFileSync(new URL('../migrations/0106_bakery_material_unit_rules.sql',import.meta.url),'utf8');
const backend=fs.readFileSync(new URL('../worker/bakery-material-units.ts',import.meta.url),'utf8');
const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
db.exec(`
 CREATE TABLE companies(id TEXT PRIMARY KEY);
 CREATE TABLE employees(id TEXT PRIMARY KEY);
 CREATE TABLE inventory_items(id TEXT PRIMARY KEY,company_id TEXT,unit TEXT,active INTEGER,name TEXT);
 CREATE TABLE bakery_recipe_ingredients(id TEXT PRIMARY KEY,recipe_id TEXT,inventory_item_id TEXT,quantity REAL,unit TEXT);
 CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_employee_id TEXT NOT NULL,company_id TEXT NOT NULL,module TEXT NOT NULL,action TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,after_json TEXT,source TEXT);
 INSERT INTO companies VALUES('company-bakery');
 INSERT INTO companies VALUES('company-printing');
 INSERT INTO employees VALUES('proposer');
 INSERT INTO employees VALUES('reviewer');
 INSERT INTO employees VALUES('viewer');
 INSERT INTO inventory_items VALUES('flour','company-bakery','kg',1,'Flour');
 INSERT INTO inventory_items VALUES('yeast','company-bakery','g',1,'Yeast');
 INSERT INTO inventory_items VALUES('other-item','company-printing','kg',1,'Other');
`);
db.exec(sql);
assert(db.prepare('PRAGMA table_info(bakery_recipe_ingredients)').all().some(c=>c.name==='unit_rule_id'));
function statement(query,values=[]){
 return {
  bind(...next){return statement(query,next)},
  async first(){return db.prepare(query).get(...values)||null},
  async all(){return {results:db.prepare(query).all(...values)}},
  async run(){return db.prepare(query).run(...values)},
 };
}
const env={DB:{
 prepare(query){return statement(query)},
 async batch(items){
  db.exec('BEGIN IMMEDIATE');
  try{const result=[];for(const item of items)result.push(await item.run());db.exec('COMMIT');return result}
  catch(error){db.exec('ROLLBACK');throw error}
 }
}};
function permissions(ctx,code,minimum){
 if(code==='bakery.access')return true;
 if(code==='inventory.access')return ctx.level==='reviewer'||(ctx.level==='proposer'&&minimum!=='approve');
 return false;
}
const m={exports:{}},out=ts.transpileModule(backend,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
new vm.Script('(function(require,module,exports){'+out+'\n})').runInNewContext({Request,Response,URL,crypto:webcrypto,console,Intl})(
 name=>{assert.equal(name,'./auth');return {hasPermission:permissions}},m,m.exports
);
const {routeBakeryMaterialUnits,approvedMaterialRule,normalizeBaseQuantity}=m.exports;
function ctx(id,level){
 return {employee:{id},companies:[{id:'company-bakery'}],level};
}
const proposer=ctx('proposer','proposer'),reviewer=ctx('reviewer','reviewer'),viewer=ctx('viewer','viewer');
async function api(endpoint,method,body,context){
 const request=new Request('https://test.invalid/api/bakery/material-units'+endpoint,{
  method,headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined
 });
 const response=await routeBakeryMaterialUnits(request,env,context);
 assert(response instanceof Response);
 return {status:response.status,json:await response.json()};
}
const flour={inventoryItemId:'flour',fromUnit:'bag',factor:50,reason:'Supplier specification confirms 50 kilograms per sealed bag'};
let response=await api('/propose','POST',flour,proposer);
assert.equal(response.status,201,JSON.stringify(response.json));
const firstId=response.json.ruleId;
assert.equal(response.json.versionNo,1);
assert.equal((await api('/propose','POST',flour,proposer)).status,409,'Pending rule must not duplicate');
assert.equal((await api('/review','POST',{ruleId:firstId,decision:'approved',reviewNote:'Original supplier bag label independently verified'},proposer)).status,403,'No self approval');
assert.equal(await approvedMaterialRule(env,'flour','bag','kg'),null,'Pending rules cannot affect stock');
assert.equal((await api('/review','POST',{ruleId:firstId,decision:'approved',reviewNote:'Original supplier bag label independently verified'},reviewer)).status,200);
assert.equal((await api('/review','POST',{ruleId:firstId,decision:'approved',reviewNote:'Duplicate review must not create an audit event'},reviewer)).status,409);
let rule=await approvedMaterialRule(env,'flour','bag','kg');
assert.equal(Number(rule.factor),50);
assert.equal(rule.versionNo,1);
assert.equal(normalizeBaseQuantity(2,rule.factor),100);
const reviewed=await api('','GET',null,viewer);
assert.equal(reviewed.status,200);
assert.equal(reviewed.json.rules.length,1);
assert.equal(reviewed.json.rules[0].status,'approved');
assert.equal(reviewed.json.canPropose,false);
assert.equal((await api('/propose','POST',{...flour,factor:25,reason:'Different pack weight verified by a new supplier specification'},viewer)).status,403);
response=await api('/propose','POST',{...flour,factor:25,reason:'New flour bag label from the supplier is 25 kg'},proposer);
assert.equal(response.status,201);
const secondId=response.json.ruleId;
assert.equal(response.json.versionNo,2);
assert.equal((await api('/review','POST',{ruleId:secondId,decision:'approved',reviewNote:'Verified 25 kg bag specification independently'},reviewer)).status,200);
rule=await approvedMaterialRule(env,'flour','bag','kg');
assert.equal(Number(rule.factor),25,'Latest approved rule governs only new transactions');
assert.equal(db.prepare('SELECT base_quantity_per_input AS f FROM bakery_material_unit_rules WHERE id=?').get(firstId).f,50,'Historical approved factor cannot be rewritten');
assert.throws(()=>db.prepare("UPDATE bakery_material_unit_rules SET base_quantity_per_input=60 WHERE id=?").run(firstId),/immutable/i);
assert.throws(()=>db.prepare('DELETE FROM bakery_material_unit_rules WHERE id=?').run(firstId),/deleted/i);
assert.equal((await api('/propose','POST',{inventoryItemId:'other-item',fromUnit:'carton',factor:12,reason:'Other company carton size example'},proposer)).status,404,'Cross-company items blocked');
assert.equal((await api('/propose','POST',{inventoryItemId:'flour',fromUnit:'kg',factor:1,reason:'Base unit is already kg'},proposer)).status,400,'No identity rules');
assert.equal((await api('/propose','POST',{inventoryItemId:'yeast',fromUnit:'carton',factor:12000,reason:'Manufacturer specifies 12,000 grams per carton'},proposer)).status,201);
assert.equal(normalizeBaseQuantity(0.00000001,1),null,'Unrepresentable quantity rejected');
assert.equal(normalizeBaseQuantity(1,0.001),0.001);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='approve_unit_conversion'").get().n,2);
db.close();
console.log('PASS governed material conversions: independent review, immutable versions, pending isolation, company/permission guard and exact quantities');
