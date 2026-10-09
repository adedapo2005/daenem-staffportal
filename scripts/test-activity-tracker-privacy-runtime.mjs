import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/activity-tracker-entry.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
}}).outputText;
const listeners = { window: new Map(), document: new Map() };
const sent = [];
const authReads = [];
let ticks = 100000;
let apiResult = () => Promise.resolve({ authenticated: true, context: { employee: { id: 'qa-employee' } } });
const add = (scope) => (type, listener) => {
  const entries = listeners[scope].get(type) || [];
  entries.push(listener);
  listeners[scope].set(type, entries);
};
const dispatch = (scope, type, event = {}) => {
  for (const listener of listeners[scope].get(type) || []) listener(event);
};
class Element {
  constructor(tagName = 'BUTTON', label = '', form = null, privateNode = false) {
    this.tagName = tagName;
    this.label = label;
    this.form = form;
    this.privateNode = privateNode;
    this.textContent = label;
  }
  getAttribute(name) { return name === 'aria-label' ? this.label : null; }
  closest(selector) {
    if (selector === 'button,a,[role="button"]') return this.tagName === 'BUTTON' || this.tagName === 'A' ? this : null;
    if (selector === 'form') return this.form;
    if (selector.includes('.signin-page')) return this.privateNode ? this : null;
    return null;
  }
}
class HTMLFormElement extends Element {
  constructor(hasSecret = false, action = '') { super('FORM', action); this.hasSecret = hasSecret; }
  querySelector(selector) { return this.hasSecret && selector.includes('password') ? {} : null; }
}
const windowObject = {
  location: { pathname: '/staff/records/employee-secret-42' },
  addEventListener: add('window'),
};
const context = {
  window: windowObject,
  document: { addEventListener: add('document') },
  Element, HTMLFormElement,
  Date: { now: () => ticks },
  fetch: (url, options = {}) => {
    if (url === '/api/auth/me') {
      authReads.push(options);
      return Promise.resolve(apiResult()).then(value => ({ ok: true, json: async () => value }));
    }
    sent.push({ url, ...JSON.parse(JSON.stringify(options)), payload: JSON.parse(options.body) });
    return Promise.resolve({ ok: true });
  },
  require: (name) => { assert.equal(name, './auth'); return { api: () => apiResult() }; },
  exports: {}, console,
};
vm.runInNewContext(compiled, context, { filename: 'activity-tracker-entry.compiled.cjs' });
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };
let pass = 0;
function check(name, fn) { fn(); console.log('PASS ' + name); pass++; }
const click = (label, form = null) => { ticks += 2000; dispatch('document', 'click', { target: new Element('BUTTON', label, form) }); };
await flush();
checkAuthRead();
function checkAuthRead() {
  assert.ok(authReads.length > 0, 'Initial authority read missing');
  assert.ok(authReads.every(options => options.cache === 'no-store' && options.credentials === 'include'));
}

click('save');
check('approved action emits minimized module telemetry', () => {
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, '/api/activity/record');
  assert.equal(sent[0].payload.path, '/staff');
  assert.deepEqual(Object.keys(sent[0].payload.metadata).sort(), ['control', 'tag']);
  assert.equal(sent[0].payload.metadata.control, 'save');
  assert.ok(!JSON.stringify(sent).includes('employee-secret-42'));
});
click('delete', new HTMLFormElement(true));
check('credential-form controls never log clicks', () => assert.equal(sent.length, 1));
dispatch('window', 'daenem-auth-changed');
click('export');
check('auth-change event immediately revokes client telemetry', () => assert.equal(sent.length, 1));
let pending;
apiResult = () => new Promise(resolve => { pending = resolve; });
dispatch('window', 'focus');
click('archive');
check('pending authentication refresh fails closed', () => assert.equal(sent.length, 1));
dispatch('window', 'daenem-auth-changed');
pending({ authenticated: true, context: { employee: { id: 'stale-employee' } } });
await flush();
click('publish');
check('stale authentication response cannot restore collection', () => assert.equal(sent.length, 1));
apiResult = () => Promise.resolve({ authenticated: true, context: { employee: { id: 'qa-employee' } } });
dispatch('window', 'focus');
await flush();
click('download');
check('explicit refreshed authority restores whitelisted audit', () => assert.equal(sent.length, 2));
windowObject.location.pathname = '/forgot-password';
click('submit');
check('account recovery route is suppressed', () => assert.equal(sent.length, 2));
windowObject.location.pathname = '/staff/records/secret-99';
click('Save Alice Salary');
check('unapproved label text is never transmitted', () => assert.equal(sent.length, 2));
const secretForm = new HTMLFormElement(true);
dispatch('document', 'submit', { target: secretForm });
check('credential form submission is suppressed', () => assert.equal(sent.length, 2));
check('every authority refresh bypasses shared 15-second auth cache', () => checkAuthRead());
console.log('Activity tracker client privacy runtime: ' + pass + '/' + pass + ' PASS');
