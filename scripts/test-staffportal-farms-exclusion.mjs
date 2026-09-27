import { readFileSync } from 'node:fs';

const read=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const access=read('worker/social-access.ts');
const migration=read('migrations/0078_remove_farms_from_staffportal_scope.sql');
const auth=read('src/auth.tsx');
const admin=read('src/communications-admin-entry.tsx');

const checks=[];
function check(name,condition){checks.push({name,ok:Boolean(condition)});if(!condition)process.exitCode=1}

check('social brand lookup excludes Farms',access.includes("lower(code) <> 'farms'")&&access.includes("lower(name) NOT LIKE '%farm%'"));
check('social brand list excludes Farms',access.match(/lower\(code\) <> 'farms'/g)?.length>=2);
check('legacy Farms social brand is deactivated',migration.includes("SET active = 0")&&migration.includes("lower(code) = 'farms'"));
check('authenticated company projection excludes Farms',auth.includes("filter(company=>!/farm/i.test"));
check('communications company projection excludes Farms',admin.includes("filter(company=>!/farm/i.test"));

for(const item of checks)console.log(`${item.ok?'✓':'✗'} ${item.name}`);
console.log(`\n${checks.filter(x=>x.ok).length}/${checks.length} Staff Portal Farms exclusion checks passed.`);
