import fs from 'node:fs';import assert from 'node:assert/strict';
const runtime=fs.readFileSync(new URL('../src/qa-review-v115-runtime.tsx',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/stage1-kpi-chart-system.css',import.meta.url),'utf8');
const analytics=fs.readFileSync(new URL('../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/analytics.tsx',import.meta.url),'utf8');
const ui=fs.readFileSync(new URL('../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/ui.tsx',import.meta.url),'utf8');
const checks=[
['runtime imports KPI/chart layer',runtime.includes("import './stage1-kpi-chart-system.css';")],
['metric values retain accessible final labels',ui.includes('<strong aria-label={value}>')&&ui.includes('aria-hidden="true"')],
['charts retain authorized-record empty state',analytics.includes('No authorized chart data')],
['charts retain table/data alternative',analytics.includes('Accessible data & drill-down')&&analytics.includes('tech-chart-data')],
['chart legends remain togglable buttons',analytics.includes('aria-pressed={!excluded.includes(d.name)}')],
['KPI cards receive premium label/value/detail hierarchy',css.includes('.p-metric > strong')&&css.includes('font-variant-numeric:tabular-nums')],
['charts and legends receive bounded responsive treatment',css.includes('.tech-chart-legend > button')&&css.includes('.tech-chart-data')],
['mobile KPI/chart layout adapts',css.includes('@media (max-width:760px)')&&css.includes('repeat(2,minmax(0,1fr))')],
['reduced motion and forced colors are supported',css.includes('@media (prefers-reduced-motion:reduce)')&&css.includes('@media (forced-colors:active)')],
];
for(const [n,p] of checks){assert.ok(p,n);console.log('PASS '+n)}console.log('Stage 1 KPI/chart checks passed: '+checks.length+'/'+checks.length+'.');
