import fs from 'node:fs';
import assert from 'node:assert/strict';

const search=fs.readFileSync(new URL('../src/stage1-live-search.tsx',import.meta.url),'utf8');
const hub=fs.readFileSync(new URL('../src/module-hub.tsx',import.meta.url),'utf8');
const payroll=fs.readFileSync(new URL('../src/payroll.tsx',import.meta.url),'utf8');
const payrollEntry=fs.readFileSync(new URL('../src/payroll-entry.tsx',import.meta.url),'utf8');
const construction=fs.readFileSync(new URL('../src/construction-entry.tsx',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../worker/smart-search.ts',import.meta.url),'utf8');

const checks=[
 ['search payload carries bounded company context',worker.includes('companyId?: string')&&worker.includes('company_id AS companyId')],
 ['payroll and construction deep links include record and company scope',search.includes('stage1Module')&&search.includes('stage1Record')&&search.includes('stage1Company')],
 ['other record families retain safe workspace links',search.includes("'leave-request': '/leave'")&&search.includes("'form-submission': '/forms'")],
 ['module hub validates requested company membership before deep-link launch',hub.includes('requestedCompanyId')&&hub.includes('isModuleVisible(context, module, launchCompanyId, launchCompanyCode)')],
 ['module hub publishes record target only after module opens',hub.includes("new CustomEvent('daenem:stage1-search-record'")&&hub.indexOf("daenem:stage1-search-record")>hub.indexOf('const opened = module.selector')],
 ['payroll launcher captures record target and respects company grants',payrollEntry.includes("daenem:stage1-search-record")&&payrollEntry.includes('targetRecordId={target?.recordId}')&&payrollEntry.includes("hasWorkforcePermission(context,'payroll.access','view',company.id)")],
 ['payroll workspace opens matching run only after authorized run list contains it',payroll.includes('runs.find(item=>item.id===targetRecordId)')&&payroll.includes('void openRun(run)')],
 ['construction launcher captures record target and respects company grants',construction.includes("daenem:stage1-search-record")&&construction.includes('targetRecordId={target?.recordId}')&&construction.includes("hasWorkforcePermission(c,'construction.access','view',company.id)")],
 ['construction workspace opens matching project only after authorized project list contains it',construction.includes('projects.find(item=>item.id===targetRecordId)')&&construction.includes('void openProject(project)')],
];
for(const [name,pass] of checks){assert.ok(pass,name);console.log('PASS '+name)}
console.log('Stage 1 search deep-link checks passed: '+checks.length+'/'+checks.length+'.');
