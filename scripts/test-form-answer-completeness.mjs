import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkFormAnswerCompleteness as check } from '../worker/form-answer-completeness.ts';

const fields = [
  { key: 'result', label: 'Result', type: 'select', required: true },
  { key: 'quantity', label: 'Quantity', type: 'number', required: true },
  { key: 'recorded', label: 'Recorded date', type: 'date', required: true },
  { key: 'confirmed', label: 'Confirmed', type: 'checkbox', required: true },
  { key: 'notes', label: 'Notes', type: 'textarea' },
];
const valid = { result: 'Pass', quantity: '0', recorded: '2024-02-29', confirmed: true };

function expect(code, answers, policy, schema = fields) {
  const result = check(schema, answers, policy);
  assert.equal(result?.code, code, JSON.stringify(result));
  return result;
}

test('accepts numeric zero, leap-day date and true acknowledgement', () => {
  assert.equal(check(fields, valid), null);
  assert.equal(check(fields, { ...valid, quantity: '-1.25' }), null);
  assert.equal(check(fields, { ...valid, quantity: 2000 }), null);
});
test('rejects missing and unchecked required values', () => {
  assert.equal(expect('FORM_FIELD_REQUIRED', { ...valid, confirmed: false }).field, 'confirmed');
  assert.equal(expect('FORM_FIELD_REQUIRED', { ...valid, quantity: '' }).field, 'quantity');
  assert.equal(expect('FORM_FIELD_REQUIRED', { ...valid, result: '  ' }).field, 'result');
  assert.equal(expect('FORM_FIELD_REQUIRED', { ...valid, confirmed: null }).field, 'confirmed');
});
test('validates numeric, date, checkbox and text types without coercion', () => {
  for (const quantity of ['oops', '0x10', 'Infinity', '1e999', '1e-999', {}, [], true, 1e30])
    expect('FORM_ANSWER_INVALID', { ...valid, quantity });
  for (const recorded of ['2023-02-29', '2024-02-30', '2024/02/29', 1709164800])
    expect('FORM_ANSWER_INVALID', { ...valid, recorded });
  expect('FORM_FIELD_REQUIRED', { ...valid, confirmed: 'true' });
  expect('FORM_ANSWER_INVALID', { ...valid, notes: { text: 'hello' } });
  expect('FORM_ANSWER_INVALID', { ...valid, notes: 'x'.repeat(65537) });
});
test('rejects malformed payloads and extra fields', () => {
  for (const response of [null, [], 'hello', 0]) expect('FORM_ANSWER_INVALID', response);
  expect('FORM_ANSWER_INVALID', { ...valid, otherCompany: 'unapproved' });
  expect('FORM_ANSWER_INVALID', JSON.parse('{"result":"Pass","quantity":"1","recorded":"2024-02-29","confirmed":true,"__proto__":"admin"}'));
});
test('does not accept fabricated file, photo, signature or location evidence', () => {
  for (const type of ['file', 'photo', 'signature', 'location'])
    expect('FORM_EVIDENCE_UNSUPPORTED', { evidence: 'fake-ref' }, {}, [{ key: 'evidence', label: 'Evidence', type, required: true }]);
  expect('FORM_EVIDENCE_UNSUPPORTED', {}, {}, [{ key: 'evidence', label: 'Evidence', type: 'file', required: true }]);
  expect('FORM_EVIDENCE_UNSUPPORTED', valid, { requirePhoto: true });
  expect('FORM_EVIDENCE_UNSUPPORTED', valid, { requireSignature: true });
});
test('validates bounded GPS for explicitly location-required forms', () => {
  assert.equal(check(fields, valid, { requireLocation: true, latitude: 7.38, longitude: 3.95, accuracy: 13 }), null);
  for (const [latitude, longitude, accuracy] of [[91,3,13],[7,-181,13],[NaN,3,13],[7,3,-1],[7,3,Infinity]])
    expect('FORM_LOCATION_INVALID', valid, { requireLocation: true, latitude, longitude, accuracy });
  expect('FORM_LOCATION_INVALID', valid, { requireLocation: true });
});
test('fails closed on corrupt or dangerous schemas', () => {
  expect('FORM_SCHEMA_INVALID', valid, {}, []);
  expect('FORM_SCHEMA_INVALID', {}, {}, [{ key: '__proto__', label: 'Proto', type: 'text' }]);
  expect('FORM_SCHEMA_INVALID', valid, {}, [{ key: 'confirmed', label: 'Confirmed', type: 'boolean' }]);
  expect('FORM_SCHEMA_INVALID', valid, {}, [{ key: 'confirmed', label: 'Confirmed', type: 'checkbox' },{ key: 'confirmed', label: 'Again', type: 'checkbox' }]);
});
test('submission gate remains ahead of writes and retains company/permission checks', () => {
  const source = readFileSync(new URL('../worker/forms.ts', import.meta.url), 'utf8');
  const gateIndex = source.indexOf('checkFormAnswerCompleteness(schema,body.responses');
  const writeIndex = source.indexOf('INSERT INTO workflow_form_submissions');
  assert.ok(gateIndex >= 0 && writeIndex > gateIndex, 'typed completeness must run before persistence');
  assert.match(source, /if\(!minePayload\.assignments\?\.some/);
  assert.match(source, /hasPermission\(context,'forms\.access'/);
  assert.match(source, /wf\.require_photo AS requirePhoto/);
  assert.match(source, /wf\.require_signature AS requireSignature/);
});
