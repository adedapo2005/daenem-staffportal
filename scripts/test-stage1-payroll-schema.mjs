import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const worker = readFileSync(new URL('../worker/smart-search.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(worker, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022
}}).outputText;
const mod = {};
const localRequire = (name) => name === './auth'
  ? { hasPermission: (context, permission, action, companyId) => {
      const levels=['none','view','create','edit','approve','manage'];
      return levels.indexOf(context.companyPermissions[companyId]?.[permission] || 'none') >= levels.indexOf(action);
    }}
  : createRequire(import.meta.url)(name);
new Function('require','exports',js)(localRequire, mod);

function createSchema(database, name, migration) {
  const sql = readFileSync(new URL('../migrations/' + migration, import.meta.url), 'utf8');
  const needle = 'CREATE TABLE IF NOT EXISTS ' + name + ' (';
  const index = sql.indexOf(needle);
  assert.notEqual(index, -1, 'Migration must define ' + name);
  const tail = sql.slice(index);
  const end = tail.search(/^\);/m);
  assert.ok(end !== -1, 'CREATE TABLE must be terminated');
  database.exec(tail.slice(0,end+2));
}
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=OFF');
createSchema(db, 'payroll_runs', '0001_core.sql');
createSchema(db, 'leave_requests', '0021_employee_self_service.sql');
createSchema(db, 'employee_document_requests', '0021_employee_self_service.sql');
createSchema(db, 'workflow_forms', '0008_forms_broadcasts_smart.sql');
createSchema(db, 'workflow_form_assignments', '0008_forms_broadcasts_smart.sql');
createSchema(db, 'workflow_form_submissions', '0008_forms_broadcasts_smart.sql');
createSchema(db, 'employee_notifications', '0021_employee_self_service.sql');


const insert = db.prepare(`INSERT INTO payroll_runs
(id,company_id,period_start,period_end,status,prepared_by)
VALUES (?,?,?,?,?,?)`);
insert.run('printing-sept', 'printing', '2026-09-01', '2026-09-30','approved','preparer-1');
insert.run('bakery-sept', 'bakery', '2026-09-01', '2026-09-30','draft','preparer-2');

// Genuine migrated workflow tables: no mock D1 query results or widened access.
const insertForm = db.prepare(`INSERT INTO workflow_forms
  (id,company_id,title,schema_json,created_by) VALUES (?,?,?,?,?)`);
insertForm.run('form-print', 'printing', 'Safety Inspection', '[]', 'supervisor');
insertForm.run('form-bakery', 'bakery', 'Safety Inspection', '[]', 'supervisor');
const insertAssignment = db.prepare(`INSERT INTO workflow_form_assignments
  (id,form_id,company_id,employee_id,audience_type,assigned_by) VALUES (?,?,?,?,?,?)`);
insertAssignment.run('assign-print','form-print','printing','employee-qa','employee','supervisor');
insertAssignment.run('assign-bakery','form-bakery','bakery','employee-qa','employee','supervisor');
insertAssignment.run('assign-other','form-print','printing','employee-other','employee','supervisor');
const insertSubmission = db.prepare(`INSERT INTO workflow_form_submissions
  (id,assignment_id,form_id,employee_id,company_id,status,response_json)
  VALUES (?,?,?,?,?,?,?)`);
insertSubmission.run('submission-print','assign-print','form-print','employee-qa','printing','submitted','{"private_answer":"secret"}');
insertSubmission.run('submission-bakery','assign-bakery','form-bakery','employee-qa','bakery','submitted','{}');
insertSubmission.run('submission-other','assign-other','form-print','employee-other','printing','submitted','{}');
const insertNotification = db.prepare(`INSERT INTO employee_notifications
  (id,employee_id,company_id,category,severity,title,body,expires_at)
  VALUES (?,?,?,?,?,?,?,?)`);
insertNotification.run('notice-print','employee-qa','printing','general','info','QA notice printing','private text',null);
insertNotification.run('notice-bakery','employee-qa','bakery','general','info','QA notice bakery','private text',null);
insertNotification.run('notice-group','employee-qa',null,'general','info','QA notice group','private text',null);
insertNotification.run('notice-other','employee-other','printing','general','info','QA notice other','private text',null);
insertNotification.run('notice-expired','employee-qa','printing','general','info','QA notice expired','private text','2020-01-01 00:00:00');

