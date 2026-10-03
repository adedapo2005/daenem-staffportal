import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../worker/bakery-accountability.ts', import.meta.url), 'utf8');
const executable = source.replace(
  "import { hasPermission, type AuthEnv, type SessionContext } from './auth';",
  "const hasPermission=(context,code,minimum='view',companyId)=>{const levels=['none','view','create','edit','approve','manage'];const level=companyId?(context.companyPermissions?.[companyId]?.[code]||'none'):(context.permissions?.[code]||'none');return levels.indexOf(level)>=levels.indexOf(minimum)};"
);
const compiled = ts.transpileModule(executable, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { routeBakeryAccountability } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const flourRow = { inventoryItemId: 'flour-a', sku: 'FLOUR-01', name: 'Wheat Flour', unit: 'kg', bagWeightKg: 50, plannedQuantity: 100, usedQuantity: 90, wasteQuantity: 5, usageCostKobo: 12345, batchCount: 2 };
const makeEnv = () => {
  const queries = [];
  const env = { DB: { prepare(sql) {
    const statement = { sql, args: [], bind(...args) { this.args = args; queries.push(this); return this; },
      all: async () => ({ results: sql.includes('FROM bakery_batch_ingredients') ? [flourRow] : [] }),
      run: async () => ({ success: true }) };
    return statement;
  } } };
  return { env, queries };
};
const contextFor = permissions => ({ employee: { id: 'employee-a' }, companies: [{ id: 'company-bakery' }], permissions: {}, companyPermissions: { 'company-bakery': permissions }, roles: [] });
const reportRequest = section => new Request(`https://staffportal.test/api/bakery/accountability/reports${section ? `?section=${section}` : ''}`);
const exportRequest = () => new Request('https://staffportal.test/api/bakery/accountability/reports/export?section=flour');

// Reconciliation access alone must neither select nor disclose the dedicated flour projection.
{
  const { env, queries } = makeEnv();
  const reconOnly = contextFor({ 'bakery.reconciliation': 'view' });
  const combined = await routeBakeryAccountability(reportRequest(), env, reconOnly);
  const payload = await combined.json();
  assert.equal(combined.status, 200);
  assert.equal(payload.capabilities.flour, false);
  assert.equal(Object.hasOwn(payload, 'flourUsage'), false, 'combined reports omit flour rows for reconciliation-only users');
  assert.equal(queries.some(query => query.sql.includes('FROM bakery_batch_ingredients')), false, 'flour data is not queried without flour_control');

  const queriesBeforeExplicitRequests = queries.length;
  const reportDenied = await routeBakeryAccountability(reportRequest('flour'), env, reconOnly);
  assert.equal(reportDenied.status, 404, 'explicit flour JSON request receives neutral denial');
  assert.deepEqual(await reportDenied.json(), { error: 'Report not found.' });
  const exportDenied = await routeBakeryAccountability(exportRequest(), env, reconOnly);
  assert.equal(exportDenied.status, 404, 'flour export receives neutral denial');
  assert.deepEqual(await exportDenied.json(), { error: 'Report not found.' });
  assert.equal(queries.some(query => query.sql.includes('FROM bakery_batch_ingredients')), false, 'denied report and export run no flour query');
  assert.equal(queries.length, queriesBeforeExplicitRequests, 'explicitly denied report/export run no database queries');
}

for (const [label, permissions] of [
  ['authorized Bakery persona', { 'bakery.reconciliation': 'view', 'bakery.flour_control': 'view' }],
  ['Owner authority', { 'bakery.reconciliation': 'view', 'bakery.flour_control': 'manage' }]
]) {
  const { env, queries } = makeEnv();
  const context = contextFor(permissions);
  const report = await routeBakeryAccountability(reportRequest('flour'), env, context);
  const payload = await report.json();
  assert.equal(report.status, 200, `${label}: flour JSON report succeeds`);
  assert.equal(payload.capabilities.flour, true);
  assert.equal(payload.flourUsage[0].name, 'Wheat Flour');
  const flourQuery = queries.find(query => query.sql.includes('FROM bakery_batch_ingredients'));
  assert.ok(flourQuery, `${label}: authorized flour query runs`);
  assert.equal(flourQuery.args[0], 'company-bakery', `${label}: flour query is target-company scoped`);

  const { env: exportEnv, queries: exportQueries } = makeEnv();
  const csv = await routeBakeryAccountability(exportRequest(), exportEnv, context);
  const csvBody = await csv.text();
  assert.equal(csv.status, 200, `${label}: flour CSV succeeds`);
  assert.match(csvBody, /Wheat Flour/);
  assert.match(csvBody, /variance/i);
  assert.equal(exportQueries.find(query => query.sql.includes('FROM bakery_batch_ingredients'))?.args[0], 'company-bakery', `${label}: CSV source query is target-company scoped`);
  assert.ok(exportQueries.some(query => query.sql.includes("'export_report'")), `${label}: export is formally audited before response`);
}

console.log('Bakery flour report/export target-company authorization: PASS 30/30');
