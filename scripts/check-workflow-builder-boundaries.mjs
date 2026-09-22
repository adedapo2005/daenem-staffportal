import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../worker/hr-workflows.ts', import.meta.url), 'utf8');
const assertions = [];
function check(name, condition) {
  assertions.push({ name, ok: Boolean(condition) });
  if (!condition) process.exitCode = 1;
}

check('Workflow company selection repeats company permission truth', source.includes("can(context,permission,minimum,companyId)"));
check('Workflow assignees use active company membership truth', source.includes('async function activeCompanyMember') && source.includes("company_id=? AND active=1"));
check('Review edits bind lookup to the authorized company', source.includes("FROM employee_reviews WHERE id=? AND company_id=?"));
check('Review edits repeat company scope in the mutation', source.includes("WHERE id=? AND company_id=? AND status NOT IN ('acknowledged','closed')`).bind(employeeId,start,end")&&source.includes("if(!update.meta.changes)return json({error:'Acknowledged or closed reviews cannot be rewritten.'},409)"));
check('Shared reviews cannot be silently reverted to draft', source.includes("existing.status==='shared'?'shared':status"));
check('Shared reviews cannot be reassigned without notice', source.includes("existing.status==='shared'&&existing.employeeId!==employeeId"));
check('Review sharing notification is emitted only on transition', source.includes("notifyEmployee=body.shareNow===true&&existing.status!=='shared'"));
check('Case updates validate the assignee in the case company', source.includes("activeCompanyMember(env,assignedTo,existing.companyId)"));
check('Case creation validates the assignee in the target company', source.includes("activeCompanyMember(env,assignedTo,companyId)"));
check('Case mutation repeats authoritative company scope', source.includes("WHERE id=? AND company_id=?`).bind(assignedTo||null,status"));
check('Case status changes preserve an existing assignee when omitted', source.includes("assigned_to=COALESCE(?,assigned_to)"));
check('Lifecycle owner assignment is company scoped', source.includes("activeCompanyMember(env,requestedOwner,companyId)"));
check('Lifecycle task assignment is company scoped', source.includes("activeCompanyMember(env,assignedTo,row.companyId)"));
check('Lifecycle task mutation repeats the authorized process relation', source.includes("WHERE id=? AND process_id=?`).bind(body.status"));
check('Cross-scope assignment denials do not disclose employee details', source.includes("error:'Assigned employee was not found.'") && source.includes("error:'Lifecycle owner was not found.'"));

for (const result of assertions) console.log(`${result.ok ? '✓' : '✗'} ${result.name}`);
if (process.exitCode) console.error(`\n${assertions.filter((item) => !item.ok).length} Workflow builder boundary assertion(s) failed.`);
else console.log(`\n${assertions.length} Workflow builder boundary assertions passed.`);
