import { readFileSync } from 'node:fs';

const attendance = readFileSync(new URL('../worker/attendance.ts', import.meta.url), 'utf8');
const payroll = readFileSync(new URL('../worker/payroll.ts', import.meta.url), 'utf8');
const assertions = [];
function check(name, condition) {
  assertions.push({ name, ok: Boolean(condition) });
  if (!condition) process.exitCode = 1;
}

check('Attendance view permission is evaluated for the selected company', attendance.includes("hasPermission(context, 'attendance.access', 'view', companyId)"));
check('Attendance clock permission is evaluated for the selected company', attendance.includes("hasPermission(context, 'attendance.access', 'create', companyId)"));
check('Attendance policy locations repeat authoritative company scope', attendance.includes('cl.id = m.location_id AND cl.company_id = m.company_id'));
check('Attendance photos use company-scoped object keys', attendance.includes('attendance/${companyId}/${employeeId}/${workDate}'));
check('Attendance photo metadata records company scope', /customMetadata: \{[^}]*companyId[^}]*employeeId[^}]*workDate[^}]*action/.test(attendance));
check('Attendance responses disable caching', attendance.includes("'cache-control': 'no-store'"));

check('Payroll authority is evaluated for the target company', payroll.includes("hasPermission(context,'payroll.access',level,companyId)"));
check('Payroll adjustment employees require active target-company membership', payroll.includes('employee_company_memberships WHERE employee_id=? AND company_id=? AND active=1'));
check('Only Owner may self-approve a payroll adjustment at submission', payroll.includes("const status=owner?'approved':'pending'"));
check('Payroll adjustment and formal audit evidence are written atomically', payroll.includes('await env.DB.batch([') && payroll.includes("'owner_self_approval':'submit_adjustment'"));
check('Payroll adjustment review requires target-company approve authority', payroll.includes("can(context,adjustment.companyId,'approve')"));
check('Payroll adjustment review uses pending-state compare-and-set and atomic audit', payroll.includes("WHERE id=? AND company_id=? AND status='pending'")
  && payroll.includes('WHERE changes()=1'));
check('Unauthorized payroll run detail uses neutral not-found denial', payroll.includes("if(!can(context,companyId))return json({error:'Payroll run not found.'},404)"));
check('Unauthorized payroll status changes use neutral not-found denial', payroll.includes("if(!can(context,run.companyId,minimum))return json({error:'Payroll run not found.'},404)"));
check('Payroll responses disable caching', payroll.includes("'cache-control':'no-store'"));

for (const result of assertions) console.log(`${result.ok ? '✓' : '✗'} ${result.name}`);
if (process.exitCode) console.error(`\n${assertions.filter((item) => !item.ok).length} workforce boundary assertion(s) failed.`);
else console.log(`\n${assertions.length} workforce boundary assertions passed.`);
