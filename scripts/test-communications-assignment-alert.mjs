import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../worker/communications-inbox.ts',import.meta.url),'utf8');
const assignment=source.slice(source.indexOf("if(action==='assign')"),source.indexOf("if(action==='route')"));

assert.match(assignment,/UPDATE communication_inbox_conversations SET assigned_employee_id=\?,updated_at=\? WHERE id=\? AND company_id IS \? AND assigned_employee_id IS \? AND updated_at=\?/);
assert.match(assignment,/priorCompanyId=item\.companyId\?\?null/,'CAS preserves an unrouted shared-group conversation’s existing company state');
assert.match(assignment,/INSERT INTO audit_logs[\s\S]*'assign_inbox_conversation'[\s\S]*request_id/);
assert.ok(assignment.indexOf('await env.DB.batch')<assignment.indexOf('await publishPlatformEvent'),'assignment and formal audit persist before event publication');
assert.match(assignment,/module:'communications',eventType:'inbox_assigned',sourceType:'communication_inbox_conversation',sourceId:`\$\{id\}:\$\{employeeId\}`/);
assert.match(assignment,/recipientTarget:\{employeeId,permission:'communications\.support\.inbox\.view'\}/,
  'assignment alert is targeted to the assigned employee and requires inbox visibility');
assert.match(assignment,/title:'A Communications inbox conversation needs your attention\.',summary:'An inbox conversation was assigned to staff\.'/);
assert.doesNotMatch(assignment,/customerDisplayName|customerWaId|lastMessage|payload:/,'alerts must not carry customer identity, message content or protected payload');
assert.match(assignment,/assignment_alert_publication_failed/);
assert.match(assignment,/Conversation assignment changed\. Refresh and try again\.'\},409\)/);

console.log('Communications assignment central alert and audit boundary: PASS 10/10');
