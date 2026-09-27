import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const source = await readFile(new URL('../worker/alerting.ts', import.meta.url), 'utf8');
const start = source.indexOf('async function listDeliveries');
const end = source.indexOf('\nasync function receipt', start);
assert.ok(start >= 0 && end > start, 'delivery read model exists');
const handler = source.slice(start, end);
assert.match(handler, /if \(!canManage\(context\)\)/);
assert.match(handler, /alertId\.length > 160/);
assert.match(handler, /FROM platform_alert_deliveries d[\s\S]*JOIN platform_alert_recipients ar ON ar\.id=d\.recipient_id AND ar\.alert_id=d\.alert_id/);
assert.match(handler, /JOIN platform_alerts a ON a\.id=d\.alert_id/);
assert.match(handler, /WHERE d\.alert_id=\?\$\{scope\.sql\}/);
assert.match(handler, /bind\(alertId, \...scope\.values\)/);
assert.match(handler, /LIMIT 300/);
assert.match(handler, /CASE WHEN d\.last_error IS NOT NULL THEN 1 ELSE 0 END hasError/);
assert.doesNotMatch(handler, /last_error lastError|d\.last_error\s*,/);
assert.match(source, /\/api\/alerting\/deliveries' && request\.method === 'GET'\) return listDeliveries/);
console.log('Alerting company-scoped delivery read model and safe error projection: 10/10 PASS');
