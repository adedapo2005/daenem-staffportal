const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync(':memory:');
db.exec("PRAGMA foreign_keys=ON; CREATE TABLE employees(id TEXT PRIMARY KEY); INSERT INTO employees VALUES('owner');CREATE TABLE app_settings(setting_key TEXT PRIMARY KEY,setting_value TEXT NOT NULL,value_type TEXT,updated_by TEXT REFERENCES employees(id),updated_at TEXT);CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_employee_id TEXT NOT NULL REFERENCES employees(id),module TEXT,action TEXT,entity_type TEXT,entity_id TEXT,after_json TEXT,source TEXT)");
const insert=db.prepare("INSERT INTO app_settings(setting_key,setting_value,value_type,updated_by,updated_at)VALUES(?,?,'json',?,CURRENT_TIMESTAMP) ON CONFLICT(setting_key) DO NOTHING");
const update=db.prepare("UPDATE app_settings SET setting_value=?,value_type='json',updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE setting_key=? AND setting_value=?");
const audit=db.prepare("INSERT INTO audit_logs(id,actor_employee_id,module,action,entity_type,entity_id,after_json,source)SELECT ?,?,'theme','save_signin_design_library','app_setting',?,?,'web' FROM app_settings WHERE setting_key=? AND setting_value=? AND changes()=1");
const key='ui.signin_design_library_v1';
let auditIndex=0;
function batch(mut,args,val,actor='owner'){
 db.exec('BEGIN IMMEDIATE');
 try{
  const a=mut.run(...args);
  const b=audit.run('audit-'+(++auditIndex),actor,key,'{}',key,val);
  if(a.changes===1&&b.changes===1){db.exec('COMMIT');return [a.changes,b.changes];}
  db.exec('ROLLBACK');return [a.changes,b.changes];
 }catch(err){db.exec('ROLLBACK');throw err;}
}
assert.deepEqual(batch(insert,[key,'{"revision":1}','owner'],'{"revision":1}'),[1,1]);
assert.deepEqual(batch(insert,[key,'{"revision":1}','owner'],'{"revision":1}'),[0,0]);
assert.deepEqual(batch(update,['{"revision":2}','owner',key,'{"revision":1}'],'{"revision":2}'),[1,1]);
assert.deepEqual(batch(update,['{"revision":3}','owner',key,'{"revision":0}'],'{"revision":3}'),[0,0]);
assert.throws(()=>batch(update,['{"revision":3}','owner',key,'{"revision":2}'],'{"revision":3}','missing-actor'),/FOREIGN KEY/);
assert.equal(db.prepare('SELECT setting_value FROM app_settings WHERE setting_key=?').get(key).setting_value,'{"revision":2}');
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM audit_logs').get().n,2);
console.log('PASS: SQLite atomic D1-equivalent CAS+audit, rollback on audit failure, no false audits');
db.close();
