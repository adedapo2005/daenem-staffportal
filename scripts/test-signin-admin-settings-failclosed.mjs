import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Frontend-owned synthetic-response regression; no real auth/provider/Worker requests.
const source = readFileSync(new URL('../src/signin-preferences.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const fixtures = [
  { name: 'admin GET rejects HTML 200', action: 'get', status: 200, body: '<!doctype html><title>SPA</title>', success: false },
  { name: 'admin GET rejects empty JSON 200', action: 'get', status: 200, body: '{}', success: false },
  { name: 'admin GET rejects forged manage string', action: 'get', status: 200, body: JSON.stringify({ config: {}, canManage: 'yes' }), success: false },
  { name: 'admin GET rejects array configuration', action: 'get', status: 200, body: JSON.stringify({ config: [], canManage: true }), success: false },
  { name: 'admin GET rejects denied HTTP', action: 'get', status: 403, body: '{"error":"Denied"}', success: false },
  { name: 'admin GET accepts read-only access', action: 'get', status: 200, body: JSON.stringify({ config: {}, canManage: false }), success: true, canManage: false },
  { name: 'admin GET accepts authorized access', action: 'get', status: 200, body: JSON.stringify({ config: {}, canManage: true }), success: true, canManage: true },
  { name: 'save rejects HTML 200', action: 'save', status: 200, body: '<html>fallback</html>', success: false },
  { name: 'save rejects unconfirmed JSON 200', action: 'save', status: 200, body: JSON.stringify({ config: {} }), success: false },
  { name: 'save rejects wrong configuration type', action: 'save', status: 200, body: JSON.stringify({ ok: true, config: [] }), success: false },
  { name: 'save rejects unauthorized HTTP', action: 'save', status: 403, body: '{"error":"Denied"}', success: false },
  { name: 'save accepts confirmed backend envelope', action: 'save', status: 200, body: JSON.stringify({ ok: true, config: {} }), success: true },
];

let passed = 0;
for (const fixture of fixtures) {
  const values = new Map();
  const module = { exports: {} };
  const methods = [];
  const environment = {
    module, exports: module.exports, Headers, Response, URL, Date, Intl, Set, Map,
    fetch: async (path, init) => {
      assert.equal(path, '/api/theme/signin');
      assert.equal(init.credentials, 'include');
      assert.equal(init.cache, 'no-store');
      methods.push(init.method || 'GET');
      return new Response(fixture.body, { status: fixture.status });
    },
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
    window: { dispatchEvent() {} },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  };
  vm.runInNewContext(compiled, environment, { filename: 'signin-preferences-transpiled.js' });
  let result, error;
  try {
    result = fixture.action === 'get'
      ? await module.exports.fetchAdminSignInPreferences()
      : await module.exports.saveSignInPreferences({});
  } catch (caught) { error = caught; }
  assert.deepEqual(methods, [fixture.action === 'get' ? 'GET' : 'POST'], fixture.name);
  if (fixture.success) {
    assert.equal(error, undefined, fixture.name);
    assert.equal((fixture.action === 'get' ? result.config : result).schemaVersion, 3);
    if (fixture.action === 'get') assert.equal(result.canManage, fixture.canManage);
    assert.ok(values.has('daenem-signin-experience-v2'), fixture.name);
  } else {
    assert.ok(error instanceof Error || typeof error?.message === 'string', fixture.name);
    assert.equal(values.size, 0, 'unconfirmed response must not modify local preferences');
  }
  passed++;
  console.log('PASS: ' + fixture.name);
}
console.log('SIGNIN_ADMIN_SETTINGS_FAIL_CLOSED=' + passed + '/' + fixtures.length + ' PASS');
