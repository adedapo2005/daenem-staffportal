import fs from 'node:fs';
import assert from 'node:assert/strict';
const runtime=fs.readFileSync(new URL('../src/qa-review-v115-runtime.tsx',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/stage1-communications-workspace.css',import.meta.url),'utf8');
const checks=[
 ['runtime imports communications layer',runtime.includes("import './stage1-communications-workspace.css';")],
 ['desktop uses explicit master-detail split',css.includes('grid-template-columns: clamp(330px, 27vw, 430px) minmax(0, 1fr)')],
 ['selected conversation gets distinct accessible state',css.includes('.ci-channel-list article.is-selected')&&css.includes('inset 3px 0 var(--stage1-primary')],
 ['thread bubbles distinguish own messages',css.includes('.ci-thread article.mine > div:last-child')],
 ['composer has bounded error treatment',css.includes('.ci-composer [role="alert"]')],
 ['tablet split remains bounded',css.includes('@media (min-width: 760px) and (max-width: 1100px)')],
 ['mobile retains list/detail handoff',css.includes('@media (max-width: 759px)')&&css.includes('.ci-workspace')],
 ['reduced motion and forced colours are handled',css.includes('@media (prefers-reduced-motion: reduce)')&&css.includes('@media (forced-colors: active)')],
];
for(const [name,pass] of checks){assert.ok(pass,name);console.log('PASS '+name)}
console.log('Stage 1 communications checks passed: '+checks.length+'/'+checks.length+'.');
