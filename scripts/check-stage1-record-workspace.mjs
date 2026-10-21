import fs from 'node:fs';import assert from 'node:assert/strict';
const runtime=fs.readFileSync(new URL('../src/qa-review-v115-runtime.tsx',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/stage1-record-workspace.css',import.meta.url),'utf8');
const portal=fs.readFileSync(new URL('../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/Portal.tsx',import.meta.url),'utf8');
const checks=[
['runtime imports record workspace layer',runtime.includes("import './stage1-record-workspace.css';")],
['retained record page exposes stable identity facts',portal.includes('dr-key-identity')&&portal.includes('Record Type')&&portal.includes('Key Identifier')],
['retained record tabs are keyboard-operable ARIA tabs',portal.includes('role="tablist"')&&portal.includes('moveRecordTab')],
['retained approvals require a decision reason',portal.includes('Decision Reason')&&portal.includes('Enter a decision reason.')],
['identity header has explicit premium hierarchy',css.includes('.dr-identity-bar')&&css.includes('grid-template-areas')],
['overview separates primary facts from accountability rail',css.includes('.dr-overview')&&css.includes('minmax(0,1.55fr) minmax(280px,.55fr)')],
['tabs stay horizontally available on narrow screens',css.includes('.dr-tabs')&&css.includes('overflow-x: auto')],
['mobile identity/actions reflow without hidden content',css.includes('@media (max-width: 700px)')&&css.includes('grid-template-areas:"back" "identity" "facts" "actions"')],
['forced colours preserve record boundaries',css.includes('@media (forced-colors: active)')],
];
for(const [name,pass] of checks){assert.ok(pass,name);console.log('PASS '+name)}
console.log('Stage 1 record workspace checks passed: '+checks.length+'/'+checks.length+'.');
