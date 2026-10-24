import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../worker/facilities.ts', import.meta.url), 'utf8');
let count = 0;
function check(condition, label) { assert.ok(condition, label); count++; }
const section = (name, next) => {
  const start = source.indexOf('async function ' + name + '(');
  assert.ok(start >= 0, 'missing ' + name);
  const end = next ? source.indexOf('async function ' + next + '(', start) : source.indexOf('export async function routeFacilities', start);
  assert.ok(end > start, 'missing boundary for ' + name);
  return source.slice(start, end);
};

check(source.includes("return context.companies.some(company=>company.id===companyId)&&can(context,level,companyId)"), 'Membership and company permission both required');
check(!source.includes("||can(context,'manage')"), 'Global manage shortcut absent');
check(source.includes("hasPermission(context,'facilities.access',level,companyId)"), 'Company-scoped permission resolver');
for (const [name,next] of [
  ['overview','catalog'],['catalog','readingsHistory'],['readingsHistory','facilitiesAudit'],['facilitiesAudit','createFacility'],
]) {
  const s=section(name,next);
  check(s.includes('requireCompany(context,companyId)'), name+' read checks company');
}
for (const [name,next] of [
  ['createFacility','createAsset'],['createAsset','createWorkOrder'],['createWorkOrder','updateWorkOrder'],['recordReading','createSchedule'],
]) {
  const s=section(name,next);
  check(s.includes("requireCompany(context,companyId,'create')"), name+' scoped create');
}
check(section('createSchedule',null).includes("requireCompany(context,companyId,'edit')"), 'Schedules require scoped edit');
const order=section('updateWorkOrder','recordReading');
check(order.includes("context.companies.filter(company=>can(context,'edit',company.id))"), 'Work-order lookup restricts editable companies');
check(order.includes("WHERE id=? AND company_id IN (${placeholders})"), 'SQL constrains work order by company');
check(order.includes('.bind(body.workOrderId,...editableCompanies)'), 'SQL binds allowed companies');
check(order.indexOf('if(!editableCompanies.length)') < order.indexOf('env.DB.prepare('), 'No D1 access without editable company');
check(order.includes("companyAllowed(context,companyId,'edit')"), 'Work-order mutation rechecks company edit');
check(order.includes("!can(context,'approve',companyId)"), 'Work-order approval checks company');
check(section('createWorkOrder','updateWorkOrder').includes("!can(context,'approve',companyId)"), 'Work-order creation approval checks company');
check(source.includes("if(!current)return json({error:'Work order not found.'},404)"), 'Foreign IDs conceal existence');

// Exercise the exact authorization predicate against representative session contexts.
const can = (ctx,level='view',companyId) => {
  const ranks=['none','view','create','edit','approve','manage'];
  const allowed=companyId ? ctx.companyPermissions[companyId]?.['facilities.access'] || 'none' : ctx.permissions['facilities.access'] || 'none';
  return ranks.indexOf(allowed)>=ranks.indexOf(level);
};
const allowed = (ctx,id,level='view') => ctx.companies.some(c=>c.id===id)&&can(ctx,level,id);
const ctx={companies:[{id:'A'},{id:'B'}],permissions:{'facilities.access':'manage'},companyPermissions:{
  A:{'facilities.access':'manage'},B:{'facilities.access':'view'}
}};
check(allowed(ctx,'A','manage'), 'Manager can administer A');
check(allowed(ctx,'B','view'), 'Manager can view B');
check(!allowed(ctx,'B','create'), 'Manager cannot create in view-only B');
check(!allowed(ctx,'B','approve'), 'Manager cannot approve B');
check(!allowed(ctx,'C','view'), 'Global manage never grants unassigned C');
check(!allowed({...ctx,companyPermissions:{...ctx.companyPermissions,B:{'facilities.access':'none'}}},'B'), 'Explicit company denial wins');
check(!allowed({...ctx,companies:[{id:'B'}]},'A'), 'Membership revocation wins');
console.log('Facilities company isolation: '+count+' focused checks passed (source contracts and authorization cases).');
