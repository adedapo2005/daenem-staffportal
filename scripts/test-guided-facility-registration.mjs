import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import {
  STAFFPORTAL_FACILITY_TYPES,
  isApprovedFacilityType,
  suggestFacilityName,
  normaliseFacilityName,
} from '../src/facility-registration-contract.ts';

// Bundle the actual TypeScript guard for executable D1-style behaviour tests.
// No live Cloudflare database or user record is touched.
const entryPoint = fileURLToPath(new URL('../worker/facility-registration-guard.ts', import.meta.url));
const compiled = await build({ entryPoints: [entryPoint], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent' });
const url = 'data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].contents).toString('base64');
const { validateFacilityRegistration } = await import(url);

let cases = 0;
function eq(actual,expected) { assert.deepEqual(actual,expected);cases++; }
function ok(actual) { assert.ok(actual);cases++; }
function database({locationCompany='company-printing',locationActive=true,existing=false}={}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...params) {
          calls.push({sql,params});
          return { async first() {
            if (sql.includes('FROM company_locations')) {
              return params[0]==='location-ikire'&&params[1]===locationCompany&&locationActive
                ? {id:'location-ikire'} : null;
            }
            if (sql.includes('FROM facilities')) {
              return existing && params[0]==='company-printing'
                ? {id:'registered-facility'} : null;
            }
            throw Error('Unexpected D1 query');
          } };
        },
      };
    },
  };
}

eq(STAFFPORTAL_FACILITY_TYPES.some(x=>x.value==='production'),true);
eq(isApprovedFacilityType('office'),true);
eq(isApprovedFacilityType('unknown'),false);
eq(normaliseFacilityName('  Main     Workshop  '),'Main Workshop');
eq(suggestFacilityName('production',{name:'Ikire'}),'Production — Ikire');
eq(suggestFacilityName('workshop'), 'Workshop');
eq(suggestFacilityName('unapproved'), '');

const db=database();
const valid=await validateFacilityRegistration(db,'company-printing',{name:'  Main   Workshop ',facilityType:'workshop',locationId:'location-ikire',description:'Equipment service'});
ok(valid.ok);
eq(valid.name,'Main Workshop');
eq(valid.facilityType,'workshop');
eq(valid.locationId,'location-ikire');
eq(valid.description,'Equipment service');
ok(db.calls.some(c=>c.sql.includes('FROM company_locations')&&c.params.includes('company-printing')));
ok(db.calls.some(c=>c.sql.includes('FROM facilities')&&c.params.includes('company-printing')));
eq((await validateFacilityRegistration(database(),'company-printing',{name:'Office',facilityType:'office'})).ok,true);
eq((await validateFacilityRegistration(database(),'company-printing',{name:'Office'})).ok,true);
eq((await validateFacilityRegistration(database(),'company-printing',{name:'',facilityType:'office'})).code,'FACILITY_NAME_INVALID');
eq((await validateFacilityRegistration(database(),'company-printing',{name:'X'.repeat(181),facilityType:'office'})).code,'FACILITY_NAME_INVALID');
eq((await validateFacilityRegistration(database(),'company-printing',{name:'Office',facilityType:'fabricated'})).code,'FACILITY_TYPE_INVALID');
eq((await validateFacilityRegistration(database(),'company-printing',{name:'Office',facilityType:'office',locationId:'location-other'})).code,'FACILITY_LOCATION_INVALID');
eq((await validateFacilityRegistration(database(),'company-autos',{name:'Office',facilityType:'office',locationId:'location-ikire'})).code,'FACILITY_LOCATION_INVALID');
eq((await validateFacilityRegistration(database({locationActive:false}),'company-printing',{name:'Office',facilityType:'office',locationId:'location-ikire'})).code,'FACILITY_LOCATION_INVALID');
eq((await validateFacilityRegistration(database(),'company-printing',{name:'Office',facilityType:'office',locationId:{id:'location-ikire'}})).code,'FACILITY_LOCATION_INVALID');
eq((await validateFacilityRegistration(database({existing:true}),'company-printing',{name:'Office',facilityType:'office'})).code,'FACILITY_DUPLICATE');
eq((await validateFacilityRegistration(database(),'company-printing',{name:'Office',facilityType:'office',description:'a'.repeat(2001)})).code,'FACILITY_DESCRIPTION_INVALID');
eq((await validateFacilityRegistration(database(),'company-printing',{name:'Office',facilityType:'office',description:123})).code,'FACILITY_DESCRIPTION_INVALID');

const worker=readFileSync(new URL('../worker/facilities.ts',import.meta.url),'utf8');
const view=readFileSync(new URL('../src/centers.tsx',import.meta.url),'utf8');
ok(worker.includes('validateFacilityRegistration(env.DB,companyId,body)'));
ok(worker.includes('checked.code')&&worker.includes('FACILITY_DUPLICATE'));
ok(worker.includes('SELECT id,name,city,state FROM company_locations WHERE company_id=? AND active=1'));
ok(worker.includes('locations:locationRows.results||[]'));
ok(worker.includes('can(context,\'create\')'));
ok(worker.includes("INSERT INTO audit_logs"));
ok(view.includes('SmartMasterSelect label="Facility Type"'));
ok(view.includes('SmartMasterSelect label="Company Location"'));
ok(view.includes('setLocations(c.locations||[])'));
ok(view.includes('suggestFacilityName('));
ok(view.includes("await api('/api/facilities',{method:'POST'"));
ok(view.includes('facilities-guided-create-grid'));
ok(view.includes('duplicateFacility'));
ok(view.includes('setLocations([]);setFacilityDraft('));
console.log('StaffPortal guided facility registration tests passed ('+cases+' focused checks).');
