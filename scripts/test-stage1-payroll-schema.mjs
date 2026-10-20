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
  ? { hasPermission: (context, permission, action, companyId) =>
      context.companyPermissions[companyId]?.[permission] === 'view' }
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

const insert = db.prepare(`INSERT INTO payroll_runs
(id,company_id,period_start,period_end,status,prepared_by)
VALUES (?,?,?,?,?,?)`);
insert.run('printing-sept', 'printing', '2026-09-01', '2026-09-30','approved','preparer-1');
insert.run('bakery-sept', 'bakery', '2026-09-01', '2026-09-30','draft','preparer-2');

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
