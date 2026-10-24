import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveMaintenanceReferences } from '../worker/facility-reference-guard.ts';

function database({category=true,assetFacility='facility-a',facility=true}={}) {
  const queries=[];
  return {queries,prepare(query){
    return {bind(...params){
      queries.push({query,params});
      return {async first(){
        if(query.includes('maintenance_categories')) return category && params[0]==='generator'
          ?{code:'generator',defaultPriority:'high'}:null;
        if(query.includes('FROM assets')) return params[0]==='asset-a'&&params[1]==='company-a'
          ?{id:'asset-a',facilityId:assetFacility}:null;
        if(query.includes('FROM facilities'))return facility && params[0]==='facility-a'
          &&params[1]==='company-a'?{id:'facility-a'}:null;
        throw new Error('Unrecognized D1 query');
      }};
    }};
  }};
}

const db=database();
let output=await resolveMaintenanceReferences(db,'company-a',{issueCategory:'generator',assetId:'asset-a'});
assert.deepEqual(output,{ok:true,categoryCode:'generator',facilityId:'facility-a',assetId:'asset-a',defaultPriority:'high'});
assert.ok(db.queries.some(x=>x.query.includes('FROM assets')&&x.params.includes('company-a')));
assert.ok(db.queries.some(x=>x.query.includes('FROM facilities')&&x.params.includes('company-a')));
output=await resolveMaintenanceReferences(database(),'company-a',{issueCategory:'generator',facilityId:'facility-a',assetId:'asset-a'});
assert.equal(output.ok,true);
output=await resolveMaintenanceReferences(database(),'company-a',{issueCategory:'generator'});
assert.equal(output.ok,true);
output=await resolveMaintenanceReferences(database(),'company-a',{issueCategory:'invalid'});
assert.deepEqual(output,{ok:false,reason:'category'});
output=await resolveMaintenanceReferences(database(),'company-a',{issueCategory:'generator',assetId:'unknown'});
assert.deepEqual(output,{ok:false,reason:'asset'});
output=await resolveMaintenanceReferences(database(),'company-b',{issueCategory:'generator',assetId:'asset-a'});
assert.deepEqual(output,{ok:false,reason:'asset'});
output=await resolveMaintenanceReferences(database(),'company-a',{issueCategory:'generator',assetId:'asset-a',facilityId:'facility-b'});
assert.deepEqual(output,{ok:false,reason:'asset_facility_mismatch'});
output=await resolveMaintenanceReferences(database({facility:false}),'company-a',{issueCategory:'generator',facilityId:'facility-a'});
assert.deepEqual(output,{ok:false,reason:'facility'});
output=await resolveMaintenanceReferences(database({assetFacility:''}),'company-a',{issueCategory:'generator',assetId:'asset-a'});
assert.equal(output.ok,true);

const source=readFileSync(new URL('../worker/facilities.ts',import.meta.url),'utf8');
assert.match(source,/resolveMaintenanceReferences\(env\.DB,companyId,body\)/);
assert.match(source,/MAINTENANCE_REFERENCE_INVALID/);
assert.match(source,/Number\.isSafeInteger\(body\.estimateKobo\)/);
assert.match(source,/references\.facilityId,references\.assetId/);
assert.match(source,/issueCategory:references\.categoryCode/);
console.log('Facilities server-side approved-reference checks passed (15 cases).');
