import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  assetsForSelectedFacility, recommendedWorkPriority,
  suggestedWorkTitle, validFacilitySelection,
} from '../src/facility-guided-entry.ts';

const facilities=[{id:'f1',name:'Main Factory'},{id:'f2',name:'Production Annex'}];
const assets=[
  {id:'a1',facilityId:'f1',name:'Diesel Generator',category:'generator'},
  {id:'a2',facilityId:'f2',name:'Water Pump',category:'plumbing'},
  {id:'a3',name:'Unassigned Equipment',category:'electrical'},
];
const generator={code:'generator',name:'Generator Service',defaultPriority:'high'};
assert.deepEqual(assetsForSelectedFacility(assets,'f1').map(a=>a.id),['a1']);
assert.deepEqual(assetsForSelectedFacility(assets,'').map(a=>a.id),['a1','a2','a3']);
assert.equal(recommendedWorkPriority(generator),'high');
assert.equal(recommendedWorkPriority({code:'other',name:'Other',defaultPriority:'unexpected'}),'normal');
assert.equal(recommendedWorkPriority(undefined),'normal');
assert.equal(suggestedWorkTitle(generator,facilities[0],assets[0]),'Generator Service — Diesel Generator');
assert.equal(suggestedWorkTitle(generator,facilities[0]),'Generator Service — Main Factory');
assert.equal(suggestedWorkTitle(generator),'Generator Service Maintenance');
assert.equal(suggestedWorkTitle(undefined), '');
assert.equal(validFacilitySelection('f1','a1',facilities,assets),true);
assert.equal(validFacilitySelection('f1','a2',facilities,assets),false);
assert.equal(validFacilitySelection('other','a1',facilities,assets),false);
assert.equal(validFacilitySelection('f1','unknown',facilities,assets),false);
assert.equal(validFacilitySelection('','a2',facilities,assets),true);

const view=readFileSync(new URL('../src/centers.tsx',import.meta.url),'utf8');
assert.match(view,/SmartMasterSelect label="Maintenance Category"/);
assert.match(view,/SmartMasterSelect label="Facility"/);
assert.match(view,/SmartMasterSelect label="Equipment \/ Asset"/);
assert.match(view,/currentCompanyRef\.current!==requestedCompany/);
assert.match(view,/setWorkTitleEdited\(true\)/);
assert.match(view,/validFacilitySelection\(work\.facilityId,work\.assetId,facilities,assets\)/);
assert.match(view,/Use Suggested Title:/);
assert.match(view,/recommendedWorkPriority\(category\)/);
console.log('Facilities guided-entry source and functional contracts passed (22 cases).');
