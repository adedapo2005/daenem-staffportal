import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../worker/directory.ts', import.meta.url), 'utf8');
const assertions = [];
function check(name, condition) {
  assertions.push({ name, ok: Boolean(condition) });
  if (!condition) process.exitCode = 1;
}

check('Directory authorization accepts the target company', source.includes('function canDirectory(context:SessionContext,companyId?:string)'));
for (const [permission, level] of [['users.access', 'view'], ['forms.access', 'edit'], ['broadcasts.access', 'create'], ['payroll.access', 'view'], ['chat.access', 'view']]) {
  check(`${permission} directory authority is evaluated for the target company`, source.includes(`hasPermission(context,'${permission}','${level}',companyId)`));
}
check('Explicit employee directory requests require assignment and target-company permission', source.includes("companyId&&(!context.companies.some(c=>c.id===companyId)||!canDirectory(context,companyId))"));
check('Unscoped employee directory results use only authorized assigned companies', source.includes('context.companies.filter(c=>canDirectory(context,c.id)).map(c=>c.id)'));
check('Employee directory fails closed when no company is authorized', source.includes("if(!companyId&&!companyIds.length)return json({employees:[]})"));
check('Employee directory query repeats active company membership scope', source.includes("m.active=1") && source.includes('WHERE e.employment_status='));
check('Explicit role directory requests require target-company authority', source.includes("companyId&&(!companyIds.includes(companyId)||!canDirectory(context,companyId))"));
check('Role directory fails closed when no company is authorized', source.includes("if(!companyId&&!companyIds.length)return json({roles:[]})"));
check('Directory no longer has a cross-company manage bypass', !source.includes("hasPermission(context,'users.access','manage')"));
check('Directory responses disable caching', source.includes("'cache-control':'no-store'"));

for (const result of assertions) console.log(`${result.ok ? '✓' : '✗'} ${result.name}`);
if (process.exitCode) console.error(`\n${assertions.filter((item) => !item.ok).length} Directory boundary assertion(s) failed.`);
else console.log(`\n${assertions.length} Directory boundary assertions passed.`);
