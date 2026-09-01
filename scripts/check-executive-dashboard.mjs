import{readFileSync}from'node:fs';
const read=(path)=>readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const backend=read('worker/owner-intelligence.ts');
const dashboard=read('src/executive-dashboard.tsx');
const styles=read('src/executive-dashboard.css');
const main=read('src/main.tsx');
const assertions=[];
function check(name,condition){assertions.push({name,ok:Boolean(condition)});if(!condition)process.exitCode=1}

for(const period of['current_month','previous_month','current_quarter','year_to_date','last_12_months'])check(`period: ${period}`,backend.includes(`'${period}'`)&&dashboard.includes(`'${period}'`));
for(const module of['printing','bakery','autos','logistics','properties'])check(`company intelligence: ${module}`,backend.includes(`company-${module}`)&&dashboard.includes(`key:'${module}'`));
for(const field of['operatingExpenseKobo','outstandingReceivablesKobo','postedJournals'])check(`Finance metric: ${field}`,backend.includes(field)&&dashboard.includes(field));
for(const field of['activeProjects','budgetKobo','spentKobo','overdueMilestones'])check(`Construction metric: ${field}`,backend.includes(field)&&dashboard.includes(field));
check('Owner dashboard replaces placeholder for management',main.includes("<GroupExecutiveDashboard companyId={company.id} />")&&main.includes("can(context, 'dashboard.access', 'manage', company.id)"));
check('company scope is validated server-side',backend.includes('Selected company is not assigned to this Owner workspace.')&&backend.includes('context.companies'));
check('unassigned company data is suppressed',backend.includes("visible.has('company-printing')")&&backend.includes('scopePlaceholders'));
check('queries are bound',backend.includes('.bind(companyId, range.start, range.end)')&&backend.includes('companyIds.map(() =>'));
check('independent D1 reads are batched',backend.includes('env.DB.batch(['));
check('two-minute refresh cadence',dashboard.includes('120000'));
check('drill-down uses existing module event',dashboard.includes("new CustomEvent('daenem:launch-module'")||dashboard.includes("new CustomEvent('daenem:open-module'"));
check('responsive dashboard styles',styles.includes('@media(max-width:600px)')&&styles.includes('@media(max-width:390px)'));
check('no fabricated sample values',!/(sample revenue|demo amount|mock revenue)/i.test(dashboard+backend));
check('no credential literals',!/BEGIN (RSA|OPENSSH) PRIVATE KEY|api[_-]?key\s*[:=]\s*['\"][^'\"]+/i.test(dashboard+backend));
check('secure ID generation retained',backend.includes('crypto.randomUUID()')&&!backend.includes('Math.random()'));

for(const result of assertions)console.log(`${result.ok?'✓':'✗'} ${result.name}`);
if(process.exitCode)console.error(`\n${assertions.filter((item)=>!item.ok).length} Executive Dashboard contract assertion(s) failed.`);
else console.log(`\n${assertions.length} Executive Dashboard contract assertions passed.`);
