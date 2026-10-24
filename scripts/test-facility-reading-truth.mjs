import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recentFacilityReadings } from '../worker/facility-reading-history.ts';

let checks=0;
const eq=(a,b)=>{assert.deepEqual(a,b);checks++;};
const ok=(v,msg)=>{assert.ok(v,msg);checks++;};
const rows=[
  {id:'reading-01',assetId:'asset-01',assetName:'Generator A',readingType:'running_hours',readingValue:31.5,unit:'hours',recordedAt:'2026-10-23 14:00:00',facilityName:'Main Facility'},
  {id:'reading-02',assetId:'asset-02',assetName:'Solar B',readingType:'energy_kwh',readingValue:22,unit:'kWh',recordedAt:'2026-10-23 13:00:00',facilityName:null},
];
let captured={sql:'',company:''};
const db={
  prepare(sql) {
    captured.sql=sql;
    return {bind(companyId) {
      captured.company=companyId;
      return {all:async()=>({results:rows})};
    }};
  },
};
const records=await recentFacilityReadings(db,'company-printing');
eq(records.length,2);
eq(records[0].id,'reading-01');
eq(records[0].assetName,'Generator A');
eq(records[0].readingValue,31.5);
eq(records[0].facilityName,'Main Facility');
eq(records[1].facilityName,null);
eq(captured.company,'company-printing');
ok(captured.sql.includes('WHERE r.company_id=?'),'D1 query must be company-scoped');
ok(captured.sql.includes('a.company_id=r.company_id'),'asset join must prevent cross-company disclosure');
ok(captured.sql.includes('f.company_id=r.company_id'),'facility join must be company-scoped');
ok(captured.sql.includes('ORDER BY r.recorded_at DESC, r.id DESC'),'history must be deterministic');
ok(captured.sql.includes('LIMIT 20'),'bounded response');
eq(await recentFacilityReadings(db,''),[]);
eq((await recentFacilityReadings({prepare(){return{bind(){return{all:async()=>({results:[]})}}}}},'company-printing')).length,0);
await assert.rejects(()=>recentFacilityReadings({prepare(){return{bind(){return{all:async()=>{throw new Error('D1 unavailable')}}}}}},'company-printing'),/D1 unavailable/);checks++;

const worker=readFileSync(new URL('../worker/facilities.ts',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/centers.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/facility-guided-entry.css',import.meta.url),'utf8');
ok(worker.includes("if(!can(context,'view'))return json({error:'Facilities access is not assigned.'},403)"),'backend read permissions');
ok(worker.includes('const accessError=requireCompany(context,companyId);'),'backend company permission check');
ok(worker.includes("if(url.pathname==='/api/facilities/readings'&&request.method==='GET')return readingsHistory"),'GET route must be present');
ok(worker.includes("if(url.pathname==='/api/facilities/readings'&&request.method==='POST')return recordReading"),'existing POST must be preserved');
ok(ui.includes('data-record-source="cloudflare-d1"'),'real backend provenance marker');
ok(ui.includes('/api/facilities/readings?companyId='),'fetch recorded readings');
ok(ui.includes('r.companyId!==requestedCompany'),'fail closed on response company mismatch');
ok(ui.includes('currentCompanyRef.current!==requestedCompany'),'reject stale company responses');
ok(ui.includes("setRecordsState('error')"),'failure must not report an empty real database');
ok(ui.includes('No recorded work orders'),'explicit genuine zero state');
ok(ui.includes('No equipment registered yet'),'explicit equipment zero state');
ok(ui.includes('No readings recorded yet'),'explicit reading zero state');
ok(ui.includes('recentReadings.map(item=>'),'show persisted records only');
ok(css.includes('.facility-reading-history'),'reading layout in CSS');
console.log('Facilities real D1 reading history and zero-state contracts passed ('+checks+' checks).');
