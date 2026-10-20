import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/stage1-accessible-metrics.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function metric({ label = 'N1,455,000', animation = true, role } = {}) {
  const attrs = new Map([['aria-label', label]]);
  if (role) attrs.set('role', role);
  return {
    attrs,
    hasAttribute(key) { return attrs.has(key); },
    getAttribute(key) { return attrs.get(key) ?? null; },
    setAttribute(key, value) { attrs.set(key, value); },
    removeAttribute(key) { attrs.delete(key); },
    querySelector(selector) {
      return selector === ':scope > span[aria-hidden="true"]' && animation ? {} : null;
    },
  };
}

function harness(initial = []) {
  const elements = [...initial];
  const callbacks = [];
  let effect;
  let observer;
  let frame;
  const root = { querySelectorAll: () => elements };
  const doc = {
    body: { nodeName: 'BODY' },
    querySelector: () => root,
  };
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; observer = this; }
    observe(rootNode, opts) { this.rootNode = rootNode; this.options = opts; }
    disconnect() { this.disconnected = true; }
    signal() { this.callback([{ type: 'childList' }]); }
  }
  const exports = {};
  const moduleFactory = new Function('require','exports','document','MutationObserver',
    'requestAnimationFrame','cancelAnimationFrame',compiled);
  moduleFactory(
    name => {
      assert.equal(name, 'react');
      return { useEffect(callback) { effect = callback; callbacks.push(callback); } };
    }, exports, doc, FakeMutationObserver,
    fn => { frame = fn; return 1; },
    () => { frame = undefined; },
  );
  return {
    component: exports.default, nodes: elements, callbacks,
    mount() { return effect(); }, getObserver() { return observer; },
    flush() { const f = frame; frame = undefined; f?.(); },
  };
}

test('Stage 1 preserves a final accessible KPI amount without changing the animated text', () => {
  const amount = metric();
  const skipped = metric({ animation:false });
  const existing = metric({ role:'img' });
  const h = harness([amount, skipped, existing]);
  assert.equal(h.component({enabled:true}), null);
  const cleanup = h.mount();
  assert.equal(amount.getAttribute('role'), 'img');
  assert.equal(amount.getAttribute('aria-label'), 'N1,455,000');
  assert.equal(skipped.getAttribute('role'), null);
  assert.equal(existing.getAttribute('role'), 'img');
  cleanup();
  assert.equal(amount.getAttribute('role'), null);
  assert.equal(amount.getAttribute('aria-label'), 'N1,455,000');
  assert.equal(existing.getAttribute('role'), 'img', 'pre-existing roles cannot be removed during rollback');
});

test('Stage 1 normalizes late mounted metric elements and restores them on rollback', () => {
  const first = metric({label:'N100'});
  const h = harness([first]);
  h.component({enabled:true});
  const cleanup = h.mount();
  const late = metric({label:'N200'});
  h.nodes.push(late);
  h.getObserver().signal();
  h.flush();
  assert.equal(late.getAttribute('role'), 'img');
  assert.equal(late.getAttribute('aria-label'), 'N200');
  cleanup();
  assert.equal(late.getAttribute('role'), null);
  assert.equal(first.getAttribute('role'), null);
  assert.equal(h.getObserver().disconnected, true);
});

test('Stage 1 accessibility adapter is inert when rollback is already selected', () => {
  const original = metric();
  const h = harness([original]);
  h.component({enabled:false});
  assert.equal(h.mount(), undefined);
  assert.equal(original.getAttribute('role'), null);
  assert.equal(h.getObserver(), undefined);
});
