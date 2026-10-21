import fs from 'node:fs';
import assert from 'node:assert/strict';

const runtime=fs.readFileSync(new URL('../src/qa-review-v115-runtime.tsx',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/stage1-construction-family.css',import.meta.url),'utf8');
const source=fs.readFileSync(new URL('../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/construction-erp.tsx',import.meta.url),'utf8');

const checks=[
 ['runtime imports Construction family layer',runtime.includes("import './stage1-construction-family.css';")],
 ['retained Construction command/project/building/area/report routes remain present',[
   'construction-command','construction-project','construction-building','construction-area','construction-reports'
 ].every(id=>source.includes(id))],
 ['Construction toolbar is responsive and bounded',css.includes('.c16-toolbar')&&css.includes('minmax(220px, 280px) minmax(260px, 1fr) auto')],
 ['Construction KPI family uses responsive auto-fit hierarchy',css.includes('.c16-kpis')&&css.includes('repeat(auto-fit, minmax(160px, 1fr))')],
 ['desktop command and review layouts use asymmetric hierarchy',css.includes('.c16-command-grid')&&css.includes('minmax(0, 1.28fr) minmax(300px, .72fr)')],
 ['portfolio building work and WhatsApp cards use a shared responsive grid',css.includes('.c16-portfolio')&&css.includes('.c16-hierarchy')&&css.includes('.c16-work-grid')&&css.includes('.c16-whatsapp')],
 ['dense Construction tables retain bounded horizontal containment and pinned record identity',css.includes('.c16-table-wrap')&&css.includes('overflow: auto')&&css.includes('.c16-table td:first-child')&&css.includes('position: sticky')],
 ['mobile Construction layouts stack without page-level horizontal dependency',css.includes('@media (max-width: 760px)')&&css.includes('grid-template-columns: minmax(0,1fr)')],
 ['interactive Construction lists retain keyboard focus treatment',css.includes(':focus-visible')],
 ['forced colours and reduced motion remain supported',css.includes('@media (forced-colors: active)')&&css.includes('@media (prefers-reduced-motion: reduce)')],
];
for(const [name,pass] of checks){assert.ok(pass,name);console.log('PASS '+name)}
console.log('Stage 1 Construction family checks passed: '+checks.length+'/'+checks.length+'.');
