import fs from 'node:fs';
import assert from 'node:assert/strict';

const runtime = fs.readFileSync(new URL('../src/qa-review-v115-runtime.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/stage1-finance-workbench.css', import.meta.url), 'utf8');

const checks = [
  ['runtime imports the finance workbench layer', runtime.includes("import './stage1-finance-workbench.css';")],
  ['finance workbench is scoped to retained V115 bright presentation', css.includes('[data-approved-postlogin="qa-review-v115"][data-stage1-palette="bright"]')],
  ['toolbar becomes a bounded command surface', css.includes('.p-finance-toolbar') && css.includes('border-radius: 12px')],
  ['finance ribbon uses responsive semantic metric grid', css.includes('.p-finance-ribbon') && css.includes('repeat(auto-fit, minmax(150px, 1fr))')],
  ['finance analysis and control panels receive asymmetric desktop hierarchy', css.includes('minmax(0, 1.28fr) minmax(280px, .72fr)')],
  ['tablet/mobile finance panels stack without horizontal composition dependency', css.includes('@media (max-width: 1024px)') && css.includes('grid-template-columns: minmax(0, 1fr)')],
  ['mobile finance metrics remain bounded two-column summaries', css.includes('@media (max-width: 640px)') && css.includes('repeat(2, minmax(0, 1fr))')],
  ['forced colours retain system canvas boundaries', css.includes('@media (forced-colors: active)') && css.includes('CanvasText')],
];

for (const [name, pass] of checks) {
  assert.ok(pass, name);
  console.log('PASS ' + name);
}
console.log('Stage 1 Finance workbench checks passed: ' + checks.length + '/' + checks.length + '.');
