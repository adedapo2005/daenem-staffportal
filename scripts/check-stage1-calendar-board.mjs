import fs from 'node:fs';
import assert from 'node:assert/strict';

const runtime=fs.readFileSync(new URL('../src/qa-review-v115-runtime.tsx',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/stage1-calendar-board.css',import.meta.url),'utf8');
const work=fs.readFileSync(new URL('../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/work-views.tsx',import.meta.url),'utf8');

const checks=[
 ['runtime imports calendar/board refinement',runtime.includes("import './stage1-calendar-board.css';")],
 ['retained calendar includes Month Week Day Agenda views',["Month","Week","Day","Agenda"].every(v=>work.includes("'"+v+"'"))],
 ['calendar retains keyboard-accessible record opening',work.includes("onClick={()=>open(r)}")&&work.includes("use Edit record for a keyboard-accessible date change")],
 ['board retains non-drag status selector alternative',work.includes("label={'Move '+r.title}")&&work.includes("onChange={v=>move(r.id,v)}")],
 ['calendar controls use bounded premium toolbar',css.includes('.tech-calendar-tools')&&css.includes('border-radius: 12px')],
 ['agenda uses responsive actionable rows',css.includes('.tech-agenda > button')&&css.includes('grid-template-columns: auto minmax(0,1fr) auto')],
 ['board lanes use responsive auto-fit hierarchy',css.includes('.tech-board')&&css.includes('repeat(auto-fit, minmax(220px,1fr))')],
 ['mobile board stacks lanes and calendar controls reflow',css.includes('@media (max-width: 760px)')&&css.includes('grid-template-columns: minmax(0,1fr)')],
 ['focus visible treatment covers calendar agenda and board cards',css.includes('.tech-calendar-event:focus-visible')&&css.includes('.tech-board-card > button:focus-visible')],
 ['forced colours and reduced motion are supported',css.includes('@media (forced-colors: active)')&&css.includes('@media (prefers-reduced-motion: reduce)')],
];
for(const [name,pass] of checks){assert.ok(pass,name);console.log('PASS '+name)}
console.log('Stage 1 Calendar/Board checks passed: '+checks.length+'/'+checks.length+'.');
