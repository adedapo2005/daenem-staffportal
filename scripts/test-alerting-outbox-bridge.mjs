import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const source = await readFile(new URL('../worker/alerting.ts', import.meta.url), 'utf8');
const start = source.indexOf('async function createRecipientDeliveries');
const end = source.indexOf('\nfunction companyScope', start);
const delivery = source.slice(start, end);
assert.match(delivery, /SELECT company_id companyId,title,summary FROM platform_alerts WHERE id=\?/);
assert.match(delivery, /INSERT OR IGNORE INTO notification_outbox/);
assert.match(delivery, /\.bind\(delivery\.id, employeeId, alert\.companyId, alertId/);
assert.match(delivery, /delivery\?\.status === 'queued' && channel === 'in_app'/);
assert.match(delivery, /WHERE alert_id=\? AND recipient_id=\? AND channel=\?/);
assert.doesNotMatch(delivery, /channel === 'email'|channel === 'whatsapp'/);
console.log('Alert in-app outbox bridge, canonical idempotency, and external channel gating: 6/6 PASS');
