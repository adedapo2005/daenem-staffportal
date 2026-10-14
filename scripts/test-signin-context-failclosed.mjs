import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/signin-preferences.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const cases = [
  { name: 'HTML success is not public context', status: 200, body: '<!doctype html><title>SPA fallback</title>', valid: false },
  { name: 'empty JSON success is not public context', status: 200, body: '{}', valid: false },
  { name: 'array success is not public context', status: 200, body: '[]', valid: false },
  { name: 'missing news array denies', status: 200, body: JSON.stringify({ config: {}, inspiration: '', motivation: '', generatedAt: 'now', source: 'fallback' }), valid: false },
  { name: 'malformed news item denies', status: 200, body: JSON.stringify({ config: {}, inspiration: '', motivation: '', news: [{}], generatedAt: 'now', source: 'fallback' }), valid: false },
  { name: 'malformed configuration denies', status: 200, body: JSON.stringify({ config: [], inspiration: '', motivation: '', news: [], generatedAt: 'now', source: 'fallback' }), valid: false },
  { name: 'valid server-shaped context succeeds', status: 200, body: JSON.stringify({ config: {}, inspiration: 'Safe copy', motivation: 'Safe copy', news: [{ title: 'Public item', category: 'Portal', source: 'Daenem' }], generatedAt: new Date(0).toISOString(), source: 'fallback' }), valid: true },
];

let checked = 0;
for (const fixture of cases) {
  const values = new Map();
  const module = { exports: {} };
  const mockWindow = { dispatchEvent() {} };
  const environment = {
    module,
    exports: module.exports,
    Headers,
    Response,
    URL,
    Date,
    Intl,
    Set,
    Map,
    fetch: async (path, init) => {
      assert.equal(path, '/api/context/signin');
      assert.equal(init.credentials, 'include');
      assert.equal(init.cache, 'no-store');
      return new Response(fixture.body, { status: fixture.status });
    },
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
    window: mockWindow,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  };
  vm.runInNewContext(compiled, environment, { filename: 'signin-preferences-transpiled.js' });
  let output;
  let error;
  try {
    output = await module.exports.fetchPublicSignInContext();
  } catch (caught) {
    error = caught;
  }
  if (fixture.valid) {
    assert.equal(error, undefined, fixture.name);
    assert.equal(output.news.length, 1);
    assert.equal(output.config.schemaVersion, 3);
    assert.ok(values.has('daenem-signin-experience-v2'));
  } else {
    assert.equal(error?.message, 'Sign-In information is temporarily unavailable.', fixture.name);
    assert.equal(values.size, 0, 'invalid response must not change cached preferences');
  }
  checked++;
  console.log('PASS: ' + fixture.name);
}
console.log('SIGNIN_CONTEXT_FAIL_CLOSED=' + checked + '/' + cases.length + ' PASS');
