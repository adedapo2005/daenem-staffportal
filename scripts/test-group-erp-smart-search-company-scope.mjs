import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../worker/group-erp.ts', import.meta.url), 'utf8');
const executable = source.replace("import { hasPermission, type AuthEnv, type SessionContext } from './auth';", "const hasPermission=(context,code,minimum='view',companyId)=>{const levels=['none','view','create','edit','approve','manage'];const level=companyId?(context.companyPermissions?.[companyId]?.[code]||'none'):(context.permissions?.[code]||'none');return levels.indexOf(level)>=levels.indexOf(minimum)};").replace("import { previewAuditRetention } from './audit-retention';", "const previewAuditRetention=async()=>new Response('{}');");
const compiled = ts.transpileModule(executable, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { routeGroupErp } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function fixture(companyPermissions, rows = []) {
  const calls = [];
  const context = { roles: [{ code: 'employee' }], companies: [{ id: 'company-a' }, { id: 'company-b' }], companyPermissions, permissions: {}, employee: { id: 'actor' } };
  const env = {
    DB: {
      prepare(sql) {
        calls.push(sql);
        return {
          bind(...args) {
            return {
              all: async () => ({
                results: args.includes('company-a') || args.includes('company-b')
                  ? rows.filter((row) => args.includes(row.companyId))
                  : rows,
              }),
            };
          },
        };
      },
    },
  };
  return { context, env, calls };
}

const denied = fixture({ 'company-a': { 'hr.access': 'view' }, 'company-b': { 'hr.access': 'none', 'payroll.access': 'none' } }, [{ companyId: 'company-a', id: 'employee-a', displayName: 'Company A Employee' }, { companyId: 'company-b', id: 'employee-b', displayName: 'Company B Employee' }]);
const deniedResponse = await routeGroupErp(new Request('https://staff.test/api/search/suggest?q=employee'), denied.env, denied.context);
const deniedBody = await deniedResponse.json();
assert.equal(deniedBody.suggestions.some((item) => item.entityId === 'employee-b'), false, 'cross-company employee suggestions remain hidden');
assert.ok(denied.calls.every((sql) => sql.includes('m.company_id IN (?)') || !sql.includes('FROM payroll_runs')), 'employee search carries target-company scope');

const allowed = fixture({ 'company-a': { 'hr.access': 'view' }, 'company-b': { 'hr.access': 'none' } }, [{ companyId: 'company-a', id: 'employee-a', displayName: 'Company A Employee' }]);
const allowedResponse = await routeGroupErp(new Request('https://staff.test/api/search/suggest?q=employee'), allowed.env, allowed.context);
const allowedBody = await allowedResponse.json();
assert.equal(allowedBody.suggestions.some((item) => item.entityId === 'employee-a'), true, 'authorized-company employee suggestions remain available');

const owner = fixture({}, [{ companyId: 'company-a', id: 'employee-a', displayName: 'Company A Employee' }, { companyId: 'company-b', id: 'employee-b', displayName: 'Company B Employee' }]);
owner.context.roles = [{ code: 'owner' }];
const ownerResponse = await routeGroupErp(new Request('https://staff.test/api/search/suggest?q=employee'), owner.env, owner.context);
assert.equal((await ownerResponse.json()).suggestions.some((item) => item.entityId === 'employee-a'), true, 'Owner retains group-wide employee search');
console.log('Smart Search duplicate route company scope: 3/3 PASS');
