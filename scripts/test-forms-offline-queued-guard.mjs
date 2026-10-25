import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

/**
 * Executes the REAL encrypted-offline upsert function with in-memory stores:
 * no duplicate implementation of the state guard under test.
 */
const source = readFileSync(new URL('../src/offline-platform.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('offline-platform.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
let original;
function walk(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'upsertOperationUnlocked') original = node;
  ts.forEachChild(node, walk);
}
walk(parsed);
assert.ok(original, 'Authoritative offline upsert function must be available');

const compiled = ts.transpileModule(original.getText(parsed), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const identity = { employeeId: 'staff-a', companyId: 'company-a' };
const namespace = 'staff-a:company-a';
function operation(kind, state) {
  return {
    id: 'operation-1', namespace, kind, state,
    employeeId: identity.employeeId, companyId: identity.companyId,
    entityType: 'workflow_form_assignment', entityId: 'form-a',
    idempotencyKey: 'same-key', capturedAt: '2026-10-25T00:00:00.000Z',
    clientTimezone: 'Africa/Lagos', attemptCount: 0,
    attachmentRefs: [], dependencyRefs: [], encryptedPayload: { iv: [], ciphertext: [] },
    createdAt: '2026-10-25T00:00:00.000Z', updatedAt: '2026-10-25T00:00:00.000Z',
  };
}
async function run(current, nextKind, nextState) {
  const writes = [];
  const helpers = {
    namespaceFor: () => namespace,
    readRecord: async () => current,
    existingForEntity: async () => current,
    nowIso: () => '2026-10-25T00:01:00.000Z',
    strongId: () => 'new-operation',
    clientTimezone: () => 'Africa/Lagos',
    encryptJson: async () => ({ iv: [], ciphertext: [] }),
    writeRecord: async (_store, value) => { writes.push(value); },
    notifyOfflineChange: () => {},
    publicOperation: item => item,
    OPERATION_STORE: 'operations',
  };
  const implementation = new Function(...Object.keys(helpers), compiled + '\nreturn upsertOperationUnlocked;')(...Object.values(helpers));
  const input = {
    kind: nextKind, entityType: 'workflow_form_assignment',
    entityId: 'form-a', state: nextState,
    payload: { responses: { answer: 'later edit' } },
  };
  try {
    const result = await implementation(identity, input);
    return { result, writes };
  } catch (error) {
    return { error, writes };
  }
}

test('second-tab autosave cannot revert waiting Forms submission to local draft', async () => {
  const result = await run(operation('forms.submit','waiting-to-sync'),'forms.submit','local-draft');
  assert.match(result.error?.message || '', /already been queued for sync/);
  assert.deepEqual(result.writes, []);
});
test('duplicate submit cannot replace payload under queued Forms idempotency key', async () => {
  const result = await run(operation('forms.submit','waiting-to-sync'),'forms.submit','waiting-to-sync');
  assert.match(result.error?.message || '', /already been queued for sync/);
  assert.deepEqual(result.writes, []);
});
test('actively syncing Forms submission cannot be rewritten', async () => {
  const result = await run(operation('forms.submit','syncing'),'forms.submit','local-draft');
  assert.match(result.error?.message || '', /already been queued for sync/);
  assert.deepEqual(result.writes, []);
});
test('ordinary Forms draft edits and needs-review corrections remain allowed', async () => {
  for (const state of ['local-draft','needs-review','failed-retryable']) {
    const result = await run(operation('forms.submit', state),'forms.submit','local-draft');
    assert.ok(result.result, 'Draft save must remain available for '+state);
    assert.equal(result.writes.length, 1);
    assert.equal(result.result.state, 'local-draft');
  }
});
test('non-Forms offline operations are unaffected', async () => {
  const result = await run(operation('expense.draft.save','waiting-to-sync'),'expense.draft.save','local-draft');
  assert.ok(result.result);
  assert.equal(result.writes.length, 1);
});
test('cross-company offline scope mismatch still fails closed before a write', async () => {
  const other = { ...operation('forms.submit','local-draft'), namespace:'staff-a:company-other' };
  const result = await run(other,'forms.submit','local-draft');
  assert.match(result.error?.message || '', /scope mismatch/);
  assert.deepEqual(result.writes, []);
});
