import fs from 'node:fs';import assert from 'node:assert/strict';
const runtime=fs.readFileSync(new URL('../src/qa-review-v115-runtime.tsx',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/stage1-state-system.css',import.meta.url),'utf8');
const checks=[
 ['runtime imports shared state layer',runtime.includes("import './stage1-state-system.css';")],
 ['empty states have bounded premium surface',css.includes('.p-empty')&&css.includes('min-height: clamp(220px, 32vh, 360px)')],
 ['loading skeletons retain visible non-content placeholder',css.includes('.p-skeleton')&&css.includes('background-size: 220% 100%')],
 ['neutral success and error callouts remain semantically distinct',css.includes('.p-callout.neutral')&&css.includes('.p-callout.green')&&css.includes('.p-callout.red')],
 ['status and notice treatment is shared',css.includes('.center-notice')&&css.includes('[role="status"]:not(.sr-only)')],
 ['offline draft state is explicit',css.includes('.offline-form-draft-note')],
 ['mobile state surfaces reflow',css.includes('@media (max-width: 640px)')],
 ['reduced-motion skeletons stop animation',css.includes('@media (prefers-reduced-motion: reduce)')&&css.includes('animation: none !important')],
 ['forced-colour states preserve system contrast',css.includes('@media (forced-colors: active)')&&css.includes('CanvasText')],
];
for(const [name,pass] of checks){assert.ok(pass,name);console.log('PASS '+name)}
console.log('Stage 1 shared state checks passed: '+checks.length+'/'+checks.length+'.');
