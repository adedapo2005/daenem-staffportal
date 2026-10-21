import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const component = readFileSync(new URL('../src/stage1-workflow-focus.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/stage1-workflow-focus.css', import.meta.url), 'utf8');

const checks = [];
function check(name, fn) {
  try { fn(); checks.push({ name, pass: true }); console.log('PASS ' + name); }
  catch (error) { checks.push({ name, pass: false, error: error.message }); console.error('FAIL ' + name + ': ' + error.message); }
}

check('role home has distinct Employee, Manager and Owner information architecture', () => {
  for (const value of ['EMPLOYEE HOME','MANAGER HOME','OWNER COMMAND CENTER','My Work & Next Actions','Team Rhythm & Follow-Through','Business Health & Control']) {
    assert.ok(component.includes(value), 'missing ' + value);
  }
});

check('role home destinations remain permission-projected from Enterprise Command Center', () => {
  assert.ok(component.includes("document.querySelectorAll<HTMLAnchorElement>('.p-sidebar .ecc-page-link[href]')"));
  assert.ok(component.includes(".filter(a=>a.getAttribute('aria-disabled')!=='true')"));
  assert.ok(component.includes('authorized.filter(a=>a.href===href'));
});

check('role home cannot introduce arbitrary record or management links', () => {
  assert.ok(!component.includes('fetch('), 'role surface must not fetch a second authorization source');
  assert.ok(!component.includes('localStorage'), 'role surface must not persist a second authorization state');
  assert.ok(component.includes('Only workspaces already authorized for your current company role are shown here.'));
});

check('role home is limited to general landing workspaces', () => {
  assert.ok(component.includes('["/home","/work"].includes(pathname)'));
  assert.ok(component.includes("const home = pathname === '/home'"));
});

check('role home remains opaque and supports mobile plus large text reflow', () => {
  assert.ok(css.includes('.stage1-workflow-focus.stage1-role-home'));
  assert.ok(css.includes('background: var(--stage1-surface'));
  assert.ok(!css.includes('backdrop-filter'), 'glass/blur is not allowed in this Stage 1 layer');
  assert.ok(css.includes('@media (max-width: 720px)'));
  assert.ok(css.includes('[data-large-text="true"] .stage1-workflow-focus.stage1-role-home'));
});

const failed = checks.filter((item) => !item.pass);
if (failed.length) process.exitCode = 1;
else console.log('Stage 1 role-home contract passed: ' + checks.length + '/' + checks.length + '.');
