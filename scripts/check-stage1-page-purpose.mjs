import fs from 'node:fs';
import assert from 'node:assert/strict';

const runtime=fs.readFileSync(new URL('../src/qa-review-v115-runtime.tsx',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/stage1-page-purpose.css',import.meta.url),'utf8');
const portal=fs.readFileSync(new URL('../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/Portal.tsx',import.meta.url),'utf8');
const context=fs.readFileSync(new URL('../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/page-context.tsx',import.meta.url),'utf8');

const checks=[
 ['runtime imports page-purpose hierarchy',runtime.includes("import './stage1-page-purpose.css';")],
 ['workspace title remains the main-content accessible label',portal.includes('aria-labelledby="workspace-title"')&&portal.includes('<h1 id="workspace-title">{workspaceTitle}</h1>')],
 ['workspace purpose text remains mounted',portal.includes('{workspaceDescription}')],
 ['workspace actions remain mounted',portal.includes('{workspaceActions}')],
 ['retained PageContext remains mounted',portal.includes('<PageContext module={m} selected={selected} />')],
 ['PageContext retains overview, business value and available actions',context.includes('Business Value')&&context.includes('Available Actions')&&context.includes('Overview')],
 ['header establishes explicit identity/action grid',css.includes('.p-workspace-header')&&css.includes('grid-template-columns: minmax(0, 1fr) auto')],
 ['dominant action receives primary premium treatment',css.includes('.p-head-actions .p-btn:not(.outline):not(.quiet):not(.danger)')],
 ['context surface becomes compact brief without hiding content',css.includes('main.p-content > .v14-page-context')&&!css.includes('display: none')],
 ['tablet context reorganizes actions without concealment',css.includes('@media (max-width: 1024px)')&&css.includes('grid-column: 1 / -1')],
 ['mobile header/action/context stack remains touch-safe and keeps Business Value visible',css.includes('@media (max-width: 767px)')&&css.includes('.v14-context-value {\n    display: block;')&&css.includes('min-height: 46px')&&css.includes('min-height: 44px')],
 ['forced colours and reduced motion remain supported',css.includes('@media (forced-colors: active)')&&css.includes('@media (prefers-reduced-motion: reduce)')],
];
for(const [name,pass] of checks){assert.ok(pass,name);console.log('PASS '+name)}
console.log('Stage 1 page-purpose checks passed: '+checks.length+'/'+checks.length+'.');
