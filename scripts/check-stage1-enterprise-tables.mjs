import fs from 'node:fs';
import assert from 'node:assert/strict';
const runtime=fs.readFileSync(new URL('../src/qa-review-v115-runtime.tsx',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/stage1-enterprise-tables.css',import.meta.url),'utf8');
const source=fs.readFileSync(new URL('../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/table-v3.tsx',import.meta.url),'utf8');
const checks=[
 ['runtime imports enterprise table refinement',runtime.includes("import './stage1-enterprise-tables.css';")],
 ['retained table already owns saved views and density controls',source.includes('SAVED VIEW')&&source.includes('Table density')&&source.includes('Pinned title width')],
 ['table command toolbar is responsive',css.includes('.p-table-tools')&&css.includes('grid-template-columns: minmax(240px, 1.35fr)')],
 ['desktop identity column is pinned',css.includes('.v3-table-scroll .v3-pinned')&&css.includes('position: sticky')],
 ['table header and filtered total remain anchored',css.includes('thead th')&&css.includes('tfoot td')&&css.includes('bottom: 0')],
 ['mobile cards have keyboard focus treatment',css.includes('.v3-mobile-cards > button:focus-visible')],
 ['tablet controls reflow to one column',css.includes('@media (max-width: 1100px)')&&css.includes('.v3-table-controls')],
 ['mobile toolbar and pagination reflow',css.includes('@media (max-width: 767px)')&&css.includes('.p-table-foot')],
 ['forced colour support retained',css.includes('@media (forced-colors: active)')],
];
for(const [name,pass] of checks){assert.ok(pass,name);console.log('PASS '+name)}
console.log('Stage 1 enterprise table checks passed: '+checks.length+'/'+checks.length+'.');
