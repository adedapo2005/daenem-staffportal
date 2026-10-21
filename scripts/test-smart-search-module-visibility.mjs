import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../worker/smart-search.ts', import.meta.url), 'utf8');
const executable = source.replace(
  /import\s*\{\s*hasPermission\s*,\s*type\s+AuthEnv\s*,\s*type\s+SessionContext\s*\}\s*from\s*['"]\.\/auth['"];?/,
  "const hasPermission=(context,code,minimum='view',companyId)=>{const levels=['none','view','create','edit','approve','manage'];const level=companyId?(context.companyPermissions?.[companyId]?.[code]||'none'):(context.permissions?.[code]||'none');return levels.indexOf(level)>=levels.indexOf(minimum)};"
);
assert.equal(executable.includes("from './auth'"), false, 'test harness must replace the Worker auth import before data-URL execution');

const compiled = ts.transpileModule(executable, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { routeSmartSearch } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function fixture({ companies = [{ id: 'company-a' }, { id: 'company-b' }], companyPermissions = {}, roles = [{ code: 'employee' }] } = {}) {
  const calls = [];
  const context = {
    roles,
    companies,
    companyPermissions,
    permissions: {},
    employee: { id: 'actor' },
  };
  const env = { DB: { prepare(sql) { calls.push(sql); return { bind() { return { all: async () => ({ results: [] }) }; } }; } } };
  return { context, env, calls };
}

const noPayroll = fixture({ companyPermissions: { 'company-a': { 'hr.access': 'edit' }, 'company-b': { 'payroll.access': 'none' } } });
const deniedResponse = await routeSmartSearch(new Request('https://staffportal.test/api/search/suggest?q=payroll'), noPayroll.env, noPayroll.context);
const deniedSuggestions = (await deniedResponse.json()).suggestions;
assert.equal(deniedSuggestions.some(item => item.type === 'module' && item.command === 'payroll'), false, 'Company A HR access must not reveal Payroll when neither company grants Payroll access');
assert.equal(deniedSuggestions.some(item => item.type === 'module' && item.command === 'payroll-payments'), false, 'Payroll Payments must follow target-company Payroll visibility');
assert.equal(deniedSuggestions.some(item => item.type === 'payroll'), false, 'Payroll record suggestions remain permission scoped');
console.log('PASS unauthorized Payroll module names are hidden');

const allowed = fixture({ companyPermissions: { 'company-a': { 'hr.access': 'edit' }, 'company-b': { 'payroll.access': 'view' } } });
const allowedResponse = await routeSmartSearch(new Request('https://staffportal.test/api/search/suggest?q=payroll'), allowed.env, allowed.context);
const allowedSuggestions = (await allowedResponse.json()).suggestions;
assert.equal(allowedSuggestions.some(item => item.type === 'module' && item.command === 'payroll'), true, 'Payroll module should be visible when Company B grants Payroll view');
assert.equal(allowedSuggestions.some(item => item.type === 'module' && item.command === 'payroll-payments'), true, 'Payroll Payments should be visible when Company B grants Payroll view');
console.log('PASS authorized Company B Payroll module suggestions remain available');

const ownerDenied = fixture({ roles: [{ code: 'owner' }], companyPermissions: { 'company-a': { 'finance.access': 'none' }, 'company-b': { 'finance.access': 'none' } } });
const ownerDeniedResponse = await routeSmartSearch(new Request('https://staffportal.test/api/search/suggest?q=finance'), ownerDenied.env, ownerDenied.context);
assert.equal((await ownerDeniedResponse.json()).suggestions.some(item => item.type === 'module' && item.command === 'finance'), false, 'Owner role must not bypass explicit company-level Finance revocation');
console.log('PASS Owner does not bypass explicit company revocation');

const ownerAllowed = fixture({ roles: [{ code: 'owner' }], companyPermissions: { 'company-a': { 'finance.access': 'manage' }, 'company-b': { 'finance.access': 'none' } } });
const ownerAllowedResponse = await routeSmartSearch(new Request('https://staffportal.test/api/search/suggest?q=finance'), ownerAllowed.env, ownerAllowed.context);
assert.equal((await ownerAllowedResponse.json()).suggestions.some(item => item.type === 'module' && item.command === 'finance'), true, 'Owner with explicit company Finance grant retains Finance search');
console.log('PASS Owner with explicit company grant retains authorized module suggestions');
