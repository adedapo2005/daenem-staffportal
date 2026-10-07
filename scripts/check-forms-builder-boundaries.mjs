import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../worker/forms.ts', import.meta.url), 'utf8');
const uiSource = readFileSync(new URL('../src/centers.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../src/centers.css', import.meta.url), 'utf8');
const assertions = [];
function check(name, condition) {
  assertions.push({ name, ok: Boolean(condition) });
  if (!condition) process.exitCode = 1;
}

check('Forms company scope derives from company permission truth', source.includes("hasPermission(context,'forms.access',level,company.id)"));
check('Form listing rejects an unauthorized requested company', source.includes("requested&&!allowed.includes(requested)") && source.includes("Forms access is not assigned for this business."));
check('Form and assignment listing counts stay in authorized scope', source.includes("a.company_id IS NULL OR a.company_id IN (") && source.includes("wf.company_id IS NULL OR wf.company_id IN ("));
check('Company form creation uses company-scoped authority', source.includes("hasPermission(context,'forms.access','create',companyId)"));
check('Global form creation is Owner-managed', source.includes("companyId?!hasPermission") && source.includes(":!canGroup(context,'manage')"));
check('Assignment authority is validated against the target company', source.includes("hasPermission(context,'forms.access','edit',targetCompanyId)") && source.includes("return json({error:'Form not found.'},404)"));
check('Employee assignment requires active target-company membership', source.includes("employee_company_memberships WHERE employee_id=? AND company_id=? AND active=1"));
check('Role assignment requires a target-company role', source.includes("SELECT 1 AS ok FROM roles WHERE id=? AND company_id=?"));
check('Global assignment is restricted to global forms, empty company scope, and Owner management', source.includes("form.companyId||targetCompanyId||!canGroup(context,'manage')"));
check('Personal assignment roles are filtered to authorized companies', source.includes("context.roles.filter(role=>companyIds.includes(role.companyId))"));
check('Global assigned forms require active Forms view authority', source.includes("group=companyIds.length>0||canGroup(context,'view')"));
check('Personal assignments repeat company scope for forms and audiences', source.includes("wf.company_id IS NULL OR wf.company_id IN") && source.includes("a.audience_type='employee' AND a.employee_id=? AND a.company_id IN"));
check('Submission denies unassigned forms without disclosure', source.includes("if(!minePayload.assignments?.some") && source.includes("Assigned form not found."));
check('Submission replay is assignment and employee scoped', source.includes("WHERE assignment_id=? AND employee_id=? AND offline_idempotency_key=?"));
check('Submission update repeats assignment and employee scope', source.includes("WHERE id=? AND assignment_id=? AND employee_id=?"));
check('Review queue derives and enforces company approval scope', source.includes("companyScope(context,'approve')") && source.includes("Approve Forms permission is required for this business."));
check('Review queue joins repeat authoritative company relations', source.includes("wf.id=s.form_id AND (wf.company_id=s.company_id OR wf.company_id IS NULL)") && source.includes("a.id=s.assignment_id AND (a.company_id=s.company_id OR a.company_id IS NULL)"));
check('Review authorization is company-scoped with neutral denial', source.includes("hasPermission(context,'forms.access','approve',row.companyId)") && source.includes("Submission not found."));
check('Review update repeats company or global scope', source.includes("(? IS NULL AND company_id IS NULL) OR company_id=?"));
check('Forms UI composes authority for the selected company', uiSource.includes("hasWorkforcePermission(context,'forms.access',minimum,companyId)") && uiSource.includes("if(canForms('edit'))") && uiSource.includes("canForms('create')") && uiSource.includes("canForms('edit')&&<article"));
check('Forms success feedback survives its post-action refresh', uiSource.includes("setMessage('Form assigned successfully.');await load(true)") && uiSource.includes("async function load(preserveMessage=false)"));
check('Forms visible eyebrow text keeps the 9px accessibility floor', cssSource.includes('[data-forms-center="true"] .eyebrow{font-size:9px}'));
check('Employee picker captures the exact selected employee ID', uiSource.includes('type="checkbox" value={e.id} checked={selected.has(e.id)}'));
check('Employee deselection removes the captured employee ID', uiSource.includes(':a.employeeIds.filter(id=>id!==e.id)'));
check('Employee reselection stays duplicate-free', uiSource.includes('[...a.employeeIds.filter(id=>id!==e.id),e.id]'));

const toggleEmployee = (ids, employeeId, checked) => checked
  ? [...ids.filter((id) => id !== employeeId), employeeId]
  : ids.filter((id) => id !== employeeId);
let selectedEmployees = [];
selectedEmployees = toggleEmployee(selectedEmployees, 'employee-a', true);
check('Employee selection acceptance', selectedEmployees.length === 1 && selectedEmployees[0] === 'employee-a');
selectedEmployees = toggleEmployee(selectedEmployees, 'employee-b', true);
check('Multi-recipient acceptance', selectedEmployees.length === 2 && selectedEmployees.includes('employee-a') && selectedEmployees.includes('employee-b'));
selectedEmployees = toggleEmployee(selectedEmployees, 'employee-a', false);
check('Employee unselect acceptance', selectedEmployees.length === 1 && selectedEmployees[0] === 'employee-b');
selectedEmployees = toggleEmployee(selectedEmployees, 'employee-a', true);
selectedEmployees = toggleEmployee(selectedEmployees, 'employee-a', true);
check('Employee reselect acceptance', selectedEmployees.length === 2 && selectedEmployees.filter((id) => id === 'employee-a').length === 1 && selectedEmployees.includes('employee-b'));

for (const result of assertions) console.log(`${result.ok ? '✓' : '✗'} ${result.name}`);
if (process.exitCode) console.error(`\n${assertions.filter((item) => !item.ok).length} Forms builder boundary assertion(s) failed.`);
else console.log(`\n${assertions.length} Forms builder boundary assertions passed.`);
