import { readFileSync } from 'node:fs';

const profile = readFileSync(new URL('../worker/profile-management.ts', import.meta.url), 'utf8');
const ess = readFileSync(new URL('../worker/employee-self-service.ts', import.meta.url), 'utf8');
const payroll = readFileSync(new URL('../worker/payroll.ts', import.meta.url), 'utf8');
const assertions = [];
function check(name, condition) {
  assertions.push({ name, ok: Boolean(condition) });
  if (!condition) process.exitCode = 1;
}

check('Profile actions resolve an authoritative managed company', profile.includes('managedCompanyForEmployee') && profile.includes("hasPermission(c,'users.access','manage',row.companyId)"));
check('Profile administration listing requires manage authority', profile.includes("hasPermission(c,'users.access','manage',company.id)"));
check('Profile reminders repeat active target-company membership', profile.includes('m.company_id=? AND m.active=1 WHERE e.id=?'));
check('Profile reminders carry company notification and audit scope', profile.includes('employee_id,company_id,category') && profile.includes('actor_employee_id,company_id,module'));
check('Login access audits carry managed company scope', profile.includes("company_id,module,action,entity_type,entity_id,after_json") && profile.includes("'create_login_access'"));
check('Employee creation validates an active target company', profile.includes('SELECT id FROM companies WHERE id=? AND active=1'));
check('Profile responses disable caching', profile.includes("'cache-control':'no-store'"));

check('Self-service company selection requires assignment', ess.includes("const companyAllowed=(c:SessionContext,id:string)=>c.companies.some"));
check('Self-service permission composition evaluates each company', ess.includes('hasPermission(c,permission,level,company.id)'));
check('My Day composes module-specific company scopes', ["attendance.access","forms.access","broadcasts.access","leave.access","document_requests.access","reviews.access"].every(permission=>ess.includes(`permittedCompanies(context,'${permission}')`)));
check('My Day attendance and form data repeat permission scopes in SQL', ess.includes('company_id IN (${placeholders(attendanceCompanies)})') && ess.includes('workflow_form_assignments') && ess.includes("COALESCE(s.status,'not_started')"));
check('My Day protected counts repeat assigned or permitted company scopes', ess.includes('company_id IN (${placeholders(companies)})') && ess.includes('company_id IN (${placeholders(documentCompanies)})') && ess.includes('company_id IN (${placeholders(reviewCompanies)})'));
check('My Day suppresses attendance prompts without attendance permission', ess.includes('if(attendanceCompanies.length&&!attendance)'));
check('Leave types and history filter to authorized companies', ess.includes("permittedCompanies(context,'leave.access')") && ess.includes('lr.company_id IN (${placeholders})'));
check('Leave creation uses target-company permission truth', ess.includes("hasPermission(context,'leave.access','create',companyId)"));
check('Leave type references are global or target-company scoped', ess.includes('(company_id IS NULL OR company_id=?)'));
check('Leave queues use target-company administration authority', ess.includes("hasPermission(context,'leave.admin','view',companyId)"));
check('Leave decisions use target-company approval authority', ess.includes("hasPermission(context,'leave.admin','approve',row.companyId)"));
check('Leave decision mutations repeat company and pending state', ess.includes("WHERE id=? AND company_id=? AND status='pending'"));
check('Leave decisions suppress stale-review notifications', ess.includes('if(!update.meta.changes)'));
check('Payslips filter to authorized company IDs', ess.includes("permittedCompanies(context,'payslips.access')") && ess.includes('pr.company_id IN (${placeholders})'));
check('Review reads and acknowledgements filter authorized companies', ess.includes("permittedCompanies(context,'reviews.access')") && ess.includes("permittedCompanies(context,'reviews.access')"));
check('Review creation uses target-company authority', ess.includes("hasPermission(context,'reviews.admin','edit',companyId)"));
check('Document reads and creates use company permission truth', ess.includes("permittedCompanies(context,'document_requests.access')") && ess.includes("hasPermission(context,'document_requests.access','create',companyId)"));
check('Notification reads exclude revoked company scope', ess.includes("broadcastCompanyIds=permittedCompanies(context,'broadcasts.access')") && ess.includes('(company_id IS NULL OR company_id IN (${companyPlaceholders}))'));
check('Notification actions repeat current company authority', ess.includes('EXISTS(SELECT 1 FROM broadcasts b') && ess.includes('b.company_id IN (${placeholders})'));
check('Chat thread lists filter authorized companies', ess.includes("permittedCompanies(context,'chat.access')") && ess.includes('t.company_id IN (${placeholders})'));
check('Direct chats use target-company create authority', ess.includes("hasPermission(context,'chat.access','create',companyId)"));
check('Chat message reads recheck target-company view authority', ess.includes("hasPermission(context,'chat.access','view',member.companyId)"));
check('Chat sends recheck target-company create authority', ess.includes("hasPermission(context,'chat.access','create',member.companyId)"));
check('Chat replies bind to the same active thread', ess.includes('WHERE id=? AND thread_id=? AND deleted_at IS NULL'));
check('Self-service responses disable caching', ess.includes("'cache-control':'no-store'"));

check('Payroll draft writes match the authoritative payroll_items schema', payroll.includes('base_kobo,allowance_kobo,overtime_kobo') && payroll.includes('deduction_kobo,statutory_kobo,gross_kobo,net_kobo,attendance_days_counted'));
check('Payroll detail reads match the authoritative payroll_items schema', payroll.includes('pi.base_kobo AS baseSalaryKobo') && payroll.includes('pi.attendance_days_counted AS attendanceDays'));
check('Retired payroll item column names are absent', !payroll.includes('pi.base_salary_kobo AS baseSalaryKobo') && !payroll.includes('pi.statutory_deductions_kobo AS statutoryDeductionsKobo') && !payroll.includes('payroll_items(id,payroll_run_id,employee_id,compensation_id,base_salary_kobo'));

for (const result of assertions) console.log(`${result.ok ? '✓' : '✗'} ${result.name}`);
if (process.exitCode) console.error(`\n${assertions.filter((item) => !item.ok).length} Staff self-service boundary assertion(s) failed.`);
else console.log(`\n${assertions.length} Staff self-service boundary assertions passed.`);
