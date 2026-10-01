import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../worker/group-erp.ts', import.meta.url), 'utf8');
const check = (name, condition) => {
  if (!condition) throw new Error(`FAIL ${name}`);
  console.log(`PASS ${name}`);
};
const functionBody = (name, nextName) => {
  const start = source.indexOf(`async function ${name}(`);
  const end = source.indexOf(`\nasync function ${nextName}(`, start);
  if (start < 0 || end < 0) throw new Error(`Could not locate ${name}`);
  return source.slice(start, end);
};

const overview = functionBody('hrOverview', 'hrEmployees');
const employees = functionBody('hrEmployees', 'saveHrDetails');
const deny = "!companyId||!companyAllowed(c,companyId)||!canCompany(c,'hr.access','view',companyId)";

check('Company B without HR permission is denied before overview queries', overview.includes(deny) && overview.indexOf(deny) < overview.indexOf('env.DB.prepare'));
check('Company B without HR permission is denied before employee queries', employees.includes(deny) && employees.indexOf(deny) < employees.indexOf('env.DB.prepare'));
check('overview count queries bind target company for employees, leave, cases and profiles',
  (overview.match(/\.bind\(companyId\)\.first/g) || []).length === 4 &&
  (overview.match(/company_id=\?/g) || []).length >= 4);
check('employee list joins and filters HR details by target company',
  employees.includes('WHERE m.company_id=?') &&
  employees.includes('h.company_id=m.company_id') &&
  employees.includes('.bind(companyId,q,like,like,like)'));
check('Owner retains explicit group-wide company authority through canCompany',
  source.includes("function canCompany(c:SessionContext,p:string,l:AccessLevel,companyId:string){return owner(c)||hasPermission(c,p,l,companyId)}"));
check('denial response is neutral and non-confirming',
  overview.includes("{error:'HR overview is unavailable.'},404") &&
  employees.includes("{error:'HR employee list is unavailable.'},404"));

