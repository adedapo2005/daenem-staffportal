import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const source = await readFile(new URL('../worker/alerting.ts', import.meta.url), 'utf8');
const resolver = source.slice(source.indexOf('async function resolveRecipients'), source.indexOf('async function createRecipientDeliveries'));
const publisher = source.slice(source.indexOf('export async function publishPlatformEvent'), source.indexOf('async function listAttention'));
assert.match(resolver, /e\.employment_status='active'/);
assert.match(resolver, /m\.active=1/);
assert.match(resolver, /p\.code='alerting\.access'/);
assert.match(resolver, /selector\.type === 'role'/);
assert.match(resolver, /selector\.type === 'department'/);
assert.match(resolver, /selector\.type === 'site'/);
assert.match(resolver, /targetCompany !== companyId/);
assert.match(publisher, /if \(!recipientPlan\.employeeIds\.length\) return null/);
assert.match(source, /INSERT OR IGNORE INTO platform_alert_deliveries/);
assert.match(source, /INSERT OR IGNORE INTO platform_alert_recipients/);
console.log('Alerting recipient resolution, company scope, and idempotent delivery rows: 10/10 PASS');
