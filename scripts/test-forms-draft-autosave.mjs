import test from 'node:test';
import assert from 'node:assert/strict';
import { createLatestFormsDraftWriter } from '../src/forms-draft-autosave.ts';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('rapid keystrokes persist exactly the latest snapshot', async () => {
  const writes = [], errors = [];
  const writer = createLatestFormsDraftWriter(async (id, draft) => { writes.push([id, draft.value]); }, (id, e) => errors.push([id, e]), 30);
  for (let i = 0; i < 80; i++) assert.equal(writer.schedule('assignment-a', { value: i }), true);
  assert.equal(writer.hasUnsaved(), true);
  await writer.flush('assignment-a');
  await sleep(45);
  assert.deepEqual(writes, [['assignment-a', 79]]);
  assert.deepEqual(errors, []);
  assert.equal(writer.hasUnsaved(), false);
  writer.dispose();
});

test('one writer serializes saves across different assignments', async () => {
  const entries = [], failures = [];
  let inFlight = 0, maximum = 0;
  const writer = createLatestFormsDraftWriter(async (id, draft) => {
    inFlight++; maximum = Math.max(maximum, inFlight);
    entries.push(id + ':' + draft.companyId);
    await sleep(10);
    inFlight--;
  }, (...args) => failures.push(args), 30);
  writer.schedule('printing', { companyId: 'printing' });
  const p = writer.flush('printing');
  writer.schedule('bakery', { companyId: 'bakery' });
  const q = writer.flush('bakery');
  await Promise.all([p, q]);
  assert.equal(maximum, 1);
  assert.deepEqual(entries, ['printing:printing', 'bakery:bakery']);
  assert.deepEqual(failures, []);
  writer.dispose();
});

test('submission barrier drains in-flight draft then discards delayed stale draft', async () => {
  const started = deferred(), unblock = deferred(), writes = [];
  const writer = createLatestFormsDraftWriter(async (id, draft) => {
    writes.push(id + ':' + draft.value);
    if (draft.value === 'old') { started.resolve(); await unblock.promise; }
  }, () => assert.fail('Unexpected write error'), 10);
  writer.schedule('assignment-a', { value: 'old' });
  const first = writer.flush('assignment-a');
  await started.promise;
  writer.schedule('assignment-a', { value: 'stale-after-submit' });
  const barrier = writer.suspend('assignment-a');
  unblock.resolve();
  await Promise.all([first, barrier]);
  assert.equal(writer.isSuspended('assignment-a'), true);
  assert.equal(writer.schedule('assignment-a', { value: 'not-saved-while-pending' }), false);
  await sleep(30);
  assert.deepEqual(writes, ['assignment-a:old']);
  writer.resume('assignment-a');
  writer.schedule('assignment-a', { value: 'new-after-error' });
  await writer.flush('assignment-a');
  assert.deepEqual(writes, ['assignment-a:old', 'assignment-a:new-after-error']);
  writer.dispose();
});

test('temporary storage failures are reported and newer drafts supersede older snapshots', async () => {
  const failures = [], saved = [];
  let fail = true;
  const writer = createLatestFormsDraftWriter(async (id, draft) => {
    if (fail) throw Error('Another tab is saving');
    saved.push(draft.value);
  }, (id, error) => failures.push({id, message:error.message}), 30);
  writer.schedule('assignment-a', { value: 'previous' });
  await assert.rejects(writer.flush('assignment-a'), /Another tab/);
  assert.equal(writer.hasUnsaved(), true);
  fail = false;
  writer.schedule('assignment-a', { value: 'latest' });
  await writer.flush('assignment-a');
  assert.deepEqual(saved, ['latest']);
  assert.deepEqual(failures, [{id:'assignment-a', message:'Another tab is saving'}]);
  writer.dispose();
});

test('flushing multiple forms waits for all queued writes', async () => {
  const saved = [];
  const writer = createLatestFormsDraftWriter(async (id, draft) => { await sleep(6); saved.push(id + ':' + draft.value); }, () => {}, 300);
  writer.schedule('a', { value: 1 });
  writer.schedule('b', { value: 2 });
  await writer.flushAll();
  assert.deepEqual(saved, ['a:1', 'b:2']);
  assert.equal(writer.hasUnsaved(), false);
  writer.dispose();
});

test('permission or session scope disposal cancels unsaved timers and prohibits reuse', async () => {
  const saved = [];
  const writer = createLatestFormsDraftWriter(async (id, draft) => { saved.push(draft.value); }, () => {}, 5);
  writer.schedule('assignment-a', { value: 'old-permission' });
  writer.dispose();
  await sleep(30);
  assert.deepEqual(saved, []);
  assert.equal(writer.schedule('assignment-a', { value: 'unauthorised' }), false);
});
