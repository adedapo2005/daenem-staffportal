import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../worker/group-erp.ts', import.meta.url), 'utf8');
const check = (name, condition) => {
  if (!condition) throw new Error(`FAIL ${name}`);
  console.log(`PASS ${name}`);
};

const executable = source.replace(
  "import { hasPermission, type AuthEnv, type SessionContext } from './auth';",
  "const hasPermission=(context,code,minimum='view',companyId)=>{const levels=['none','view','create','edit','approve','manage'];const level=companyId?(context.companyPermissions?.[companyId]?.[code]||'none'):(context.permissions?.[code]||'none');return levels.indexOf(level)>=levels.indexOf(minimum)};"
);
const compiled = ts.transpileModule(executable, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { routeGroupErp } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function fixture({ owner = false, companyAAudit = 'none', companyBAudit = 'none' } = {}) {
  const calls = [];
  const context = {
    roles: owner ? [{ code: 'owner' }] : [{ code: 'employee' }],
    companies: [{ id: 'company-a' }, { id: 'company-b' }],
    companyPermissions: {
      'company-a': { 'audit.explorer': companyAAudit },
      'company-b': { 'audit.explorer': companyBAudit }
    },
    permissions: { 'audit.explorer': 'manage' },
    employee: { id: 'actor' }
  };
  const DB = {
    prepare(sql) {
      return {
        bind(...args) {
          calls.push({ sql, args });
          return {
            all: async () => ({ results: ['company-a', 'company-b']
              .filter(companyId => !sql.includes('al.company_id IN') || args.slice(9, -1).includes(companyId))
              .map(companyId => ({ id: `event-${companyId}`, companyId })) })
          };
        }
      };
    }
  };
  return { context, env: { DB }, calls };
}

const denied = fixture();
const deniedResponse = await routeGroupErp(new Request('https://staffportal.test/api/audit/activity'), denied.env, denied.context);
check('non-Owner without company Audit Explorer authority receives neutral denial', deniedResponse.status === 404 && (await deniedResponse.json()).error === 'Audit Explorer is unavailable.');
check('no-authority denial performs no activity-log query', denied.calls.length === 0);

const companyAOnly = fixture({ companyAAudit: 'view' });
const companyAResponse = await routeGroupErp(new Request('https://staffportal.test/api/audit/activity'), companyAOnly.env, companyAOnly.context);
const companyAEvents = await companyAResponse.json();
check('non-Owner audit query is SQL-scoped to authorized companies', companyAOnly.calls.length === 1 && companyAOnly.calls[0].sql.includes('al.company_id IN (?)') && companyAOnly.calls[0].args.slice(9, -1).join(',') === 'company-a');
check('Company A reader receives no Company B activity', companyAResponse.status === 200 && companyAEvents.events.length === 1 && companyAEvents.events[0].companyId === 'company-a');

const companyBOnly = fixture({ companyBAudit: 'view' });
const companyBResponse = await routeGroupErp(new Request('https://staffportal.test/api/audit/activity?employeeId=employee-b'), companyBOnly.env, companyBOnly.context);
check('Company B permission permits Company B audit queries only', companyBResponse.status === 200 && companyBOnly.calls[0].args.slice(9, -1).join(',') === 'company-b');

const owner = fixture({ owner: true });
const ownerResponse = await routeGroupErp(new Request('https://staffportal.test/api/audit/activity'), owner.env, owner.context);
const ownerEvents = await ownerResponse.json();
check('Owner retains group-wide audit visibility', ownerResponse.status === 200 && ownerEvents.events.length === 2 && !owner.calls[0].sql.includes('al.company_id IN'));
