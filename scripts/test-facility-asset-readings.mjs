import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ASSET_READING_TYPES, STANDARD_READING_UNITS,
  recommendedReadingUnit, suggestedAssetName,
} from '../src/facility-guided-entry.ts';
import { resolveReadingAssetReference } from '../worker/facility-reference-guard.ts';

const category={code:'generator',name:'Generator',defaultPriority:'high'};
assert.equal(suggestedAssetName(category), 'Generator');
assert.equal(suggestedAssetName(category,'Perkins','P60'), 'Generator — Perkins P60');
assert.equal(suggestedAssetName(category,'','Model X'), 'Generator — Model X');
assert.equal(suggestedAssetName(undefined,'Perkins','P60'), '');
assert.equal(recommendedReadingUnit('running_hours'),'hours');
assert.equal(recommendedReadingUnit('fuel_added_litres'),'litres');
assert.equal(recommendedReadingUnit('diesel_litres'),'litres');
assert.equal(recommendedReadingUnit('energy_kwh'),'kWh');
assert.equal(recommendedReadingUnit('battery_voltage'),'V');
assert.equal(recommendedReadingUnit('temperature'),'°C');
assert.equal(recommendedReadingUnit('pressure'),'');
assert.ok(ASSET_READING_TYPES.some(x=>x.value==='water_level'));
assert.ok(STANDARD_READING_UNITS.includes('kPa'));

function database({assetCompany='company-a',registeredFacility='facility-a',assetStatus='active',facilityActive=true}={}) {
  const calls=[];
  return {calls,prepare(sql){
    return {bind(...params){
      calls.push({sql,params});
      return {async first() {
        if(sql.includes('FROM assets'))return params[0]==='asset-a'&&params[1]===assetCompany&&assetStatus!=='retired'
          ?{id:'asset-a',facilityId:registeredFacility||null}:null;
        if(sql.includes('FROM facilities'))return facilityActive&&params[0]==='facility-a'&&params[1]==='company-a'
          ?{id:'facility-a'}:null;
        throw Error('Unexpected DB query');
      }};
    }};
  }};
}
const good=database();
assert.deepEqual(await resolveReadingAssetReference(good,'company-a','asset-a'),{ok:true,assetId:'asset-a',facilityId:'facility-a'});
assert.ok(good.calls.find(c=>c.sql.includes('FROM assets')&&c.params.includes('company-a')));
assert.deepEqual(await resolveReadingAssetReference(database(),'company-b','asset-a'),{ok:false,reason:'asset'});
assert.deepEqual(await resolveReadingAssetReference(database({assetStatus:'retired'}),'company-a','asset-a'),{ok:false,reason:'asset'});
assert.deepEqual(await resolveReadingAssetReference(database(),'company-a','invalid'),{ok:false,reason:'asset'});
assert.deepEqual(await resolveReadingAssetReference(database(),'company-a','asset-a','facility-b'),{ok:false,reason:'asset_facility_mismatch'});
assert.deepEqual(await resolveReadingAssetReference(database({facilityActive:false}),'company-a','asset-a'),{ok:false,reason:'facility'});
assert.deepEqual(await resolveReadingAssetReference(database({registeredFacility:''}),'company-a','asset-a'),{ok:true,assetId:'asset-a',facilityId:null});
const worker=readFileSync(new URL('../worker/facilities.ts',import.meta.url),'utf8');
const ui=readFileSync(new URL('../src/centers.tsx',import.meta.url),'utf8');
assert.match(worker,/resolveMaintenanceReferences\(env.DB,companyId,\{issueCategory:category,facilityId:body.facilityId\}\)/);
assert.match(worker,/ASSET_REFERENCE_INVALID/);
assert.match(worker,/resolveReadingAssetReference\(env.DB,companyId,String\(body.assetId\),body.facilityId\)/);
assert.match(worker,/ASSET_READING_REFERENCE_INVALID/);
assert.match(worker,/String\(raw\)\.trim\(\)===''/);
assert.match(worker,/selection\.facilityId,selection\.assetId/);
assert.match(ui,/SmartMasterSelect label="Equipment Category"/);
assert.match(ui,/SmartMasterSelect label="Recorded Equipment"/);
assert.match(ui,/Use Suggested Name:/);
assert.match(ui,/STANDARD_READING_UNITS\.map/);
assert.match(ui,/setAssetNameEdited\(true\)/);
assert.match(ui,/currentCompanyRef\.current!==requestedCompany/);
assert.match(ui,/ASSET_READING_TYPES\.map/);
console.log('Asset registration and meter reading guided-entry validation passed (35 checks).');
