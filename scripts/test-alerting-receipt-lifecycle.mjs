import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const source = await readFile(new URL('../worker/alerting.ts', import.meta.url), 'utf8');
const start = source.indexOf("async function receipt(");
const end = source.indexOf('async function listRules', start);
const receipt = source.slice(start, end);
assert.match(receipt, /alert\.status === 'resolved'.*return json\(\{ error: 'Resolved alerts cannot be updated\.' \}, 409\)/s);
assert.match(receipt, /WHERE id=\? AND status<>'resolved'/);
assert.ok(receipt.includes('Number(writes[0]?.meta?.changes || 0) !== 1'));
assert.match(receipt, /resultingStatus = action === 'action' \? 'actioned' : \['open', 'reopened'\]\.includes\(alert\.status\) \? 'acknowledged' : alert\.status/);
assert.match(receipt, /status: resultingStatus/);
console.log('Alert receipt lifecycle guards: 5/5 PASS');
