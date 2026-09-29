import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/alerting.ts', import.meta.url), 'utf8');
const publisher = source.slice(source.indexOf('export async function publishPlatformEvent'), source.indexOf('\nasync function listAttention'));
const eventWrite = publisher.indexOf('INSERT INTO platform_alert_events');
const recipientResolution = publisher.indexOf('await resolveRecipients');
const noRecipients = publisher.indexOf('if (!recipientPlan.employeeIds.length) return null');
const alertWrite = publisher.indexOf('INSERT INTO platform_alerts');

assert.ok(eventWrite >= 0 && recipientResolution > eventWrite, 'valid Events are persisted before recipient resolution');
assert.ok(noRecipients > recipientResolution && alertWrite > noRecipients, 'no-recipient events stop before Alert creation');
console.log('Alert event persistence without authorized recipients: PASS');
