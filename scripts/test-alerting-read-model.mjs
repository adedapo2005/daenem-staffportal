import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../worker/alerting.ts', import.meta.url), 'utf8');
const attentionStart = source.indexOf('async function listAttention');
const attentionEnd = source.indexOf('async function listHistory', attentionStart);
const query = source.slice(attentionStart, attentionEnd);
assert.ok(query.includes('ar.delivered_at deliveredAt'));
assert.ok(query.includes('ar.viewed_at viewedAt'));
assert.ok(query.includes('ar.acknowledged_at recipientAcknowledgedAt'));
assert.ok(query.includes("status IN ('delivered','viewed')"));
assert.ok(query.includes("status='failed'"));
assert.ok(query.includes('MAX(COALESCE(delivered_at,sent_at,updated_at)) lastDeliveryUpdateAt'));
assert.ok(query.includes('ar.employee_id=?'));
assert.ok(query.includes('WHERE recipient_id IN (SELECT id FROM platform_alert_recipients WHERE employee_id=?)'));
assert.ok(query.includes('bind(context.employee.id, context.employee.id, ...scope.values, ...recipientValues)'));
console.log('Alerting recipient delivery/freshness projection: 9/9 PASS');