const env = {
  DB: {
    prepare(sql) {
      return { bind(...args) {
        return { async all() {
          return { results: db.prepare(sql).all(...args) };
        }};
      }};
    }
  }
};
function context(company, canPayroll) {
  return {
    employee: { id: 'employee-qa' },
    companies: [{ id: company }],
    roles: [{ code: 'employee' }],
    companyPermissions: { [company]: canPayroll ? { 'payroll.access': 'view' } : {} }
  };
}
async function search(q, session) {
  const req = new Request('https://staffportal.invalid/api/search/suggest?q='+encodeURIComponent(q));
  const res = await mod.routeSmartSearch(req, env, session);
  assert.equal(res.status, 200);
  return res.json();
}
test('Payroll uses migrated schema, returns only company-authorized period records', async () => {
  const result = await search('2026-09', context('printing',true));
  assert.deepEqual(result.sources.find(x=>x.name==='Payroll'),{name:'Payroll',status:'checked'});
  const hits = result.suggestions.filter(x=>x.type==='payroll');
  assert.equal(hits.length,1);
  assert.equal(hits[0].entityId,'printing-sept');
  assert.match(hits[0].label,/2026-09-01/);
  assert.equal(JSON.stringify(result).includes('bakery-sept'),false);
  assert.equal(result.partial,false);
});
test('An employee cannot see another company payroll run', async () => {
  const result = await search('2026-09', context('bakery',true));
  const hits = result.suggestions.filter(x=>x.type==='payroll');
  assert.deepEqual(hits.map(x=>x.entityId),['bakery-sept']);
});
test('Payroll data is inaccessible without payroll permission', async () => {
  const result = await search('2026-09', context('printing',false));
  assert.equal(result.suggestions.some(x=>x.type==='payroll'),false);
  assert.equal(result.sources.some(x=>x.name==='Payroll'),false);
});
test('Payroll status search does not reveal pay amounts or missing-column errors', async () => {
  const result = await search('approved', context('printing',true));
  assert.equal(result.partial,false);
  assert.deepEqual(result.suggestions.filter(x=>x.type==='payroll').map(x=>x.entityId),['printing-sept']);
  assert.equal(JSON.stringify(result).includes('gross_total_kobo'),false);
});

test('Personal Forms search returns only current employee submissions from a permitted company', async () => {
  const ctx = context('printing',true);
  ctx.companyPermissions.printing['forms.access'] = 'view';
  const result = await search('safety',ctx);
  assert.deepEqual(result.sources.find(x=>x.name==='My form submissions'),
    {name:'My form submissions',status:'checked'});
  const forms = result.suggestions.filter(x=>x.type==='form-submission');
  assert.deepEqual(forms.map(x=>x.entityId),['submission-print']);
  assert.equal(forms[0].label,'Safety Inspection');
  assert.equal(JSON.stringify(result).includes('private_answer'),false);
  assert.equal(JSON.stringify(result).includes('submission-bakery'),false);
  assert.equal(JSON.stringify(result).includes('submission-other'),false);
  assert.equal(result.partial,false);
});

test('Forms records disappear when Forms access is revoked', async () => {
  const result = await search('safety',context('printing',true));
  assert.equal(result.suggestions.some(x=>x.type==='form-submission'),false);
  assert.equal(result.sources.some(x=>x.name==='My form submissions'),false);
});

test('Notifications show only the recipient and the session company plus personal notices',async () => {
  const result = await search('qa notice', context('printing',false));
  const notices = result.suggestions.filter(x=>x.type==='notification').map(x=>x.entityId).sort();
  assert.deepEqual(notices,['notice-group','notice-print']);
  assert.deepEqual(result.sources.find(x=>x.name==='My notifications'),
    {name:'My notifications',status:'checked'});
  assert.equal(JSON.stringify(result).includes('private text'),false);
  assert.equal(result.partial,false);
});

test('A session in a different company cannot search previous company notices',async () => {
  const result = await search('qa notice', context('bakery',false));
  const notices = result.suggestions.filter(x=>x.type==='notification').map(x=>x.entityId).sort();
  assert.deepEqual(notices,['notice-bakery','notice-group']);
});

test('Personal notifications remain searchable without any active company membership',async () => {
  const ctx=context('printing',false);ctx.companies=[];ctx.companyPermissions={};
  const result=await search('qa notice',ctx);
  assert.deepEqual(result.suggestions.filter(x=>x.type==='notification').map(x=>x.entityId),['notice-group']);
});

test('Owner multi-company session cannot search a second company without its payroll grant', async () => {
  const ctx=context('printing',false);
  ctx.roles=[{id:'role-owner-print',code:'owner',companyId:'printing'}];
  ctx.companies=[{id:'printing'},{id:'bakery'}];
  ctx.companyPermissions={
    printing:{'payroll.access':'manage'},
    bakery:{'payroll.access':'none'},
  };
  const result=await search('2026-09',ctx);
  const records=result.suggestions.filter(item=>item.type==='payroll');
  assert.deepEqual(records.map(item=>item.entityId),['printing-sept']);
  assert.equal(JSON.stringify(result).includes('bakery-sept'),false);
  assert.equal(result.partial,false);
});

test('Owner with an explicitly revoked company grant cannot query that company at all', async () => {
  const ctx=context('printing',false);
  ctx.roles=[{id:'role-owner-print',code:'owner',companyId:'printing'}];
  ctx.companyPermissions.printing['payroll.access']='none';
  const result=await search('approved',ctx);
  assert.equal(result.suggestions.some(item=>item.type==='payroll'),false);
  assert.equal(result.sources.some(source=>source.name==='Payroll'),false);
});
