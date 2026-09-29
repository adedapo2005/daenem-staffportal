import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../migrations/0085_alert_delivery_provider_required.sql', import.meta.url), 'utf8');
const source = await readFile(new URL('../worker/alerting.ts', import.meta.url), 'utf8');
const createStart = source.indexOf('async function createRecipientDeliveries');
const createEnd = source.indexOf('\nfunction companyScope', createStart);
const create = source.slice(createStart, createEnd);

assert.match(migration, /status IN \('queued','provider_required','sending','sent','delivered','viewed','failed','cancelled'\)/);
assert.match(migration, /INSERT INTO platform_alert_deliveries_next[\s\S]*?FROM platform_alert_deliveries/);
assert.match(migration, /DROP TABLE platform_alert_deliveries;[\s\S]*ALTER TABLE platform_alert_deliveries_next RENAME TO platform_alert_deliveries/);
assert.match(create, /\? 'queued' : 'provider_required'/);
assert.match(create, /if \(channel === 'in_app' \|\| channel === 'web_push' \|\| channel === 'screen_popup'\)/);
assert.doesNotMatch(create, /channel === 'email' \|\| channel === 'whatsapp'/);

console.log('Alert external provider-required truth state: PASS');
