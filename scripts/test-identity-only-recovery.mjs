import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';

const compilation=await build({
  entryPoints:['worker/recovery-company-resolution.ts'],
  bundle:true,platform:'node',format:'esm',target:'es2022',write:false,logLevel:'silent',
});
const uri='data:text/javascript;base64,'+
  Buffer.from(compilation.outputFiles[0].contents).toString('base64');
const {resolveRecoveryCompanyForIdentifier}=await import(uri);
const db=new DatabaseSync(':memory:');
db.exec([
  "CREATE TABLE companies (id TEXT PRIMARY KEY,code TEXT,name TEXT,active INTEGER DEFAULT 1);",
  "CREATE TABLE employees (id TEXT PRIMARY KEY,email TEXT,employment_status TEXT);",
  "CREATE TABLE employee_credentials (employee_id TEXT PRIMARY KEY,username TEXT);",
  "CREATE TABLE employee_company_memberships (id TEXT PRIMARY KEY,employee_id TEXT,company_id TEXT,is_primary INTEGER,active INTEGER DEFAULT 1);",
  "CREATE TABLE admin_scoped_settings (setting_key TEXT,scope_type TEXT,scope_id TEXT,setting_value TEXT,value_type TEXT,PRIMARY KEY(setting_key,scope_type,scope_id));",
  "INSERT INTO employees VALUES ('emp-a','ada@staff.example','active'),('emp-b','john@staff.example','active'),('emp-c','noaccess@staff.example','suspended');",
  "INSERT INTO employee_credentials VALUES ('emp-a','adaokon'),('emp-b','john123'),('emp-c','suspended');",
  "INSERT INTO companies VALUES ('print','PRINT','Daenem Printing',1),('autos','AUTO','Daenem Autos',1),('closed','CLOSED','Closed Division',0),('farm','FARM','Daenem Farms',1);",
  "INSERT INTO employee_company_memberships VALUES ('ma1','emp-a','print',1,1),('ma2','emp-a','autos',0,1),('mb1','emp-b','print',1,1),('mc1','emp-c','print',1,1);",
  "INSERT INTO admin_scoped_settings VALUES ('security.password_recovery_methods','company','print','email','string'),('security.password_recovery_methods','company','autos','whatsapp','string'),('security.password_recovery_methods','global','__global__','email','string');",
].join('\n'));
const env={DB:{
 prepare(sql){
  const stmt=db.prepare(sql);
  return{bind(...vals){return{
   async first(){return stmt.get(...vals)||null},
   async all(){return {results:stmt.all(...vals)};},
  };}};
 },
}};
let passed=0;
async function check(name,identifier,channel,employeeId,companyId){
 const result=await resolveRecoveryCompanyForIdentifier(env,identifier,channel);
 assert.equal(result?.employeeId||null,employeeId,name+' employee');
 assert.equal(result?.companyId||null,companyId,name+' company');
 passed++;console.log('PASS: '+name);
}
await check('primary employer email','ada@staff.example','email','emp-a','print');
await check('secondary company WhatsApp policy','ada@staff.example','whatsapp','emp-a','autos');
await check('username case insensitive','ADAOKON','email','emp-a','print');
await check('unknown user denied','nobody@example.org','email',null,null);
await check('suspended employee denied','suspended','email',null,null);
db.exec("UPDATE employee_company_memberships SET active=0 WHERE employee_id='emp-a'");
await check('revoked membership denied','adaokon','email',null,null);
db.exec("UPDATE employee_company_memberships SET active=1 WHERE employee_id='emp-a'");
db.exec("UPDATE companies SET active=0 WHERE id='print'");
await check('inactive company denied','adaokon','email',null,null);
await check('alternative active company still approved','adaokon','whatsapp','emp-a','autos');
db.exec("UPDATE companies SET active=1 WHERE id='print'");
db.exec("UPDATE employees SET email='ada@staff.example' WHERE id='emp-b'");
await check('duplicate email denied','ada@staff.example','email',null,null);
db.exec("UPDATE employees SET email='john@staff.example' WHERE id='emp-b'");
db.exec("UPDATE employee_credentials SET username='ada@staff.example' WHERE employee_id='emp-b'");
await check('different username and email collide fail closed','ada@staff.example','email',null,null);
db.exec("UPDATE employee_credentials SET username='john123' WHERE employee_id='emp-b'");
db.exec("UPDATE employee_company_memberships SET company_id='farm' WHERE id='mb1'");
await check('FarmPortal-only user excluded','john123','email',null,null);
db.exec("UPDATE employee_company_memberships SET company_id='print' WHERE id='mb1'");
db.exec("UPDATE admin_scoped_settings SET setting_value='whatsapp' WHERE scope_id='print'");
await check('company policy disables email','john123','email',null,null);
await check('company policy enables WhatsApp','john123','whatsapp','emp-b','print');

const ui=readFileSync('src/auth.tsx','utf-8');
const email=readFileSync('worker/password-auth.ts','utf-8');
const whatsapp=readFileSync('worker/whatsapp-recovery.ts','utf-8');
assert.ok(!ui.includes('className="usp-recovery-company"'),'unexpected company picker');
assert.ok(ui.includes("JSON.stringify({ identifier: recoveryIdentity.trim() })"),'public request must be identity-only');
assert.ok(ui.includes('minimumLength: Math.max(6,'),'approved minimum is respected');
assert.ok(email.includes("resolveRecoveryCompanyForIdentifier(\n    env, identifier, 'email'"));
assert.ok(whatsapp.includes("resolveRecoveryCompanyForIdentifier(\n    env, identifier, 'whatsapp'"));
passed++;console.log('PASS: frontend and backend identity-only security contract');
db.close();
console.log('STAFFPORTAL_RECOVERY_AUTH_ALIGNMENT_PASS '+passed+'/'+passed);
await import('./test-recovery-attempt-guard.mjs');
