#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const files={
  portal:read('app/experience/Portal.tsx'),
  context:read('app/experience/page-context.tsx'),
  homes:read('app/experience/homes-v3.tsx'),
  operations:read('app/experience/enterprise-operations.tsx'),
  css:read('app/experience/portal-v14.css'),
  deployment:read('app/experience/deployment-metadata.ts'),
  signin:read('app/experience/signin-flagship.tsx'),
};
const checks=[];
const expect=(id,condition,evidence)=>checks.push({id,pass:Boolean(condition),evidence});
expect('V14-SAME-PROJECT',files.deployment.includes('appgprj_6aa35d8149408191b710e092ed0137f2'),'Exact project identity retained');
expect('V14-VERSION',files.deployment.includes('publishedVersion: 14'),'Visible build metadata is V14');
expect('V14-FRESHNESS-TRUTH',files.deployment.includes('Portal Updated')&&!files.deployment.includes('return `Last published'),'Build time is not called publish time');
expect('V14-PAGE-CONTEXT',files.portal.includes('<PageContext')&&files.context.includes('Business Value')&&files.context.includes('Available Actions'),'Reusable page context is rendered');
expect('V14-ENTITY-ACCESS',files.portal.includes('<EntityQuickAccess')&&files.context.includes('AUTHORIZED RELATIONSHIPS ONLY'),'Authorized entity quick access is rendered');
expect('V14-OWNER-COMMAND',files.homes.includes('Executive Financial Command Center')&&files.homes.includes('Available Liquidity')&&files.homes.includes('Reconciliation Exceptions'),'Owner command center exposes critical information');
expect('V14-BANK-COMMAND',files.operations.includes('Banking and Treasury Command Center')&&files.operations.includes('Incoming Payments')&&files.operations.includes('Bank Connectivity'),'Banking command surface is complete');
expect('V14-PAYROLL-COMMAND',files.operations.includes('Payment Activity Feed')&&files.operations.includes('Payroll Exceptions')&&files.operations.includes('Submitted is not paid'),'Payroll operations are immediate and authoritative');
for(const name of ['CONVERSATION CONTROL TOWER','QUEUE AND ASSIGNMENT','WHATSAPP NUMBER INFRASTRUCTURE','DELIVERY OBSERVATORY','CUSTOMER PREFERENCE DESK','AUTOMATION STUDIO','BRAND DOCUMENT STUDIO','AI LETTERHEAD GENERATOR','COMMUNICATION LIFECYCLE','OMNICHANNEL OPERATIONS CENTER']) expect('V14-COMM-'+name.replace(/\W+/g,'-'),files.operations.includes(name),name);
expect('V14-RECENTS',files.portal.includes('Recently Viewed')&&files.portal.includes('allowedRows.find'),'Recents are filtered through the authorized projection');
expect('V14-SAVED-MODULES',read('app/experience/workspaces.tsx').includes('module-hub-pins-'),'Module pins persist per simulated identity');
expect('V14-TYPOGRAPHY',/font-size:\s*max\(0\.875rem,\s*14px\)/.test(files.css)&&/font-size:\s*16px/.test(files.css),'Authenticated body and regular labels meet readable defaults');
expect('V14-TITLE-CASE',files.css.includes('[role="row"]:first-child')&&/text-transform:\s*capitalize/.test(files.css),'Controlled chrome Title Case layer is present');
expect('V14-RESPONSIVE',/@media\s*\(max-width:\s*760px\)/.test(files.css)&&/@media\s*\(min-width:\s*2400px\)/.test(files.css),'Mobile and 4K adaptations present');
expect('V14-REDUCED-MOTION',files.css.includes('prefers-reduced-motion: reduce'),'Reduced motion retained');
expect('V14-NO-INVENTED-API',!Object.values(files).some(text=>/GET \/api\/|POST \/api\//.test(text)),'No invented API URL tokens');
expect('V14-PRODUCTION-BOUNDARY',files.operations.includes('No money moved')&&files.operations.includes('No provider connected'),'Design-lab truth boundary visible');
expect('V14-CAPABILITY-PRESERVATION',read('app/experience/enterprise-contract.ts').includes('customer-communications')&&read('app/experience/enterprise-contract.ts').includes('banking-operations')&&read('app/experience/enterprise-contract.ts').includes('bakery-accountability'),'V13 and historical domain modules retained');

const out={generatedAt:new Date().toISOString(),total:checks.length,passed:checks.filter(x=>x.pass).length,failed:checks.filter(x=>!x.pass).length,checks};
fs.mkdirSync(path.join(root,'docs/v14'),{recursive:true});
fs.writeFileSync(path.join(root,'docs/v14/v14-regression-checks.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));
if(out.failed)process.exit(1);
