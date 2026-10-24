import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveWorkOrderParties } from '../worker/facility-work-order-guard.ts';
let checks=0;
function db({employeeCompany='A',vendorCompany='A',employeeActive=true,vendorApproved=true}={}) {
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              if (sql.includes('FROM employees')) return args[0]==='e1' && args[1]===employeeCompany && employeeActive ? {id:'e1'} : null;
              if (sql.includes('FROM maintenance_vendors')) return args[0]==='v1' && args[1]===vendorCompany && vendorApproved ? {id:'v1'} : null;
              throw Error('Unexpected D1 statement');
            },
          };
        },
      };
    },
  };
}
async function verify(input,ok,opts){const result=await resolveWorkOrderParties(db(opts),'A',input);assert.equal(result.ok,ok);checks++;}
await verify({},true);
await verify({assignedToEmployeeId:'e1',vendorId:'v1'},true);
await verify({assignedToEmployeeId:'e1'},true);
await verify({assignedToEmployeeId:'e1'},false,{employeeCompany:'B'});
await verify({assignedToEmployeeId:'e1'},false,{employeeActive:false});
await verify({vendorId:'v1'},false,{vendorCompany:'B'});
await verify({vendorId:'v1'},false,{vendorApproved:false});
await verify({assignedToEmployeeId:{id:'e1'}},false);
await verify({vendorId:123},false);
const code=readFileSync(new URL('../worker/facilities.ts',import.meta.url),'utf8');
const create=code.slice(code.indexOf('async function createWorkOrder('),code.indexOf('async function updateWorkOrder('));
const update=code.slice(code.indexOf('async function updateWorkOrder('),code.indexOf('async function recordReading('));
for(const section of [create,update]){
  assert.ok(section.includes('resolveWorkOrderParties(env.DB,companyId,body)'));checks++;
  assert.ok(section.includes('MAINTENANCE_ASSIGNMENT_INVALID'));checks++;
  assert.ok(section.indexOf('resolveWorkOrderParties(')<section.indexOf('env.DB.batch('));checks++;
  assert.ok(section.includes('parties.assignedToEmployeeId,parties.vendorId'));checks++;
}
assert.ok(update.includes("String(current.status)==='awaiting_approval'"));checks++;
assert.ok(update.includes('proposedEstimate>=threshold'));checks++;
assert.ok(update.includes('Number.isSafeInteger(value)'));checks++;
console.log('Facilities work-order assignment and approval checks: '+checks+' passed');
