import fs from 'node:fs';
import assert from 'node:assert/strict';
const runtime=fs.readFileSync(new URL('../src/qa-review-v115-runtime.tsx',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/stage1-forms-workbench.css',import.meta.url),'utf8');
const checks=[
 ['runtime imports Forms workbench layer',runtime.includes("import './stage1-forms-workbench.css';")],
 ['form shelf uses responsive cards',css.includes('.p-form-shelf')&&css.includes('repeat(auto-fit, minmax(240px, 1fr))')],
 ['form cards retain keyboard focus treatment',css.includes('.p-form-shelf > button:focus-visible')],
 ['field controls have shared focus anatomy',css.includes('.p-field :is(input, textarea, select):focus-visible')],
 ['validation alerts use explicit treatment',css.includes('.p-form-error')&&css.includes('[role="alert"]')],
 ['success feedback is visually distinct',css.includes('.p-form-feedback')],
 ['mobile form shelf becomes one-column task list',css.includes('@media (max-width: 760px)')&&css.includes('grid-template-columns: minmax(0, 1fr)')],
 ['reduced motion and forced colours are handled',css.includes('@media (prefers-reduced-motion: reduce)')&&css.includes('@media (forced-colors: active)')],
];
for(const [name,pass] of checks){assert.ok(pass,name);console.log('PASS '+name)}
console.log('Stage 1 Forms workbench checks passed: '+checks.length+'/'+checks.length+'.');
