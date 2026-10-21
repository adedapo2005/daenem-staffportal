import fs from 'node:fs';
import assert from 'node:assert/strict';
const runtime=fs.readFileSync(new URL('../src/qa-review-v115-runtime.tsx',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/stage1-attachments-evidence.css',import.meta.url),'utf8');
const checks=[
 ['runtime imports attachment evidence layer',runtime.includes("import './stage1-attachments-evidence.css';")],
 ['evidence list uses bounded attachment rows',css.includes('.p-evidence')&&css.includes('grid-template-columns: auto minmax(0,1fr) auto')],
 ['attachment buttons expose keyboard focus',css.includes('button.p-attachment:focus-visible')],
 ['file input gets explicit selector control',css.includes('input[type="file"]::file-selector-button')],
 ['local image pdf and text previews are bounded',css.includes('.p-local-evidence :is(img,object,pre)')&&css.includes('max-height: 58vh')],
 ['dropzone has visible drag-active state',css.includes('.tech-dropzone.drag-active')],
 ['mobile attachment rows reflow without clipping',css.includes('@media (max-width: 640px)')&&css.includes('grid-template-columns: auto minmax(0,1fr)')],
 ['forced colours and reduced motion are handled',css.includes('@media (forced-colors: active)')&&css.includes('@media (prefers-reduced-motion: reduce)')],
];
for(const [name,pass] of checks){assert.ok(pass,name);console.log('PASS '+name)}
console.log('Stage 1 attachment/evidence checks passed: '+checks.length+'/'+checks.length+'.');
