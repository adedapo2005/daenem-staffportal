import{readFileSync}from'node:fs';
const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const migration=read('migrations/0037_navigation_hr_workflows.sql');
const navigation=read('worker/navigation-workspace.ts');
const workflows=read('worker/hr-workflows.ts');
const runtime=read('worker/runtime.ts');
const interfaceCode=read('src/navigation-studio-entry.tsx');
const hrInterface=read('src/hr-workflows-entry.tsx');
const html=read('index.html');
const moduleHub=read('src/module-hub.tsx');
const assertions=[];
function check(name,condition){assertions.push({name,ok:Boolean(condition)});if(!condition)process.exitCode=1}

for(const style of['guided-groups','full-workspace','compact-rail','two-column','top-navigation'])check(`navigation style: ${style}`,navigation.includes(`id: '${style}'`)&&interfaceCode.includes(`'${style}'`));
for(const table of['employee_navigation_preferences','navigation_access_changes','hr_lifecycle_processes','hr_lifecycle_tasks','payroll_statutory_profiles'])check(`migration table: ${table}`,migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`));
for(const permission of['navigation.studio','navigation.assign','hr.cases','hr.lifecycle','payroll.statutory'])check(`permission: ${permission}`,migration.includes(permission)&&navigation.includes(permission)||workflows.includes(permission));
for(const route of['/api/navigation/effective','/api/navigation/preference','/api/navigation/policy','/api/navigation/access','/api/navigation/assign'])check(`navigation route: ${route}`,navigation.includes(route));
for(const route of['/api/hr/workflows/leave','/api/hr/workflows/reviews','/api/hr/workflows/cases','/api/hr/workflows/lifecycle','/api/hr/workflows/statutory'])check(`HR route: ${route}`,workflows.includes(route));
check('live ESS leave table reused',workflows.includes('FROM leave_requests')&&workflows.includes('UPDATE leave_requests'));
check('live ESS review table reused',workflows.includes('FROM employee_reviews')&&workflows.includes('INSERT INTO employee_reviews'));
check('owner role protected',navigation.includes("role.code === 'owner'")&&navigation.includes('Owner / Super Admin navigation and permissions are protected.'));
check('employee owner protected',navigation.includes('if (employee.isOwner)'));
check('company-scoped menu enforcement',navigation.includes('companyPermissions')&&navigation.includes('hasAnyCompanyPermission'));
check('company-scoped HR enforcement',workflows.includes('EnhancedSessionContext')&&workflows.includes('hasCompanyPermission'));
check('lifecycle creation requires active target-company membership',workflows.includes("if(!await activeCompanyMember(env,employeeId,companyId))return json({error:'Employee is not assigned to this company.'},404)"));
check('leave decisions guard company and pending state before notification',workflows.includes("WHERE id=? AND company_id=? AND status='pending'")&&workflows.includes("if(!update.meta.changes)return json({error:'Only pending leave can be reviewed.'},409)"));
check('review edits cannot race past terminal state',workflows.includes("WHERE id=? AND company_id=? AND status NOT IN ('acknowledged','closed')")&&workflows.includes("if(!update.meta.changes)return json({error:'Acknowledged or closed reviews cannot be rewritten.'},409)"));
check('review share and close actions guard company and source state',workflows.includes("WHERE id=? AND company_id=? AND status='draft'")&&workflows.includes("WHERE id=? AND company_id=? AND status IN ('shared','acknowledged')"));
check('HR case mutations bind company and active assignees',workflows.includes("WHERE id=? AND company_id=?`).bind(assignedTo||null,status")&&workflows.includes("activeCompanyMember(env,assignedTo,existing.companyId)"));
check('legacy shell override compatibility',migration.includes('INSERT INTO employee_permission_overrides(')&&navigation.includes("DELETE FROM employee_permission_overrides WHERE"));
check('Worker routes wired',runtime.includes('routeNavigationWorkspace')&&runtime.includes('routeHrWorkflows'));
check('client entries wired on demand',moduleHub.includes("import('./navigation-studio-entry')")&&moduleHub.includes("import('./hr-workflows-entry')")&&!html.includes('/src/navigation-studio-entry.tsx')&&!html.includes('/src/hr-workflows-entry.tsx'));
check('authorization refresh is light',interfaceCode.includes('120000')&&hrInterface.includes('120000'));
check('PAYE remains honest',workflows.includes("calculationStatus:'configuration_only'")&&hrInterface.includes('not a tax advice engine'));
check('no credential literals',![navigation,workflows,interfaceCode,hrInterface].some((source)=>/BEGIN (RSA|OPENSSH) PRIVATE KEY|api[_-]?key\s*[:=]\s*['\"][^'\"]+/i.test(source)));

for(const result of assertions)console.log(`${result.ok?'✓':'✗'} ${result.name}`);
if(process.exitCode)console.error(`\n${assertions.filter((item)=>!item.ok).length} next-phase contract assertion(s) failed.`);
else console.log(`\n${assertions.length} next-phase contract assertions passed.`);
