import fs from 'node:fs';import assert from 'node:assert/strict';
const runtime=fs.readFileSync(new URL('../src/qa-review-v115-runtime.tsx',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/stage1-security-experience.css',import.meta.url),'utf8');
const work=fs.readFileSync(new URL('../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/workspaces.tsx',import.meta.url),'utf8');
const studio=fs.readFileSync(new URL('../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/studios.tsx',import.meta.url),'utf8');
const enterprise=fs.readFileSync(new URL('../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/enterprise-v3.tsx',import.meta.url),'utf8');
const checks=[
['runtime imports security presentation',runtime.includes("import './stage1-security-experience.css';")],
['security keeps provider telemetry unavailable truth',work.includes('No live provider feed is connected')],
['security keeps formal-source boundary',/formal\s+record,\s+client\s+telemetry\s+or\s+a\s+demonstration\s+fixture/.test(work)],
['session view keeps device fingerprinting disabled',enterprise.includes('Current browser · Not fingerprinted')],
['session view keeps production IdP revocation unclaimed',enterprise.includes('Production identity-provider sessions are not connected')],
['access matrix explains effective scoped permissions',studio.includes('Effective access matrix')&&studio.includes('override caps existing assignments; it cannot create a permission')],
['security risk cards receive responsive premium hierarchy',css.includes('.p-risk-matrix')&&css.includes('repeat(auto-fit,minmax(110px,1fr))')],
['audit master/detail receives responsive treatment',css.includes('.p-audit-workspace')&&css.includes('.p-audit-detail')],
['access matrix receives premium sticky treatment',css.includes('.p-access-table > div')&&css.includes('z-index:2')],
['mobile forced-colour and reduced-motion support exist',css.includes('@media (max-width:640px)')&&css.includes('@media (forced-colors:active)')&&css.includes('@media (prefers-reduced-motion:reduce)')],
];
for(const [n,p] of checks){assert.ok(p,n);console.log('PASS '+n)}console.log('Stage 1 Security experience checks passed: '+checks.length+'/'+checks.length+'.');
