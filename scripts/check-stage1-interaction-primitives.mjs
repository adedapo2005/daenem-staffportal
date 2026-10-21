import fs from 'node:fs';import assert from 'node:assert/strict';
const runtime=fs.readFileSync(new URL('../src/qa-review-v115-runtime.tsx',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/stage1-interaction-primitives.css',import.meta.url),'utf8');
const checks=[
['runtime imports interaction layer',runtime.includes("import './stage1-interaction-primitives.css';")],
['buttons have shared hierarchy/focus treatment',css.includes('.p-btn')&&css.includes('.p-btn.outline')&&css.includes(':focus-visible')],
['badges preserve semantic success warning error distinctions',css.includes('.p-badge.green')&&css.includes('.p-badge.amber')&&css.includes('.p-badge.red')],
['tabs are horizontally resilient and focus visible',css.includes('.p-tabs')&&css.includes('overflow-x:auto')&&css.includes('[data-slot="tabs-trigger"]:focus-visible')],
['dialogs receive premium bounded surface',css.includes('body:has(')&&css.includes('.p-modal')&&css.includes('box-shadow:0 28px 80px')],
['side sheets receive bounded edge treatment',css.includes('.p-side-sheet')&&css.includes('border-left:1px')],
['mobile dialog and action rows adapt',css.includes('@media (max-width:640px)')&&css.includes('width:calc(100vw - 1rem)!important')],
['reduced motion and forced colors are supported',css.includes('@media (prefers-reduced-motion:reduce)')&&css.includes('@media (forced-colors:active)')],
];
for(const [n,p] of checks){assert.ok(p,n);console.log('PASS '+n)}console.log('Stage 1 interaction primitive checks passed: '+checks.length+'/'+checks.length+'.');
