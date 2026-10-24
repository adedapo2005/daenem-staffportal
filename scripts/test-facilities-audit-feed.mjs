import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recentFacilitiesAudit } from '../worker/facility-audit-feed.ts';

let count=0;
const eq=(a,b)=>{assert.deepEqual(a,b);count++};
const ok=(value,message)=>{assert.ok(value,message);count++};
const readingId='asset-reading-123e4567-e89b-42d3-a456-426614174000';
let requestedCompany='',sqlText='';
const db={
  prepare(sql){
    sqlText=sql;
    return {bind(companyId){
      requestedCompany=companyId;
      return {async all(){return {results:[
        {id:'audit-1',occurredAt:'2026-10-23 15:00:00',action:'record_reading',entityType:'asset',entityId:'asset-1',actorName:'A. Staff',afterJson:JSON.stringify({readingId,note:'private detail must not be returned',readingValue:30})},
        {id:'audit-2',occurredAt:'2026-10-23 14:00:00',action:'create',entityType:'facility',entityId:'facility-1',actorName:null,afterJson:JSON.stringify({secret:'never disclose'})},
        {id:'audit-3',occurredAt:'2026-10-23 13:00:00',action:'record_reading',entityType:'asset',entityId:'asset-2',actorName:'',afterJson:'invalid JSON'},
        {id:'audit-4',occurredAt:'2026-10-23 12:00:00',action:'record_reading',entityType:'asset',entityId:'asset-3',actorName:'Sample',afterJson:JSON.stringify({readingId:'untrusted-id'})}
      ]}};
      }};
    }};
  }
};
const result=await recentFacilitiesAudit(db,'company-printing');
eq(result.length,4);
eq(requestedCompany,'company-printing');
ok(sqlText.includes("WHERE l.company_id=? AND l.module='facilities'"),'audit must be company scoped and module limited');
ok(sqlText.includes("e.company_id=l.company_id"),'staff names must be company scoped');
ok(sqlText.includes('LIMIT 25'),'bounded audit feed');
ok(sqlText.includes('ORDER BY l.occurred_at DESC, l.id DESC'),'deterministic feed');
eq(result[0].readingId,readingId);
eq(result[0].actorName,'A. Staff');
eq(result[1].actorName,'Staff Member');
eq(result[2].readingId,null);
eq(result[3].readingId,null);
eq(result[0].entityType,'asset');
eq(result[1].entityType,'facility');
eq(result[0].occurredAt,'2026-10-23 15:00:00');
ok(!JSON.stringify(result).includes('private detail must not be returned'),'raw audit JSON must never leak');
ok(!JSON.stringify(result).includes('never disclose'),'sensitive audit metadata must never leak');
eq(await recentFacilitiesAudit(db,''),[]);
eq(await recentFacilitiesAudit({prepare(){return{bind(){return{all:async()=>({results:[]})}}}}},'company-printing'),[]);
await assert.rejects(()=>recentFacilitiesAudit({prepare(){return{bind(){return{all:async()=>{throw new Error('D1 offline')}}}}}},'company-printing'),/D1 offline/);count++;

const worker=readFileSync(new URL('../worker/facilities.ts',import.meta.url),'utf8');
const view=readFileSync(new URL('../src/centers.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/facility-guided-entry.css',import.meta.url),'utf8');
ok(worker.includes("if(!can(context,'view'))return json({error:'Facilities access is not assigned.'},403)"),'Facilities audit read requires view permission');
ok(worker.includes("const accessError=requireCompany(context,companyId);"),'current company access validation');
ok(worker.includes("if(url.pathname==='/api/facilities/audit'&&request.method==='GET')return facilitiesAudit(request,env,context);"),'GET route wired');
ok(worker.includes('recentFacilitiesAudit(env.DB,companyId)'),'real D1 query used');
ok(worker.includes('JSON.stringify({readingId:id,readingType:body.readingType'),'reading audit captures exact D1 reading ID');
ok(worker.includes("INSERT INTO audit_logs"),'existing atomic writes retained');
ok(view.includes('/api/facilities/audit?companyId='),'frontend GET audit');
ok(view.includes('a.companyId!==requestedCompany'),'reject cross-company response');
ok(view.includes('setAuditEvents([]);setRecordsState(\'error\')'),'clear audit on failures');
ok(view.includes("setAuditEvents([]);setRecordsState('loading')"),'clear on company change');
ok(view.includes('auditEvents.some(event=>event.readingId===item.id)'),'reading evidence match');
ok(view.includes("No Facilities Activity Recorded"),'honest audit empty');
ok(view.includes("Loading audit activity"),'explicit loading');
ok(view.includes('auditEvents.map(event=>'),'render only live events');
ok(view.includes('Raw employee and business data changes are not exposed'),'privacy messaging');
ok(css.includes('.facility-audit-events'),'responsive audit CSS');
console.log('Facilities live audit and correlation checks passed ('+count+' checks).');
