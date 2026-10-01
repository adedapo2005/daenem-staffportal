import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../worker/group-erp.ts', import.meta.url), 'utf8');
const executable = source.replace(
  "import { hasPermission, type AuthEnv, type SessionContext } from './auth';",
  "const hasPermission=(context,code,minimum='view',companyId)=>{const levels=['none','view','create','edit','approve','manage'];const level=companyId?(context.companyPermissions?.[companyId]?.[code]||'none'):(context.permissions?.[code]||'none');return levels.indexOf(level)>=levels.indexOf(minimum)};"
);
const compiled = ts.transpileModule(executable, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { routeGroupErp } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function fixture({ role = 'employee', companyPermission = 'none' } = {}) {
  const calls = [], writes = [];
  const context = {
    roles: [{ code: role }],
    companies: [{ id: 'company-a' }, { id: 'company-b' }],
    companyPermissions: {
      'company-a': { 'toolbox.access': 'manage', 'payroll.access': 'view', 'diagnostics.access': 'manage' },
      'company-b': { 'payroll.access': companyPermission }
    },
    // Simulate the aggregate permission projection that exposed this defect.
    permissions: { 'toolbox.access': 'manage', 'diagnostics.access': 'manage' },
    employee: { id: 'actor' }
  };
  const DB = {
    prepare(sql) {
      return {
        bind(...args) {
          calls.push({ sql, args });
          return {
            first: async () => ({ n: 2, ok: 1 }),
            all: async () => ({ results: [] }),
            run: async () => { writes.push({ sql, args }); return { success: true }; }
          };
        },
        first: async () => { calls.push({ sql, args: [] }); return { n: 2, ok: 1 }; },
        all: async () => { calls.push({ sql, args: [] }); return { results: [] }; }
      };
    }
  };
  return { context, env: { DB }, calls, writes };
}

const diagnosticsDenied = fixture();
const diagnosticsDeniedResponse = await routeGroupErp(new Request('https://staffportal.test/api/diagnostics/summary'), diagnosticsDenied.env, diagnosticsDenied.context);
assert.equal(diagnosticsDeniedResponse.status, 403, 'company-derived diagnostics permission cannot authorize global diagnostics');
assert.equal(diagnosticsDenied.calls.length, 0, 'unauthorized global diagnostics performs no reads');

const diagnosticsOwner = fixture({ role: 'owner' });
const diagnosticsOwnerResponse = await routeGroupErp(new Request('https://staffportal.test/api/diagnostics/summary'), diagnosticsOwner.env, diagnosticsOwner.context);
assert.equal(diagnosticsOwnerResponse.status, 200, 'Owner retains group-wide diagnostics authority');
assert.ok(diagnosticsOwner.calls.length > 0, 'authorized diagnostics reads runtime status');

const globalToolboxDenied = fixture();
const globalToolboxDeniedResponse = await routeGroupErp(new Request('https://staffportal.test/api/toolbox/run', {
  method: 'POST', body: JSON.stringify({ toolKey: 'database-health' })
}), globalToolboxDenied.env, globalToolboxDenied.context);
assert.equal(globalToolboxDeniedResponse.status, 403, 'company-derived toolbox permission cannot authorize global database diagnostics');
assert.equal(globalToolboxDenied.calls.length, 0, 'unauthorized global toolbox utility performs no reads or writes');

const globalToolboxAdmin = fixture({ role: 'group_admin' });
const globalToolboxAdminResponse = await routeGroupErp(new Request('https://staffportal.test/api/toolbox/run', {
  method: 'POST', body: JSON.stringify({ toolKey: 'database-health' })
}), globalToolboxAdmin.env, globalToolboxAdmin.context);
assert.equal(globalToolboxAdminResponse.status, 200, 'Group Admin retains explicitly group-wide toolbox authority');

const payrollDenied = fixture();
const payrollDeniedResponse = await routeGroupErp(new Request('https://staffportal.test/api/toolbox/run', {
  method: 'POST', body: JSON.stringify({ toolKey: 'payroll-readiness', companyId: 'company-b' })
}), payrollDenied.env, payrollDenied.context);
assert.equal(payrollDeniedResponse.status, 404, 'Company A admin without Company B payroll authority receives neutral denial');
assert.equal(payrollDenied.calls.length, 0, 'unauthorized payroll readiness performs zero Company B reads');

const payrollAllowed = fixture({ companyPermission: 'view' });
const payrollAllowedResponse = await routeGroupErp(new Request('https://staffportal.test/api/toolbox/run', {
  method: 'POST', body: JSON.stringify({ toolKey: 'payroll-readiness', companyId: 'company-b' })
}), payrollAllowed.env, payrollAllowed.context);
assert.equal(payrollAllowedResponse.status, 200, 'Company B payroll reader can access Company B readiness');
assert.ok(payrollAllowed.calls.filter(call => call.sql.includes('employee_company_memberships')).every(call => call.args.includes('company-b')),
  'authorized payroll readiness queries bind Company B');
assert.ok(payrollAllowed.writes.some(write => write.sql.includes('INSERT INTO audit_logs') && write.args[2] === 'company-b'),
  'authorized toolbox audit records the requested company scope');

console.log('PASS diagnostics and toolbox global/company scope (7 assertions)');
