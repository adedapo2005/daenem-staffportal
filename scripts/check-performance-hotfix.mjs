import{readFileSync}from'node:fs';
const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const html=read('index.html');
const auth=read('src/auth.tsx');
const workspaceRefinement=read('src/workspace-refinement-entry.ts');
const ownerGate=read('src/owner-temp-change-entry.ts');
const employeeGate=read('src/temporary-password-change-entry.ts');
const moduleHub=read('src/module-hub.tsx');
const workerAuth=read('worker/auth.ts');
const assertions=[];
function check(name,condition){assertions.push({name,ok:Boolean(condition)});if(!condition)process.exitCode=1}

const startupScripts=(html.match(/<script type="module"/g)||[]).length;
check('startup scripts capped',startupScripts<=5);
check('auth requests coalesced',auth.includes('authMeRequest')&&auth.includes('AUTH_ME_CACHE_MS'));
check('logout clears UI first',auth.indexOf('setContext(null)')<auth.indexOf("api('/api/auth/logout'"));
check('logout forces clean application reset',auth.includes("window.location.replace('/')"));
check('Worker logout cleanup cannot reject response',workerAuth.includes('Promise.allSettled')&&workerAuth.includes('Max-Age=0'));
check('DOM observer performs no authentication request',workspaceRefinement.includes('new MutationObserver(scheduleRefinement)')&&!workspaceRefinement.includes('new MutationObserver(()=>void refreshContext())'));
check('DOM observer disconnects after refinement',workspaceRefinement.includes('observer.disconnect()'));
check('security gates avoid fast polling',!ownerGate.includes('1500')&&!employeeGate.includes('1600')&&ownerGate.includes('60_000')&&employeeGate.includes('60_000'));
check('ERP workspaces load on demand',[
  './attendance-entry','./payroll-entry','./finance-entry','./printing-entry','./bakery-entry-v2',
  './autos-entry','./logistics-entry','./properties-entry','./inventory-entry','./construction-entry',
  './admin-entry','./access-control-entry','./theme-studio-entry','./navigation-studio-entry','./social-entry',
].every((entry)=>moduleHub.includes(`import('${entry}')`)));

for(const result of assertions)console.log(`${result.ok?'✓':'✗'} ${result.name}`);
if(process.exitCode)console.error(`\n${assertions.filter((item)=>!item.ok).length} performance-hotfix assertion(s) failed.`);
else console.log(`\n${assertions.length} performance-hotfix assertions passed.`);
