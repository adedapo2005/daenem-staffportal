import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const source = await readFile(new URL('../worker/alerting.ts', import.meta.url), 'utf8');
const start = source.indexOf('async function createRecipientDeliveries');
const end = source.indexOf('\nfunction companyScope', start);
const delivery = source.slice(start, end);
assert.match(delivery, /SELECT company_id companyId,title,summary FROM platform_alerts WHERE id=\?/);
assert.match(delivery, /INSERT OR IGNORE INTO notification_outbox/);
assert.match(delivery, /await env\.DB\.batch\(statements\)/);
assert.match(delivery, /const statements = \[env\.DB\.prepare\(`INSERT OR IGNORE INTO platform_alert_deliveries/);
assert.match(delivery, /SELECT id,\?,\?, 'platform_alert'/);
assert.match(delivery, /FROM platform_alert_deliveries[\s\S]*?status='queued' LIMIT 1/);
assert.match(delivery, /\.bind\(employeeId, alert\.companyId, alertId, channel, alert\.title/);
assert.match(delivery, /if \(channel === 'in_app' \|\| channel === 'web_push'\)/);
assert.match(delivery, /WHERE alert_id=\? AND recipient_id=\? AND channel=\? AND status='queued' LIMIT 1/);
assert.match(delivery, /\.bind\(employeeId, alert\.companyId, alertId, channel, alert\.title/);
assert.doesNotMatch(delivery, /channel === 'email'|channel === 'whatsapp'|channel === 'screen_popup'/);
console.log('Alert in-app/web-push outbox bridge, atomic canonical delivery, and gated channel handling: 11/11 PASS');
