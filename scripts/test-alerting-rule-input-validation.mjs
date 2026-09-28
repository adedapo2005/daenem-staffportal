import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/alerting.ts', import.meta.url), 'utf8');
assert.match(source, /function validAlertRuleAudience\(recipients: unknown, channels: unknown\)/);
assert.match(source, /const alertRecipientTypes = new Set\(\['user', 'role', 'department', 'business', 'site', 'all_authorized'\]\)/);
assert.match(source, /const alertChannels = new Set\(\['in_app', 'screen_popup', 'email', 'whatsapp', 'web_push'\]\)/);
assert.match(source, /recipients\.length < 1 \|\| recipients\.length > 100/);
assert.match(source, /new Set<string>\(\)/);
assert.match(source, /validAlertRuleAudience\(recipients, channels\)/);
assert.match(source, /Choose valid, unique alert recipients and delivery channels/);
assert.match(source, /body\.recipients === undefined \? \[\{ type: 'all_authorized' \}\]/);
assert.match(source, /name\.length > 120 \|\| !eventType \|\| eventType\.length > 120/);
assert.match(source, /!\['low', 'medium', 'high', 'critical'\]\.includes\(String\(severity\)\)/);
assert.match(source, /dedupWindowMinutes > 10080/);
assert.match(source, /!boundedObject\(conditions, 8192\) \|\| !boundedObject\(escalation, 8192\)/);
assert.match(source, /typeof body\.acknowledgementRequired !== 'boolean'/);
assert.match(source, /typeof body\.quietHoursOverride !== 'boolean'/);
console.log('Alerting rule audience and bounded-input validation: 14/14 PASS');
