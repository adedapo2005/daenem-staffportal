import { readFileSync } from 'node:fs';

const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const migration=read('migrations/0040_smart_help_center.sql');
const guide=read('worker/ai-guide.ts');
const runtime=read('worker/runtime.ts');
const navigation=read('worker/navigation-workspace.ts');
const client=read('src/guidance-center.tsx');
const navigationClient=read('src/navigation-studio-entry.tsx');
const main=read('src/main.tsx');
const packageJson=JSON.parse(read('package.json'));
const assertions=[];
function check(name,condition){assertions.push({name,ok:Boolean(condition)});if(!condition)process.exitCode=1}

check('guide routes use the authenticated runtime',runtime.includes("url.pathname.startsWith('/api/ai/')")&&runtime.includes('routeAiGuide(request, env, context)'));
check('catalog is built from the authorized navigation registry',guide.includes("import { navigationItems")&&navigation.includes('export const navigationItems'));
check('business modules are restricted to their company codes',['PRINT','BAKERY','AUTOS','LOGISTICS','PROPERTIES'].every((code)=>guide.includes(code))&&guide.includes('businessItemCodes'));
check('company permission is required for every guide request',guide.includes("hasPermission(context,'ai_guide.access','view',companyId)")&&guide.includes('selectedCompany(env,context'));
check('even Owner selects only an assigned business',guide.includes('context.companies.some((company)=>company.id===companyId)')&&!guide.includes('isOwner(context)||context.companies'));
check('function permission and minimum level are enforced',guide.includes("hasPermission(context,item.permissionCode,item.minimum||'view',companyId)"));
check('each catalog entry has the required clear descriptions',['whoUses','requiredInformation','expectedResult','warning','steps'].every((field)=>guide.includes(field)));
check('client displays all clear-description headings',['What it does','Who normally uses it','Information required','Expected result','Important','How to use it'].every((label)=>client.includes(label)));
check('multi-business guide selection sends company scope',client.includes('Working in')&&client.includes('companyId=${encodeURIComponent(selectedCompanyId)}')&&client.includes('JSON.stringify({ companyId, question: prompt })'));
check('unassigned functions remain hidden',client.includes('Unassigned functions are intentionally hidden')&&guide.includes('visibleFunctions(context,company.id,company.code)'));
check('review progress is synchronized per employee and business',migration.includes('PRIMARY KEY(employee_id,company_id,function_key)')&&guide.includes('/api/ai/guide/progress')&&client.includes('saveProgress'));
check('question history is private and company scoped',guide.includes("WHERE employee_id=? AND company_id=? AND feature='smart_help'")&&client.includes('Only your own company-scoped Smart Help activity is shown'));
check('question size and request rate are controlled',migration.includes('ai.guide_max_question_characters')&&migration.includes('ai.guide_questions_per_minute')&&guide.includes("datetime('now','-1 minute')"));
check('AI receives only the authorized catalog',guide.includes('AUTHORIZED FUNCTION CATALOG')&&guide.includes('const allowed=functions.map'));
check('AI cannot claim actions or bypass controls',guide.includes('Never claim that you performed an action')&&guide.includes('Never bypass permissions'));
check('verified catalog fallback prevents hard AI failure',guide.includes("source:'workers_ai'|'catalog'='catalog'")&&guide.includes('fallbackAnswer')&&guide.includes("catch{source='catalog'}"));
check('logged prompts and answers are redacted',guide.includes('redact(question)')&&guide.includes('redact(answer)')&&guide.includes("'[email]'")&&guide.includes("'[number]'"));
check('function launch uses the existing navigation action map',client.includes("'daenem:guide-open-function'")&&navigationClient.includes("window.addEventListener('daenem:guide-open-function'")&&navigationClient.includes('execute(item,setStudio)'));
check('offline catalog cache is isolated by employee and company',client.includes('daenem-smart-guide:${employeeId}:${companyId}')&&client.includes('Showing your last saved guide'));
check('help centre is responsive for phone and tablet',read('src/guidance-center.css').includes('@media(max-width:900px)')&&read('src/guidance-center.css').includes('@media(max-width:680px)'));
check('release summary announces Smart Help',main.includes('company-scoped Smart Help Centre'));
check('build runs the Smart Help contract',packageJson.scripts.prebuild.includes('check-smart-help-center.mjs'));

for(const result of assertions)console.log(`${result.ok?'✓':'✗'} ${result.name}`);
if(process.exitCode)console.error(`\n${assertions.filter((item)=>!item.ok).length} Smart Help contract assertion(s) failed.`);
else console.log(`\n${assertions.length} Smart Help contract assertions passed.`);
