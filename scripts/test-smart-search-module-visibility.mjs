import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../worker/smart-search.ts', import.meta.url), 'utf8');
const executable = source.replace(
  "import{hasPermission,type AuthEnv,type SessionContext}from'./auth';",
  "const hasPermission=(context,code,minimum='view',companyId)=>{const levels=['none','view','create','edit','approve','manage'];const level=companyId?(context.companyPermissions?.[companyId]?.[code]||'none'):(context.permissions?.[code]||'none');return levels.indexOf(level)>=levels.indexOf(minimum)};"
);
const compiled = ts.transpileModule(executable, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { routeSmartSearch } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function fixture({ owner = false, companyPermissions = {} } = {}) {
  const calls = [];
  const context = {
    roles: owner ? [{ code: 'owner' }] : [{ code: 'employee' }],
    companies: owner ? [] : [{ id: 'company-a' }, { id: 'company-b' }],
    companyPermissions,
    permissions: {}
  };
  const env = { DB: { prepare(sql) { calls.push(sql); return { bind() { return { all: async () => ({ results: [] }) }; } }; } } };
  return { context, env, calls };
}

const noPayroll = fixture({ companyPermissions: { 'company-a': { 'hr.access': 'edit' }, 'company-b': { 'payroll.access': 'none' } } });
const deniedResponse = await routeSmartSearch(new Request('https://staffportal.test/api/search/suggest?q=payroll'), noPayroll.env, noPayroll.context);
const deniedSuggestions = (await deniedResponse.json()).suggestions;
assert.equal(deniedSuggestions.some(item => item.type === 'module' && item.command === 'payroll'), false, 'Company A HR access must not reveal the Payroll module when neither company grants Payroll access');
assert.equal(deniedSuggestions.some(item => item.type === 'module' && item.command === 'payroll-payments'), false, 'Payroll Payments must follow target-company Payroll visibility');
assert.equal(deniedSuggestions.some(item => item.type === 'payroll'), false, 'Payroll record suggestions remain permission scoped');
console.log('PASS unauthorized Payroll module names are hidden');

const allowed = fixture({ companyPermissions: { 'company-a': { 'hr.access': 'edit' }, 'company-b': { 'payroll.access': 'view' } } });
const allowedResponse = await routeSmartSearch(new Request('https://staffportal.test/api/search/suggest?q=payroll'), allowed.env, allowed.context);
const allowedSuggestions = (await allowedResponse.json()).suggestions;
assert.equal(allowedSuggestions.some(item => item.type === 'module' && item.command === 'payroll'), true, 'Payroll module should be visible when Company B grants Payroll view');
assert.equal(allowedSuggestions.some(item => item.type === 'module' && item.command === 'payroll-payments'), true, 'Payroll Payments should be visible when Company B grants Payroll view');
console.log('PASS authorized Company B Payroll module suggestions remain available');

const owner = fixture({ owner: true });
const ownerResponse = await routeSmartSearch(new Request('https://staffportal.test/api/search/suggest?q=finance'), owner.env, owner.context);
assert.equal((await ownerResponse.json()).suggestions.some(item => item.type === 'module' && item.command === 'finance'), true, 'Owner retains group-wide module visibility');
console.log('PASS Owner retains group-wide module suggestions');
