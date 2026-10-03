import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../worker/alerting.ts', import.meta.url), 'utf8');
const start = source.indexOf('function validPlatformEvent(');
const end = source.indexOf('\nasync function resolveRecipients', start);
assert.ok(start >= 0 && end > start, 'central platform event validator exists');
const snippet = source.slice(start, end).replace('function validPlatformEvent(', 'export function validPlatformEvent(');
const javascript = ts.transpileModule(snippet, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { validPlatformEvent } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`);

const valid = { module: 'storage', eventType: 'mirror.failed', sourceType: 'storage_mirror_job',
  companyId: 'company-printing', sourceId: 'mirror-1', title: 'Backup needs attention',
  summary: 'A secondary copy needs review.', relatedPath: '/admin/storage' };
assert.equal(validPlatformEvent(valid), true);
assert.equal(validPlatformEvent({ ...valid, recipientTarget: { employeeId: 'employee-1', permission: 'communications.support.inbox.view' } }), true);
assert.equal(validPlatformEvent({ ...valid, recipientTarget: { employeeId: '', permission: 'communications.support.inbox.view' } }), false);
assert.equal(validPlatformEvent({ ...valid, recipientTarget: { employeeId: 'employee-1', permission: '' } }), false);
assert.equal(validPlatformEvent({ ...valid, title: '' }), false);
assert.equal(validPlatformEvent({ ...valid, title: 'x'.repeat(161) }), false);
assert.equal(validPlatformEvent({ ...valid, summary: 'x'.repeat(2001) }), false);
assert.equal(validPlatformEvent({ ...valid, relatedPath: 'https://outside.example/path' }), false);
assert.equal(validPlatformEvent({ ...valid, relatedPath: '//outside.example/path' }), false);
assert.equal(validPlatformEvent({ ...valid, relatedPath: '/admin/../private' }), false);
assert.equal(validPlatformEvent({ ...valid, occurredAt: 'not-a-time' }), false);
assert.equal(validPlatformEvent({ ...valid, payload: { data: 'x'.repeat(16_385) } }), false);
console.log('Alerting event input boundary: 12/12 PASS');
