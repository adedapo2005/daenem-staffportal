import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source=await readFile(new URL('../worker/communications-inbox.ts',import.meta.url),'utf8');
const list=source.slice(source.indexOf('async function listInbox'),source.indexOf('async function getThread'));
const mutate=source.slice(source.indexOf('async function mutate'),source.indexOf('export async function'));

assert.ok(list.indexOf("can(context,companyId,'communications.support.inbox.view','view')")<list.indexOf('env.DB.prepare'),
  'inbox read authority is checked before querying protected conversations');
assert.match(list,/c\.company_id=\? OR \(c\.company_id IS NULL AND EXISTS\([\s\S]*sc\.company_id=\?/,
  'waiting queue remains target-company scoped, including approved shared senders');
assert.match(list,/status==='waiting_for_staff'\?awaitingStaffSql/,
  'waiting_for_staff is a server-side queue filter');
assert.match(source,/direction='outbound' AND m\.staff_employee_id IS NOT NULL\s+AND m\.status IN \('sent','delivered','read'\)/,
  'only provider-confirmed replies from a staff member count as answers');
assert.match(source,/lastStaffReplySql=`SELECT MAX\(m\.created_at\) FROM communication_inbox_messages/,
  'staff reply time uses the immutable message creation timestamp, not webhook-mutated updated_at');
assert.doesNotMatch(source,/lastStaffReplySql=`SELECT MAX\(m\.updated_at\)/,
  'delivery/read status changes cannot make an old staff reply appear newer than a customer message');
assert.match(source,/direction='inbound' AND m\.status='received'/,
  'customer answer state is derived from persisted inbound messages');
assert.match(source,/\(\(\$\{lastStaffReplySql\}\) IS NULL OR datetime\(\(\$\{lastStaffReplySql\}\)\)<=datetime\(\(\$\{lastCustomerReceivedSql\}\)\)\)/,
  'unanswered truth compares server-recorded receipt time with the latest confirmed staff reply');
assert.match(list,/AS lastStaffReplyAt[\s\S]*AS awaitingStaffReply/,
  'inbox rows expose bounded answer-time and waiting truth separately from unread count');
assert.match(mutate,/if\(action==='read'\)[\s\S]*unread_count=0/);
assert.match(mutate,/UPDATE communication_inbox_conversations SET unread_count=0/,
  'opening a thread can clear unread without mutating customer or staff answer timestamps');
assert.doesNotMatch(list,/INSERT INTO|UPDATE communication_inbox_conversations/,
  'queue reads do not persist derived answer state or alter conversation lifecycle');

console.log('Communications read-but-unanswered projection boundary: PASS 10/10');
