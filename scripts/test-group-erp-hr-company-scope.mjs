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

function fixture({ owner = false, companyBPermission = 'none' } = {}) {
  const calls = [];
  const context = {
    roles: owner ? [{ code: 'owner' }] : [{ code: 'employee' }],
    companies: [{ id: 'company-a' }, { id: 'company-b' }],
    companyPermissions: {
      'company-a': { 'hr.access': 'edit' },
      'company-b': { 'hr.access': companyBPermission }
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
            first: async () => ({ n: 3 }),
            all: async () => ({ results: [{ id: 'employee-b', companyId: 'company-b' }] })
          };
        }
      };
    }
  };
  return { context, env: { DB }, calls };
}

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
