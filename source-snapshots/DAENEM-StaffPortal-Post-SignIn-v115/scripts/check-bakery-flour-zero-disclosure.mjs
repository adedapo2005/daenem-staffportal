import {readFileSync} from 'node:fs';

const contract = readFileSync('app/experience/bakery-report-contract.ts', 'utf8');
const model = readFileSync('app/experience/model.ts', 'utf8');
const workspace = readFileSync('app/experience/enterprise-v3.tsx', 'utf8');
const profiles = readFileSync('app/experience/security-contract.ts', 'utf8');

const checks = [
  ['combined response makes flour usage optional', contract.includes('flourUsage?: BakeryFlourUsageEntry[]')],
  ['missing report is safe', contract.includes('if (!report) return undefined')],
  ['unauthorized projection omits flour usage', contract.includes('const {flourUsage, ...permissionSafeReport} = report') && contract.includes('if (!mayViewFlourUsage || !Array.isArray(flourUsage))')],
  ['unauthorized rows resolve to an empty list before dereference', contract.includes('if (!mayViewFlourUsage) return []') && contract.includes('report?.flourUsage')],
  ['flour authority is an explicit specialized capability', model.includes("'bakery.flour_control'") && contract.includes("BAKERY_FLOUR_CAPABILITY = 'bakery.flour_control'")],
  ['flour export requires both flour and export authority', contract.includes('canViewBakeryFlourUsage(session)') && contract.includes("canAct(accountabilityModule, session, 'export')")],
  ['authorized report labels are permission composed', workspace.includes('bakeryReportLabels(canViewBakeryFlourUsage(session))') && workspace.includes('reportLabels.map')],
  ['workspace has no unconditional flour report label', !workspace.includes("'Theft / Accountability Investigation','Flour Usage'" )],
  ['delegated multi-company fixture does not receive flour authority', profiles.includes("capabilities:['export','print','publish','assign','reconcile','close']") && !profiles.includes("capabilities:['export','print','publish','assign','reconcile','close','bakery.flour_control']")],
];

for (const [name, pass] of checks) console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
const failed = checks.filter(([, pass]) => !pass);
if (failed.length) process.exit(1);
console.log(`Bakery flour zero-disclosure contract: ${checks.length}/${checks.length} PASS`);
