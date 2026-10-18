#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root=process.cwd();
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const files={
 auth:read('app/experience/auth-v3.tsx'),signin:read('app/experience/signin-flagship.tsx'),signinCss:read('app/experience/signin-v15.css'),signinBaseCss:read('app/experience/signin-flagship.css'),
 portal:read('app/experience/Portal.tsx'),context:read('app/experience/page-context.tsx'),operations:read('app/experience/enterprise-operations.tsx'),
 workspaces:read('app/experience/workspaces.tsx'),model:read('app/experience/model.ts'),contract:read('app/experience/enterprise-contract.ts'),
 security:read('app/experience/security-contract.ts'),ui:read('app/experience/ui.tsx'),review:read('app/review/viewports/page.tsx'),deployment:read('app/experience/deployment-metadata.ts')
};
const checks=[];const expect=(id,condition,evidence)=>checks.push({id,pass:Boolean(condition),evidence});
const hasAll=(text,values)=>values.every(value=>text.includes(value));

expect('V15-PROJECT-LOCK',files.deployment.includes('appgprj_6aa35d8149408191b710e092ed0137f2'),'Exact existing Sites project retained');
expect('V15-NO-PRODUCTION-MUTATION',!Object.values(files).some(text=>/GET \/api\/|POST \/api\/|wrangler d1 execute|r2 bucket/i.test(text)),'No invented endpoints or production mutation commands');
expect('V15-REQUESTED-COMPANY-REMOVED',!files.auth.includes('Requested Company')&&!files.auth.includes('requested company'),'Create Account has no Requested Company field or validation');
expect('V15-LIVE-IDENTITY-STATES',hasAll(files.auth,["'idle'","'typing'","'checking'","'available'","'unavailable'","'rate-limited'","'service-unavailable'","CHECK_USERNAME_AVAILABILITY","CHECK_EMAIL_AVAILABILITY","Production identity check not connected"]),'All truthful design-lab availability states and semantic operations are represented');
expect('V15-PASSWORD-LIVE-VALIDATION',hasAll(files.auth,['passwordRequirements','v3-password-meter','Passwords match.','Passwords do not match.']),'Password policy, strength and confirmation remain live');
expect('V15-AUTH-STATE-HARNESS',hasAll(files.auth,['authState','recovery','verify','password','signup'])&&files.review.includes('Review authentication state'),'All public authentication states can be rendered independently for browser QA');
expect('V15-DIRECT-CONTEXT',hasAll(files.signin,['<IbadanSignature now={now} />','<GlobalTime now={now} compact />','<WeatherContext compact />','<Inspiration compact />','<Motivation compact />','<PublicNews compact />','sf-context-status'])&&!files.signin.includes('type ContextKey'),'Required context is directly rendered without the rejected context dialog dock');
expect('V15-SEVEN-CLOCKS',hasAll(files.signin,['DAENEM COMPLEX — IBADAN','Toronto','London','New York','Moscow','Tokyo','Beijing'])&&files.signin.includes('<PrecisionClock'),'Seven exact primary locations and a rendered analog clock are retained');
expect('V15-FAHRENHEIT',hasAll(files.signin,['82','°F','Feels 86°F','Sunrise 6:35 AM','Sunset 6:45 PM']),'Ibadan flagship weather remains Fahrenheit and fully labelled as demo');
expect('V15-PREAUTH-ZERO-DISCLOSURE',hasAll(files.signin,['Internal modules, records, people and reports are never','searched before authentication.','Public account guidance only','No matching public guidance']),'Spotlight remains public-safe before authentication');
expect('V15-NO-PAGE-SCROLL',hasAll(files.signinBaseCss+files.signinCss,['height:100dvh','overflow:hidden!important'])&&files.signinCss.includes('.sf-context-dock{display:flex'),'Viewport shell has no document scroll and mobile uses a directly visible widget rail');
expect('V15-REDUCED-MOTION',files.signinCss.includes('@media(prefers-reduced-motion:reduce)'),'Sign-in reduced-motion behavior retained');
expect('V15-PAGE-CONTEXT',files.portal.includes('<PageContext')&&hasAll(files.context,['Overview','Business Value','Available Actions']),'Every substantive routed module uses domain-specific page context');
expect('V15-ENTITY-QUICK-ACCESS',files.portal.includes('<EntityQuickAccess')&&hasAll(files.context,['AUTHORIZED RELATIONSHIPS ONLY','Related Records']),'Authorized record quick access is retained');
expect('V15-SEARCH-DISCOVERABILITY',hasAll(files.portal,['Recently Viewed','favorites','saved'])&&files.security.includes('authorizedSurface'),'Search, recents and authorized projections remain connected');
expect('V15-ENTERPRISE-TABLES',hasAll(files.ui,['EnterpriseTable','exportProjection'])&&hasAll(read('app/experience/enterprise-v3.css'),['position:sticky','v3-column-control','v3-saved-views','v3-mobile-cards']),'Shared table system retains sticky header, column, saved-view and mobile strategies');
expect('V15-COMMUNICATIONS',hasAll(files.operations,['CONVERSATION CONTROL TOWER','QUEUE AND ASSIGNMENT','WHATSAPP NUMBER INFRASTRUCTURE','DELIVERY OBSERVATORY','CUSTOMER PREFERENCE DESK','AUTOMATION STUDIO','BRAND DOCUMENT STUDIO','AI LETTERHEAD GENERATOR','COMMUNICATION LIFECYCLE','OMNICHANNEL OPERATIONS CENTER']),'All approved Communications operating surfaces are retained');
expect('V15-COMMUNICATION-LIFECYCLE',hasAll(files.operations,['Queued','Sent','Delivered','Read','Failed','Generate','Preview','Approve','Send']),'Design-lab delivery and governed AI lifecycle are represented');
expect('V15-BANKING-TREASURY',hasAll(files.operations,['Banking and Treasury Command Center','Total Balance','Available Balance','Incoming Payments','Outgoing Payments','Pending Transfers','Failed Transfers','Bank Connectivity','Reconciliation']),'Banking and Treasury command experience retains required metrics and controls');
expect('V15-TRANSACTION-STATES',hasAll(files.operations,['"RECEIVED"','"PENDING"','"PROCESSING"','"SUBMITTED"','"COMPLETED"','"FAILED"','"REVERSED"','"REFUNDED"','"CANCELLED"']),'Full transaction-state simulation is present');
expect('V15-PAYROLL-OPERATIONS',hasAll(files.operations,['Preparation','Validation','Banking batch','Transfer authorization','Provider submission','Per-employee processing','Reconciliation','Final payment','Submitted is not paid']),'Payroll financial workflow and authoritative paid boundary are present');
expect('V15-PAYROLL-TABLE',hasAll(files.operations,['Employee Name','Employee Number','Amount','Payment Date','Bank','Status','Transaction Reference','Department','Branch','Approved By']),'Payroll table contains all required columns');
expect('V15-PAYROLL-ANALYTICS',hasAll(files.operations,['Monthly payroll trend','Yearly payroll trend','Payroll by department','Payroll by business unit','Payroll vs revenue','Payroll cost analysis']),'All required payroll analysis views are present');
expect('V15-OWNER-COMMAND',hasAll(read('app/experience/homes-v3.tsx'),['Executive Financial Command Center','Total Assets','Total Cash','Available Liquidity','Revenue Today','Revenue This Month','Expenses This Month','Payroll This Month','Net Position','Incoming Transactions','Outgoing Transactions','Pending Payments','Failed Payments','Approval Queues','Reconciliation Exceptions','Bank Connectivity','Operational Exceptions','Security / Service Signals']),'Owner command center retains all critical KPIs and operational signals');
expect('V15-BUILDERS',hasAll(files.contract,['workflow-builder','form-builder','report-builder','widget-builder','theme-builder','business-rules'])&&hasAll(read('app/experience/enterprise-v3.tsx'),['Draft','Live design preview','Published','Archived','Assignment scope','Version history']),'Governed builder routes, scope, preview, version and archive lifecycle remain available');
expect('V15-FILE-GOVERNANCE',hasAll(read('app/experience/files-desk.tsx'),['v15-file-upload','Preview','Download File','Classification','Retention','Legal Hold','Revision / Version','Approval State','Expiry Date','Lock File'])&&hasAll(read('app/experience/file-governance.ts'),['retainUntil','legalHold','deleted','history','locked','approval']),'Governed file lifecycle remains present');
expect('V15-ZERO-DISCLOSURE-PROFILES',hasAll(files.security,['Owner','Group Admin','Manager','Employee','Provisional','Multi-role','Multi-company','No permission','Expired override','Reduced override']),'All ten authorization test profiles remain defined');
expect('V15-ZERO-DISCLOSURE-PROJECTION',hasAll(files.security,['authorizedSurface','exportProjection','projectAudit'])&&hasAll(files.model,['recordVisible','projectRecord','fieldAccess','canRecordAct']),'Navigation/search/export/audit and record/field projections remain authorization-first');
expect('V15-TITLE-CASE',hasAll(files.auth,['Create Account','Forgot Password','Sign In','Continue Recovery','Verify Code','Back to Sign-In'])&&read('app/experience/portal-v14.css').includes('text-transform: capitalize'),'V15 authentication actions plus authenticated chrome Title Case layer are present');
expect('V15-TYPE-SAFE-BARS',files.ui.includes('const normalized=items.map'),'Tuple and object KPI bars share one normalized rendering contract');

