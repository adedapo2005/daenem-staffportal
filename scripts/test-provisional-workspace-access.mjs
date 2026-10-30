import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

function load(relative, requireFn=()=>{throw Error('Unexpected import');}) {
  const source=readFileSync(new URL(relative,import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  const module={exports:{}};
  new Function('module','exports','require',compiled)(module,module.exports,requireFn);
  return module.exports;
}
const auth=load('../worker/auth.ts');
const issue=load('../worker/provisional-workspace-session.ts', name=>{
  assert.equal(name,'./auth');
  return auth;
});
const enhanced=load('../worker/auth-context-v2.ts',name=>{
  assert.equal(name,'./auth');
  return auth;
});
const core=readFileSync(new URL('../migrations/0001_core.sql',import.meta.url),'utf8');
const identity=readFileSync(new URL('../migrations/0002_identity_auth.sql',import.meta.url),'utf8');
function ddl(source,name){
  const found=source.match(new RegExp('CREATE TABLE IF NOT EXISTS '+name+'\\s*\\([\\s\\S]*?\\);','i'));
  assert.ok(found,'DDL missing '+name);
  return found[0];
}
class D1{
  constructor(){
    this.db=new DatabaseSync(':memory:');
    this.db.exec('PRAGMA foreign_keys=ON');
    for(const name of ['companies','company_locations','employees','employee_company_memberships','roles',
      'employee_roles','permissions','role_permissions','employee_permission_overrides',
      'auth_sessions','security_logs']){
      this.db.exec(ddl(core,name));
    }
    for(const name of ['signup_requests','app_settings','employee_preferences']){
      this.db.exec(ddl(identity,name));
    }
    this.db.exec(`CREATE TABLE employee_permission_overrides_v2(
      id TEXT PRIMARY KEY,employee_id TEXT,company_id TEXT,permission_id TEXT,
      access_level TEXT,expires_at TEXT);
    `);
    this.db.exec(`
      INSERT INTO companies(id,code,name,business_type,active)
        VALUES('company-printing','PRINT','Synthetic Printing','printing',1);
      INSERT INTO employees(id,display_name,email,employment_status)
        VALUES('employee-new','New Applicant','new@example.test','provisional');
      INSERT INTO employee_company_memberships(id,employee_id,company_id,is_primary,active)
        VALUES('membership-new','employee-new','company-printing',1,1);
      INSERT INTO roles(id,code,name,is_system,active)
        VALUES('role-provisional','provisional','Provisional Employee',1,1);
      INSERT INTO roles(id,code,name,is_system,active)
        VALUES('role-manager','manager','Payroll Manager',0,1);
      INSERT INTO employee_roles(id,employee_id,company_id,role_id)
        VALUES('employee-role-prov','employee-new','company-printing','role-provisional');
      INSERT INTO employee_roles(id,employee_id,company_id,role_id)
        VALUES('employee-role-manager','employee-new','company-printing','role-manager');
      INSERT INTO permissions(id,code,module,action,sensitive)
        VALUES('perm-profile','profile.access','profile','access',0);
      INSERT INTO permissions(id,code,module,action,sensitive)
        VALUES('perm-payroll','payroll.access','payroll','access',1);
      INSERT INTO role_permissions(id,role_id,permission_id,access_level)
        VALUES('rp-profile','role-provisional','perm-profile','edit');
      INSERT INTO role_permissions(id,role_id,permission_id,access_level)
        VALUES('rp-payroll','role-manager','perm-payroll','manage');
      INSERT INTO employee_permission_overrides(id,employee_id,company_id,permission_id,access_level)
        VALUES('extra-payroll','employee-new','company-printing','perm-payroll','manage');
      INSERT INTO employee_permission_overrides_v2(
        id,employee_id,company_id,permission_id,access_level)
        VALUES('extra-payroll-v2','employee-new','company-printing','perm-payroll','manage');
      INSERT INTO signup_requests(id,employee_id,requested_company_id,requested_role_text,status)
        VALUES('application-new','employee-new','company-printing','Local Applicant','pending');
      INSERT INTO app_settings(setting_key,setting_value)
        VALUES('security.session_hours','12');
    `);
    this.env={DB:this,AUTH_PEPPER:'synthetic-secure-pepper',APP_STAGE:'staging',APP_NAME:'StaffPortal Test'};
  }
  prepare(sql){return new Statement(this,sql);}
  async batch(items){
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result=items.map(item=>{
        const statement=this.db.prepare(item.sql);
        if(statement.reader){
          statement.get(...item.values);
          return {meta:{changes:0}};
        }
        return {meta:{changes:Number(statement.run(...item.values).changes)}};
      });
      this.db.exec('COMMIT');
      return result;
    }catch(error){this.db.exec('ROLLBACK');throw error}
  }
  count(table){
    assert.ok(['auth_sessions','security_logs'].includes(table));
    return Number(this.db.prepare('SELECT COUNT(*) AS n FROM '+table).get().n);
  }
  close(){this.db.close();}
}
class Statement {
  constructor(root,sql){this.root=root;this.sql=sql;this.values=[];}
  bind(...v){this.values=v;return this;}
  async first(){return this.root.db.prepare(this.sql).get(...this.values)||null;}
  async all(){return {results:this.root.db.prepare(this.sql).all(...this.values)};}
  async run(){return {meta:{changes:Number(this.root.db.prepare(this.sql).run(...this.values).changes)}};}
}
const request = (cookie='')=>new Request('https://staffportal.test/workspace/',{
  headers:{cookie,'cf-connecting-ip':'203.0.113.33','user-agent':'Synthetic Applicant'},
});
const tests=[];
async function check(name,fn){await fn();tests.push(name);console.log('PASS '+name);}

await check('Verified local applicant receives authenticated provisional session',async()=>{
  const db=new D1();
  const limited=await issue.createProvisionalWorkspaceSession(request(),db.env,'employee-new','local');
  assert.ok(limited);
  assert.equal(limited.next,'/workspace/');
  assert.match(limited.cookie,/HttpOnly/);
  assert.match(limited.cookie,/Secure/);
  assert.equal(db.count('auth_sessions'),1);
  assert.equal(db.count('security_logs'),1);
  const context=await auth.getSessionContext(request(limited.cookie.split(';')[0]),db.env);
  assert.ok(context);
  assert.equal(context.employee.status,'provisional');
  assert.equal(context.roles.length,1);
  assert.equal(context.roles[0].id,'role-provisional');
  assert.equal(auth.hasPermission(context,'profile.access','edit'),true);
  assert.equal(auth.hasPermission(context,'payroll.access','view'),false);
  assert.equal(context.permissions['payroll.access'],undefined);
  const enhancedCtx=await enhanced.getEnhancedSessionContext(request(limited.cookie.split(';')[0]),db.env);
  assert.ok(enhancedCtx);
  assert.equal(enhanced.hasCompanyPermission(enhancedCtx,'company-printing','payroll.access'),false);
  db.close();
});
await check('Verified WhatsApp-assisted applicant receives the same provisional role',async()=>{
  const db=new D1();
  const limited=await issue.createProvisionalWorkspaceSession(request(),db.env,'employee-new','whatsapp');
  assert.ok(limited);
  assert.match(limited.cookie,/SameSite=Lax/);
  const record=db.db.prepare("SELECT details_json FROM security_logs WHERE event_type='provisional_workspace_session'").get();
  assert.equal(JSON.parse(record.details_json).method,'whatsapp');
  const ctx=await auth.getSessionContext(request(limited.cookie.split(';')[0]),db.env);
  assert.equal(ctx.roles[0].code,'provisional');
  db.close();
});
await check('Management approval replaces provisional permissions with assigned role',async()=>{
  const db=new D1();
  const limited=await issue.createProvisionalWorkspaceSession(request(),db.env,'employee-new','google');
  assert.ok(limited);
  const cookie=limited.cookie.split(';')[0];
  db.db.exec(`
    UPDATE signup_requests SET status='approved';
    UPDATE employees SET employment_status='active';
    DELETE FROM employee_roles WHERE role_id='role-provisional';
  `);
  const ctx=await auth.getSessionContext(request(cookie),db.env);
  assert.ok(ctx);
  assert.equal(ctx.employee.status,'active');
  assert.equal(auth.hasPermission(ctx,'payroll.access','manage'),true);
  db.close();
});
await check('Rejecting an applicant revokes access through an existing session immediately',async()=>{
  const db=new D1();
  const limited=await issue.createProvisionalWorkspaceSession(request(),db.env,'employee-new','microsoft');
  assert.ok(limited);
  const cookie=limited.cookie.split(';')[0];
  db.db.exec("UPDATE signup_requests SET status='rejected'");
  assert.equal(await auth.getSessionContext(request(cookie),db.env),null);
  assert.equal(await issue.createProvisionalWorkspaceSession(request(),db.env,'employee-new','microsoft'),null);
  db.close();
});
await check('Removed provisional Profile Edit permission blocks new provisional sessions',async()=>{
  const db=new D1();
  db.db.exec("DELETE FROM role_permissions WHERE role_id='role-provisional'");
  assert.equal(await issue.createProvisionalWorkspaceSession(request(),db.env,'employee-new','local'),null);
  assert.equal(db.count('auth_sessions'),0);
  db.close();
});
await check('Individual explicit denial of Profile Edit is honored',async()=>{
  const db=new D1();
  db.db.exec(`INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level)
    VALUES('deny-profile','employee-new','company-printing','perm-profile','none')`);
  const limited=await issue.createProvisionalWorkspaceSession(request(),db.env,'employee-new','google');
  assert.equal(limited,null);
  assert.equal(db.count('auth_sessions'),0);
  db.close();
});
await check('Revoking Profile Edit invalidates an existing provisional session',async()=>{
  const db=new D1();
  const limited=await issue.createProvisionalWorkspaceSession(request(),db.env,'employee-new','google');
  assert.ok(limited);
  db.db.exec(`INSERT INTO employee_permission_overrides_v2(id,employee_id,company_id,permission_id,access_level)
    VALUES('deny-profile','employee-new','company-printing','perm-profile','none')`);
  const ctx=await auth.getSessionContext(request(limited.cookie.split(';')[0]),db.env);
  assert.equal(ctx,null);
  db.close();
});
await check('Mandatory security audit failure rolls back session creation',async()=>{
  const db=new D1();
  db.db.exec("CREATE TRIGGER reject_auth_audit BEFORE INSERT ON security_logs BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;");
  const limited=await issue.createProvisionalWorkspaceSession(request(),db.env,'employee-new','google');
  assert.equal(limited,null);
  assert.equal(db.count('auth_sessions'),0);
  assert.equal(db.count('security_logs'),0);
  db.close();
});
await check('Silently ignored audit write rolls back session creation',async()=>{
  const db=new D1();
  db.db.exec("CREATE TRIGGER silent_audit BEFORE INSERT ON security_logs BEGIN SELECT RAISE(IGNORE); END;");
  const limited=await issue.createProvisionalWorkspaceSession(request(),db.env,'employee-new','google');
  assert.equal(limited,null);
  assert.equal(db.count('auth_sessions'),0);
  db.close();
});
console.log(JSON.stringify({ok:true,passed:tests.length,tests}));