const executable = source.replace(
  "import { hasPermission, type AuthEnv, type SessionContext } from './auth';",
  "const hasPermission=(context,code,minimum='view',companyId)=>{const levels=['none','view','create','edit','approve','manage'];const level=companyId?(context.companyPermissions?.[companyId]?.[code]||'none'):(context.permissions?.[code]||'none');return levels.indexOf(level)>=levels.indexOf(minimum)};"
);
const compiled = ts.transpileModule(executable, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { routeGroupErp } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function fixture({ owner = false, companyBPermission = 'none', companyBPayrollPermission = 'none' } = {}) {
  const calls = [], writes = [];
  const context = {
    roles: owner ? [{ code: 'owner' }] : [{ code: 'employee' }],
    companies: [{ id: 'company-a' }, { id: 'company-b' }],
    companyPermissions: {
      'company-a': { 'hr.access': 'edit' },
      'company-b': { 'hr.access': companyBPermission, 'payroll.access': companyBPayrollPermission }
    },
    permissions: { 'hr.access': 'edit' },
    employee: { id: 'actor' }
  };
  const DB = {
    prepare(sql) {
      return {
        bind(...args) {
          calls.push({ sql, args });
          return {
            first: async () => sql.includes('payroll_banks') ? { name: 'Test Bank' } : sql.includes('employee_company_memberships') ? { id: 'employee-b', companyId: 'company-b' } : { n: 3 },
            all: async () => ({ results: [{ id: 'employee-b', companyId: 'company-b' }] }),
            run: async () => { writes.push({ sql, args }); return { success: true }; }
          };
        }
      };
    }
  };
  return { context, env: { DB, AUTH_PEPPER: 'test-only-fixture-key' }, calls, writes };
}

const hrWriteBody = { employeeId: 'employee-b', companyId: 'company-b', employmentType: 'full_time' };
const deniedHrWrite = fixture();
const deniedHrResponse = await routeGroupErp(new Request('https://staffportal.test/api/hr/details', { method: 'POST', body: JSON.stringify(hrWriteBody) }), deniedHrWrite.env, deniedHrWrite.context);
check('HR detail mutation denies Company B when only Company A HR is granted', deniedHrResponse.status === 404);
check('HR detail mutation denial performs zero reads and writes', deniedHrWrite.calls.length === 0 && deniedHrWrite.writes.length === 0);

const allowedHrWrite = fixture({ companyBPermission: 'edit' });
const allowedHrResponse = await routeGroupErp(new Request('https://staffportal.test/api/hr/details', { method: 'POST', body: JSON.stringify(hrWriteBody) }), allowedHrWrite.env, allowedHrWrite.context);
check('authorized Company B HR detail mutation succeeds', allowedHrResponse.status === 200);
check('authorized HR detail mutation verifies Company B membership and writes/audits only Company B', allowedHrWrite.calls.every(call => call.args.includes('company-b')) && allowedHrWrite.writes.length >= 1 && allowedHrWrite.writes.every(write => write.args.includes('company-b')));

const ownerHrWrite = fixture({ owner: true });
const ownerHrResponse = await routeGroupErp(new Request('https://staffportal.test/api/hr/details', { method: 'POST', body: JSON.stringify(hrWriteBody) }), ownerHrWrite.env, ownerHrWrite.context);
check('Owner retains group-wide HR detail mutation authority', ownerHrResponse.status === 200);

const bankBody = { ...hrWriteBody, bankKey: 'TEST', accountName: 'Employee B', accountNumber: '1234567890' };
const deniedBankWrite = fixture();
const deniedBankResponse = await routeGroupErp(new Request('https://staffportal.test/api/hr/bank-account', { method: 'POST', body: JSON.stringify(bankBody) }), deniedBankWrite.env, deniedBankWrite.context);
check('bank profile mutation denies Company B when caller has no Company B HR/Payroll authority', deniedBankResponse.status === 404);
check('bank profile denial performs zero reads and writes', deniedBankWrite.calls.length === 0 && deniedBankWrite.writes.length === 0);

const allowedBankWrite = fixture({ companyBPayrollPermission: 'manage' });
const allowedBankResponse = await routeGroupErp(new Request('https://staffportal.test/api/hr/bank-account', { method: 'POST', body: JSON.stringify(bankBody) }), allowedBankWrite.env, allowedBankWrite.context);
check('authorized Company B Payroll manager can update its employee bank profile', allowedBankResponse.status === 200);
check('bank profile mutation binds employee lookup, update, insert and audit to Company B', allowedBankWrite.calls.some(call => call.sql.includes('employee_company_memberships') && call.args.includes('company-b')) && allowedBankWrite.writes.length >= 3 && allowedBankWrite.writes.every(write => write.args.includes('company-b') || write.sql.includes('employee_bank_accounts')));

const ownerBankWrite = fixture({ owner: true });
const ownerBankResponse = await routeGroupErp(new Request('https://staffportal.test/api/hr/bank-account', { method: 'POST', body: JSON.stringify(bankBody) }), ownerBankWrite.env, ownerBankWrite.context);
check('Owner retains group-wide employee bank profile authority', ownerBankResponse.status === 200);

for (const path of ['/api/hr/overview?companyId=company-b', '/api/hr/employees?companyId=company-b']) {
  const denied = fixture();
  const response = await routeGroupErp(new Request(`https://staffportal.test${path}`), denied.env, denied.context);
  check(`${path.split('?')[0]} denies Company B when only Company A HR is granted`, response.status === 404);
  check(`${path.split('?')[0]} denial performs zero Company B reads`, denied.calls.length === 0);

  const allowed = fixture({ companyBPermission: 'view' });
  const allowedResponse = await routeGroupErp(new Request(`https://staffportal.test${path}`), allowed.env, allowed.context);
  check(`${path.split('?')[0]} permits an authorized Company B reader`, allowedResponse.status === 200);
  check(`${path.split('?')[0]} authorized queries bind Company B`, allowed.calls.length > 0 && allowed.calls.every(call => call.args[0] === 'company-b'));

  const owner = fixture({ owner: true });
  const ownerResponse = await routeGroupErp(new Request(`https://staffportal.test${path}`), owner.env, owner.context);
  check(`${path.split('?')[0]} preserves Owner group-wide authority`, ownerResponse.status === 200);
}