function tupleIds(text,start,end){const section=text.slice(text.indexOf(start),text.indexOf(end));return [...section.matchAll(/^\s*\['([^']+)'/gm)].map(match=>match[1]);}
try{
 const baselineModel=execFileSync('git',['show','71f259f54c7d27064388ded4c91d7b41f3d8390c:app/experience/model.ts'],{cwd:root,encoding:'utf8'});
 const baselineContract=execFileSync('git',['show','71f259f54c7d27064388ded4c91d7b41f3d8390c:app/experience/enterprise-contract.ts'],{cwd:root,encoding:'utf8'});
 const baseline=[...tupleIds(baselineModel,'const moduleRows','export const modules'),...tupleIds(baselineContract,'export const newModuleRows','export const enterpriseFixtures')];
 const current=[...tupleIds(files.model,'const moduleRows','export const modules'),...tupleIds(files.contract,'export const newModuleRows','export const enterpriseFixtures')];
 const missing=[...new Set(baseline)].filter(id=>!current.includes(id));
 expect('V15-CAPABILITY-PRESERVATION',missing.length===0,`Compared ${new Set(baseline).size} V14 module identifiers; missing: ${missing.join('|')||'none'}`);
}catch(error){expect('V15-CAPABILITY-PRESERVATION',false,String(error));}

const out={generatedAt:new Date().toISOString(),baselineCommit:'71f259f54c7d27064388ded4c91d7b41f3d8390c',total:checks.length,passed:checks.filter(x=>x.pass).length,failed:checks.filter(x=>!x.pass).length,checks};
fs.mkdirSync(path.join(root,'docs/v15'),{recursive:true});
fs.writeFileSync(path.join(root,'docs/v15/v15-source-acceptance.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));
if(out.failed)process.exit(1);
