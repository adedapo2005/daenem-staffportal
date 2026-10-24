import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateScheduleReferences } from '../worker/facility-schedule-guard.ts';

function fakeDb({facilityCompany='A',assetCompany='A',assetFacility='f1',employeeCompany='A',vendorCompany='A',categoryActive=true}={}){
  const calls=[];
  return {calls,prepare(sql){return{bind(...args){calls.push({sql,args});return{async first(){
    if(sql.includes('FROM facilities'))return args[0]==='f1'&&args[1]===facilityCompany?{id:'f1'}:null;
    if(sql.includes('FROM assets'))return args[0]==='a1'&&args[1]===assetCompany?{id:'a1',facilityId:assetFacility}:null;
    if(sql.includes('FROM maintenance_categories'))return args[0]==='generator'&&categoryActive?{code:'generator'}:null;
    if(sql.includes('FROM employees'))return args[0]==='e1'&&args[1]===employeeCompany?{id:'e1'}:null;
    if(sql.includes('FROM maintenance_vendors'))return args[0]==='v1'&&args[1]===vendorCompany?{id:'v1'}:null;
    throw Error('Unexpected SQL '+sql);
  }}}}};
}
}
let checks=0;async function pass(input,expected,options={}){let result=await validateScheduleReferences(fakeDb(options),'A',input);assert.equal(result.ok,expected);checks++;return result;}
const good={facilityId:'f1',assetId:'a1',categoryCode:'generator',defaultAssigneeEmployeeId:'e1',defaultVendorId:'v1'};
assert.deepEqual(await pass(good,true),{ok:true,facilityId:'f1',assetId:'a1',categoryCode:'generator',defaultAssigneeEmployeeId:'e1',defaultVendorId:'v1'});checks++;
await pass({},true);
await pass({assetId:'a1'},true);
await pass({facilityId:'foreign'},false);
await pass(good,false,{assetCompany:'B'});
await pass(good,false,{facilityCompany:'B'});
await pass({...good,facilityId:'f2'},false);
await pass(good,false,{employeeCompany:'B'});
await pass(good,false,{vendorCompany:'B'});
await pass(good,false,{categoryActive:false});
await pass({facilityId:{id:'f1'}},false);
await pass({assetId:1},false);
await pass({categoryCode:'x'.repeat(181)},false);
const source=readFileSync(new URL('../worker/facilities.ts',import.meta.url),'utf8');
const schedule=source.slice(source.indexOf('async function createSchedule('),source.indexOf('export async function routeFacilities('));
assert.ok(schedule.includes('validateScheduleReferences(env.DB,companyId,body)'));checks++;
assert.ok(schedule.includes('MAINTENANCE_SCHEDULE_REFERENCE_INVALID'));checks++;
assert.ok(schedule.includes('refs.facilityId,refs.assetId,refs.categoryCode'));checks++;
assert.ok(schedule.indexOf('validateScheduleReferences(')<schedule.indexOf('env.DB.batch('));checks++;
assert.ok(schedule.includes('Number.isSafeInteger(intervalValue)'));checks++;
assert.ok(schedule.includes('Number.isSafeInteger(cost)'));checks++;
assert.ok(schedule.includes("requireCompany(context,companyId,'edit')"));checks++;
console.log('Facilities schedule reference acceptance: '+checks+' checks passed.');
