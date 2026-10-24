import { hasPermission, type AuthEnv, type SessionContext } from './auth';
import { resolveMaintenanceReferences, resolveReadingAssetReference } from './facility-reference-guard';
import { validateFacilityRegistration } from './facility-registration-guard';
import { recentFacilityReadings } from './facility-reading-history';
import { recentFacilitiesAudit } from './facility-audit-feed';
import { validateScheduleReferences } from './facility-schedule-guard';
import { resolveWorkOrderParties } from './facility-work-order-guard';
import { validateWorkOrderTransition } from './facility-work-order-lifecycle';
import { inspectFacilitiesQaReadiness } from './facilities-qa-readiness';
import { reconcileExistingQaFacilitiesGrants } from './qa-facilities-grants-repair';
import { facilitiesQaControlResponse } from './facilities-qa-grants-control';
import { verifyQaPersonaAuthentication, QaPersonaFailure, type QaPersonaEnv } from './facilities-qa-persona-verify';
import { runQaFacilitiesTransaction, inspectQaFacilitiesTransaction, QaTransactionFailure } from './facilities-qa-transaction';

interface FacilitiesEnv extends AuthEnv {}
const json=(body:Record<string,unknown>|unknown[],status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const uid=(prefix:string)=>`${prefix}-${crypto.randomUUID()}`;
const can=(context:SessionContext,level:'view'|'create'|'edit'|'approve'|'manage'='view',companyId?:string)=>hasPermission(context,'facilities.access',level,companyId);

// A group-wide permission summary must never grant access to an unassigned company.
// Company-specific overrides, including explicit "none", remain authoritative.
function companyAllowed(context:SessionContext,companyId:string,level:'view'|'create'|'edit'|'approve'|'manage'='view'){
  return context.companies.some(company=>company.id===companyId)&&can(context,level,companyId);
}
function requireCompany(context:SessionContext,companyId?:string,level:'view'|'create'|'edit'|'approve'|'manage'='view'){
  if(!companyId)return 'Company is required.';
  if(!companyAllowed(context,companyId,level))return 'You do not have access to this company.';
  return '';
}

async function overview(request:Request,env:FacilitiesEnv,context:SessionContext){
  if(!can(context))return json({error:'Facilities access is not assigned.'},403);
  const url=new URL(request.url),companyId=url.searchParams.get('companyId')||context.companies[0]?.id||'';
  const accessError=requireCompany(context,companyId);if(accessError)return json({error:accessError},403);
  const [facilities,assets,orders,schedules,recent]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS count FROM facilities WHERE company_id=? AND active=1`).bind(companyId).first<{count:number}>(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM assets WHERE company_id=? AND status!='retired'`).bind(companyId).first<{count:number}>(),
    env.DB.prepare(`SELECT COUNT(*) AS openCount, SUM(CASE WHEN priority IN ('high','critical') THEN 1 ELSE 0 END) AS priorityCount, SUM(CASE WHEN status='awaiting_approval' THEN 1 ELSE 0 END) AS approvalCount, COALESCE(SUM(CASE WHEN status NOT IN ('cancelled') THEN actual_cost_kobo ELSE 0 END),0) AS actualCostKobo FROM maintenance_work_orders WHERE company_id=? AND status NOT IN ('verified','cancelled')`).bind(companyId).first<Record<string,number>>(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM preventive_maintenance_schedules WHERE company_id=? AND active=1 AND ((next_due_at IS NOT NULL AND datetime(next_due_at)<=datetime('now','+7 days')) OR next_due_at IS NULL)`).bind(companyId).first<{count:number}>(),
    env.DB.prepare(`SELECT wo.id,wo.title,wo.issue_category AS issueCategory,wo.priority,wo.status,wo.estimate_kobo AS estimateKobo,wo.actual_cost_kobo AS actualCostKobo,wo.created_at AS createdAt,f.name AS facilityName,a.name AS assetName,COALESCE(ev.display_name,wo.vendor_name) AS assignedTo FROM maintenance_work_orders wo LEFT JOIN facilities f ON f.id=wo.facility_id LEFT JOIN assets a ON a.id=wo.asset_id LEFT JOIN employees ev ON ev.id=wo.assigned_to_employee_id WHERE wo.company_id=? ORDER BY CASE wo.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,wo.created_at DESC LIMIT 20`).bind(companyId).all<Record<string,unknown>>()
  ]);
  return json({companyId,metrics:{facilities:Number(facilities?.count||0),assets:Number(assets?.count||0),openWorkOrders:Number(orders?.openCount||0),priorityWorkOrders:Number(orders?.priorityCount||0),awaitingApproval:Number(orders?.approvalCount||0),maintenanceCostKobo:Number(orders?.actualCostKobo||0),preventiveDue:Number(schedules?.count||0)},recentWorkOrders:recent.results||[]});
}

async function catalog(request:Request,env:FacilitiesEnv,context:SessionContext){
  if(!can(context))return json({error:'Facilities access is not assigned.'},403);
  const url=new URL(request.url),companyId=url.searchParams.get('companyId')||context.companies[0]?.id||'';
  const accessError=requireCompany(context,companyId);if(accessError)return json({error:accessError},403);
  const [facilityRows,assetRows,scheduleRows,vendorRows,categories,locationRows]=await Promise.all([
    env.DB.prepare(`SELECT f.id,f.name,f.facility_type AS facilityType,f.description,f.location_id AS locationId,cl.name AS locationName FROM facilities f LEFT JOIN company_locations cl ON cl.id=f.location_id WHERE f.company_id=? AND f.active=1 ORDER BY f.name`).bind(companyId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT a.id,a.facility_id AS facilityId,f.name AS facilityName,a.asset_tag AS assetTag,a.category,a.name,a.make,a.model,a.serial_no AS serialNo,a.purchase_date AS purchaseDate,a.warranty_expires_at AS warrantyExpiresAt,a.service_interval_hours AS serviceIntervalHours,a.service_interval_days AS serviceIntervalDays,a.last_service_at AS lastServiceAt,a.running_hours AS runningHours,a.status FROM assets a LEFT JOIN facilities f ON f.id=a.facility_id WHERE a.company_id=? AND a.status!='retired' ORDER BY a.category,a.name`).bind(companyId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT s.id,s.facility_id AS facilityId,s.asset_id AS assetId,s.category_code AS categoryCode,s.title,s.interval_type AS intervalType,s.interval_value AS intervalValue,s.last_completed_at AS lastCompletedAt,s.next_due_at AS nextDueAt,s.next_meter_value AS nextMeterValue,s.estimated_cost_kobo AS estimatedCostKobo,s.active,a.name AS assetName,f.name AS facilityName FROM preventive_maintenance_schedules s LEFT JOIN assets a ON a.id=s.asset_id LEFT JOIN facilities f ON f.id=s.facility_id WHERE s.company_id=? AND s.active=1 ORDER BY COALESCE(s.next_due_at,'9999-12-31'),s.title`).bind(companyId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT id,name,service_category AS serviceCategory,contact_person AS contactPerson,phone,email,address,approved FROM maintenance_vendors WHERE (company_id=? OR company_id IS NULL) AND active=1 ORDER BY approved DESC,name`).bind(companyId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT code,name,description,default_priority AS defaultPriority FROM maintenance_categories WHERE active=1 ORDER BY name`).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT id,name,city,state FROM company_locations WHERE company_id=? AND active=1 ORDER BY name`).bind(companyId).all<Record<string,unknown>>()
  ]);
  return json({companyId,facilities:facilityRows.results||[],assets:assetRows.results||[],schedules:scheduleRows.results||[],vendors:vendorRows.results||[],categories:categories.results||[],locations:locationRows.results||[]});
}

async function readingsHistory(request:Request,env:FacilitiesEnv,context:SessionContext){
  if(!can(context,'view'))return json({error:'Facilities access is not assigned.'},403);
  const url=new URL(request.url);
  const companyId=url.searchParams.get('companyId')||context.companies[0]?.id||'';
  const accessError=requireCompany(context,companyId);
  if(accessError)return json({error:accessError},403);
  const readings=await recentFacilityReadings(env.DB,companyId);
  return json({companyId,readings});
}

async function facilitiesAudit(request:Request,env:FacilitiesEnv,context:SessionContext){
  if(!can(context,'view'))return json({error:'Facilities access is not assigned.'},403);
  const url=new URL(request.url);
  const companyId=url.searchParams.get('companyId')||context.companies[0]?.id||'';
  const accessError=requireCompany(context,companyId);
  if(accessError)return json({error:accessError},403);
  const events=await recentFacilitiesAudit(env.DB,companyId);
  return json({companyId,events});
}

async function createFacility(request:Request,env:FacilitiesEnv,context:SessionContext){
  if(!can(context,'create'))return json({error:'Create Facilities permission is required.'},403);
  let body:{companyId?:string;locationId?:string;name?:string;facilityType?:string;description?:string};
  try{body=await request.json()}catch{return json({error:'Invalid facility request.'},400)}
  const companyId=String(body.companyId||'').trim();
  const accessError=requireCompany(context,companyId,'create');
  if(accessError)return json({error:accessError},403);
  const checked=await validateFacilityRegistration(env.DB,companyId,body);
  if(!checked.ok)return json({error:checked.error,code:checked.code},checked.code==='FACILITY_DUPLICATE'?409:400);
  const id=uid('facility');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO facilities(id,company_id,location_id,name,facility_type,description) VALUES(?,?,?,?,?,?)`).bind(id,companyId,checked.locationId,checked.name,checked.facilityType,checked.description),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source) VALUES(?,?,?,'facilities','create','facility',?,?,'web')`).bind(uid('audit'),context.employee.id,companyId,id,JSON.stringify({name:checked.name,facilityType:checked.facilityType,locationId:checked.locationId}))
  ]);
  return json({ok:true,facility:{id,name:checked.name,facilityType:checked.facilityType,locationId:checked.locationId}},201);
}

async function createAsset(request:Request,env:FacilitiesEnv,context:SessionContext){
  if(!can(context,'create'))return json({error:'Create Facilities permission is required.'},403);
  let body:{companyId?:string;facilityId?:string;assetTag?:string;category?:string;name?:string;make?:string;model?:string;serialNo?:string;purchaseDate?:string;purchaseCostKobo?:number;warrantyExpiresAt?:string;serviceIntervalHours?:number;serviceIntervalDays?:number;runningHours?:number};try{body=await request.json()}catch{return json({error:'Invalid asset request.'},400)}
  const companyId=String(body.companyId||'').trim();
  const accessError=requireCompany(context,companyId,'create');if(accessError)return json({error:accessError},403);
  const name=String(body.name||'').trim(),category=String(body.category||'').trim();
  if(!name)return json({error:'Asset name is required.'},400);
  const approved=await resolveMaintenanceReferences(env.DB,companyId,{issueCategory:category,facilityId:body.facilityId});
  if(!approved.ok)return json({error:approved.reason==='category'?'Select an approved active asset category.':'Facility not found for this company.',code:'ASSET_REFERENCE_INVALID'},400);
  const id=uid('asset'),tag=String(body.assetTag||`DG-${crypto.randomUUID().slice(0,8).toUpperCase()}`);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO assets(id,company_id,facility_id,asset_tag,category,name,make,model,serial_no,purchase_date,purchase_cost_kobo,warranty_expires_at,service_interval_hours,service_interval_days,running_hours,qr_value) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,companyId,approved.facilityId,tag,approved.categoryCode,name,body.make||null,body.model||null,body.serialNo||null,body.purchaseDate||null,body.purchaseCostKobo??null,body.warrantyExpiresAt||null,body.serviceIntervalHours??null,body.serviceIntervalDays??null,body.runningHours??null,`daenem://asset/${id}`),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source) VALUES(?,?,?,'facilities','create','asset',?,?,'web')`).bind(uid('audit'),context.employee.id,companyId,id,JSON.stringify({name,category:approved.categoryCode,facilityId:approved.facilityId,assetTag:tag}))
  ]);return json({ok:true,asset:{id,name,assetTag:tag}},201);
}

async function createWorkOrder(request:Request,env:FacilitiesEnv,context:SessionContext){
  if(!can(context,'create'))return json({error:'Create Facilities permission is required.'},403);
  let body:{companyId?:string;facilityId?:string;assetId?:string;issueCategory?:string;title?:string;description?:string;priority?:string;assignedToEmployeeId?:string;vendorId?:string;vendorName?:string;estimateKobo?:number;requestedCompletionAt?:string};try{body=await request.json()}catch{return json({error:'Invalid maintenance request.'},400)}
  const companyId=String(body.companyId||''),accessError=requireCompany(context,companyId,'create');if(accessError)return json({error:accessError},403);
  const title=String(body.title||'').trim();if(!title)return json({error:'Work order title is required.'},400);
  const references=await resolveMaintenanceReferences(env.DB,companyId,body);
  if(!references.ok){const reasons={category:'Select an approved maintenance category.',facility:'Facility not found for this company.',asset:'Equipment not found for this company.',asset_facility_mismatch:'Equipment does not belong to the selected facility.'};return json({error:reasons[references.reason],code:'MAINTENANCE_REFERENCE_INVALID'},400)}
  const requestedPriority=String(body.priority||'').trim().toLowerCase();
  const priorities=['low','normal','high','critical'];
  if(requestedPriority&&!priorities.includes(requestedPriority))return json({error:'Select a valid maintenance priority.'},400);
  const priority=requestedPriority||((priorities.includes(references.defaultPriority)?references.defaultPriority:'normal'));const id=uid('work-order');
  const thresholdRow=await env.DB.prepare(`SELECT setting_value FROM app_settings WHERE setting_key='facilities.manager_approval_threshold_kobo'`).first<{setting_value:string}>();const threshold=Number(thresholdRow?.setting_value||10000000);if(body.estimateKobo!==undefined&&(!Number.isSafeInteger(body.estimateKobo)||body.estimateKobo<0))return json({error:'Estimated cost must be a valid non-negative amount in kobo.'},400);const estimate=body.estimateKobo||0;const needsApproval=estimate>=threshold&&!can(context,'approve',companyId);const status=needsApproval?'awaiting_approval':'reported';
  const parties=await resolveWorkOrderParties(env.DB,companyId,body);
  if(!parties.ok)return json({error:parties.error,code:'MAINTENANCE_ASSIGNMENT_INVALID'},400);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO maintenance_work_orders(id,company_id,facility_id,asset_id,reported_by,assigned_to_employee_id,vendor_id,vendor_name,title,description,issue_category,priority,status,estimate_kobo,requested_completion_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,companyId,references.facilityId,references.assetId,context.employee.id,parties.assignedToEmployeeId,parties.vendorId,body.vendorName||null,title,body.description||null,references.categoryCode,priority,status,estimate||null,body.requestedCompletionAt||null),
    env.DB.prepare(`INSERT INTO maintenance_work_order_events(id,work_order_id,company_id,actor_employee_id,event_type,after_status,note,amount_kobo) VALUES(?,?,?,?,?,?,?,?)`).bind(uid('work-event'),id,companyId,context.employee.id,'reported',status,body.description||null,estimate||null),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source) VALUES(?,?,?,'facilities','create','maintenance_work_order',?,?,'web')`).bind(uid('audit'),context.employee.id,companyId,id,JSON.stringify({title,priority,status,estimateKobo:estimate,issueCategory:references.categoryCode,facilityId:references.facilityId,assetId:references.assetId}))
  ]);return json({ok:true,workOrder:{id,title,status,approvalRequired:needsApproval}},201);
}

async function updateWorkOrder(request:Request,env:FacilitiesEnv,context:SessionContext){
  if(!can(context,'edit'))return json({error:'Edit Facilities permission is required.'},403);
  let body:{workOrderId?:string;status?:string;assignedToEmployeeId?:string;vendorId?:string;estimateKobo?:number;actualCostKobo?:number;resolutionNote?:string;downtimeMinutes?:number;note?:string};try{body=await request.json()}catch{return json({error:'Invalid work order update.'},400)}
  if(!body.workOrderId)return json({error:'Work order is required.'},400);
  // Resolve by ID only inside companies where this session has Facilities edit.
  // Foreign work-order IDs must not reveal whether another company's record exists.
  const editableCompanies=context.companies.filter(company=>can(context,'edit',company.id)).map(company=>company.id);
  if(!editableCompanies.length)return json({error:'Edit Facilities permission is required.'},403);
  const placeholders=editableCompanies.map(()=>'?').join(',');
  const current=await env.DB.prepare(`SELECT id,company_id AS companyId,status,estimate_kobo AS estimateKobo,actual_cost_kobo AS actualCostKobo FROM maintenance_work_orders WHERE id=? AND company_id IN (${placeholders})`).bind(body.workOrderId,...editableCompanies).first<Record<string,unknown>>();
  if(!current)return json({error:'Work order not found.'},404);
  const companyId=String(current.companyId);
  if(!companyAllowed(context,companyId,'edit'))return json({error:'You do not have access to this work order.'},403);
  const parties=await resolveWorkOrderParties(env.DB,companyId,body);
  if(!parties.ok)return json({error:parties.error,code:'MAINTENANCE_ASSIGNMENT_INVALID'},400);
  for(const [value,label] of [[body.estimateKobo,'Estimated cost'],[body.actualCostKobo,'Actual cost'],[body.downtimeMinutes,'Downtime'] ] as const){
    if(value!==undefined&&(!Number.isSafeInteger(value)||value<0))return json({error:label+' must be a non-negative whole number.'},400);
  }
  const requestedStatus=body.status?String(body.status):String(current.status);
  const transition=validateWorkOrderTransition(String(current.status),requestedStatus,can(context,'approve',companyId));
  if(!transition.ok)return json({error:transition.error,code:'MAINTENANCE_STATUS_TRANSITION_INVALID'},transition.statusCode);
  const thresholdRow=await env.DB.prepare("SELECT setting_value FROM app_settings WHERE setting_key='facilities.manager_approval_threshold_kobo'").first<{setting_value:string}>();
  const parsedThreshold=Number(thresholdRow?.setting_value);
  const threshold=Number.isFinite(parsedThreshold)&&parsedThreshold>0?parsedThreshold:10000000;
  const proposedEstimate=body.estimateKobo??Number(current.estimateKobo??0);
  if(body.estimateKobo!==undefined&&proposedEstimate>=threshold&&!can(context,'approve',companyId)&&String(current.status)!=='awaiting_approval')
    return json({error:'An authorized Facilities approver is required for this estimate.'},403);
  const approved=requestedStatus==='approved'&&current.status!=='approved';await env.DB.batch([
    env.DB.prepare(`UPDATE maintenance_work_orders SET status=?,assigned_to_employee_id=COALESCE(?,assigned_to_employee_id),vendor_id=COALESCE(?,vendor_id),estimate_kobo=COALESCE(?,estimate_kobo),actual_cost_kobo=COALESCE(?,actual_cost_kobo),resolution_note=COALESCE(?,resolution_note),downtime_minutes=COALESCE(?,downtime_minutes),approved_by=CASE WHEN ? THEN ? ELSE approved_by END,approved_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE approved_at END,completed_at=CASE WHEN ?='completed' THEN COALESCE(completed_at,CURRENT_TIMESTAMP) ELSE completed_at END,verified_by=CASE WHEN ?='verified' THEN ? ELSE verified_by END,verified_at=CASE WHEN ?='verified' THEN CURRENT_TIMESTAMP ELSE verified_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(requestedStatus,parties.assignedToEmployeeId,parties.vendorId,body.estimateKobo??null,body.actualCostKobo??null,body.resolutionNote||null,body.downtimeMinutes??null,approved?1:0,context.employee.id,approved?1:0,requestedStatus,requestedStatus,context.employee.id,requestedStatus,body.workOrderId),
    env.DB.prepare(`INSERT INTO maintenance_work_order_events(id,work_order_id,company_id,actor_employee_id,event_type,before_status,after_status,note,amount_kobo) VALUES(?,?,?,?,?,?,?,?,?)`).bind(uid('work-event'),body.workOrderId,companyId,context.employee.id,transition.eventType,String(current.status),requestedStatus,body.note||body.resolutionNote||null,body.actualCostKobo??body.estimateKobo??null),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,before_json,after_json,source) VALUES(?,?,?,'facilities','update','maintenance_work_order',?,?,?,'web')`).bind(uid('audit'),context.employee.id,companyId,body.workOrderId,JSON.stringify({status:current.status,estimateKobo:current.estimateKobo,actualCostKobo:current.actualCostKobo}),JSON.stringify({status:requestedStatus,estimateKobo:body.estimateKobo??current.estimateKobo,actualCostKobo:body.actualCostKobo??current.actualCostKobo}))
  ]);return json({ok:true,status:requestedStatus});
}

async function recordReading(request:Request,env:FacilitiesEnv,context:SessionContext){
  if(!can(context,'create'))return json({error:'Create Facilities permission is required.'},403);
  let body:{companyId?:string;facilityId?:string;assetId?:string;readingType?:string;readingValue?:number|string;unit?:string;note?:string;latitude?:number;longitude?:number};
  try{body=await request.json()}catch{return json({error:'Invalid meter reading.'},400)}
  const companyId=String(body.companyId||'').trim(),accessError=requireCompany(context,companyId,'create');
  if(accessError)return json({error:accessError},403);
  const types=['running_hours','diesel_litres','fuel_added_litres','energy_kwh','battery_voltage','water_level','temperature','pressure','other'];
  const raw=body.readingValue;
  if(!body.assetId||!types.includes(String(body.readingType))||
    (typeof raw!=='number'&&typeof raw!=='string')||
    String(raw).trim()===''||!Number.isFinite(Number(raw)))return json({error:'Asset, reading type and numeric reading are required.'},400);
  const value=Number(raw);
  if(['running_hours','diesel_litres','fuel_added_litres','energy_kwh','battery_voltage'].includes(String(body.readingType))&&value<0)
    return json({error:'This meter reading cannot be negative.'},400);
  const selection=await resolveReadingAssetReference(env.DB,companyId,String(body.assetId),body.facilityId);
  if(!selection.ok){
    const reason=selection.reason==='asset'?'Equipment not found for this company.'
      :selection.reason==='facility'?'Facility not found for this company.':'Equipment does not belong to the selected facility.';
    return json({error:reason,code:'ASSET_READING_REFERENCE_INVALID'},400);
  }
  const unit=String(body.unit||'').trim();
  if(unit.length>40)return json({error:'Reading unit is too long.'},400);
  const id=uid('asset-reading');
  const statements=[
    env.DB.prepare(`INSERT INTO asset_readings(id,company_id,facility_id,asset_id,reading_type,reading_value,unit,note,latitude,longitude,recorded_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(id,companyId,selection.facilityId,selection.assetId,body.readingType,value,unit||null,body.note||null,body.latitude??null,body.longitude??null,context.employee.id),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source) VALUES(?,?,?,'facilities','record_reading','asset',?,?,'web')`).bind(uid('audit'),context.employee.id,companyId,selection.assetId,JSON.stringify({readingId:id,readingType:body.readingType,readingValue:value,unit:unit||null,facilityId:selection.facilityId})),
  ];
  if(body.readingType==='running_hours')statements.push(env.DB.prepare(`UPDATE assets SET running_hours=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=?`).bind(value,selection.assetId,companyId));
  await env.DB.batch(statements);
  return json({ok:true,readingId:id});
}

async function createSchedule(request:Request,env:FacilitiesEnv,context:SessionContext){
  if(!can(context,'edit'))return json({error:'Edit Facilities permission is required.'},403);
  let body:{companyId?:string;facilityId?:string;assetId?:string;categoryCode?:string;title?:string;description?:string;intervalType?:string;intervalValue?:number;nextDueAt?:string;nextMeterValue?:number;estimatedCostKobo?:number;defaultAssigneeEmployeeId?:string;defaultVendorId?:string;checklist?:unknown};
  try{body=await request.json()}catch{return json({error:'Invalid maintenance schedule.'},400)}
  const companyId=String(body.companyId||'').trim();
  const accessError=requireCompany(context,companyId,'edit');
  if(accessError)return json({error:accessError},403);
  const title=String(body.title||'').trim();
  const intervalType=String(body.intervalType||'months').trim();
  const intervalValue=body.intervalValue===undefined?1:body.intervalValue;
  if(!title||title.length>180||!['days','weeks','months','running_hours','calendar'].includes(intervalType)||
    !Number.isSafeInteger(intervalValue)||intervalValue<=0)return json({error:'Title and a valid positive whole-number interval are required.'},400);
  const cost=body.estimatedCostKobo;
  if(cost!==undefined&&(!Number.isSafeInteger(cost)||cost<0))return json({error:'Estimated cost must be a non-negative amount in kobo.'},400);
  const refs=await validateScheduleReferences(env.DB,companyId,body);
  if(!refs.ok)return json({error:refs.error,code:'MAINTENANCE_SCHEDULE_REFERENCE_INVALID'},400);
  const id=uid('pm-schedule');
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO preventive_maintenance_schedules(id,company_id,facility_id,asset_id,category_code,title,description,interval_type,interval_value,next_due_at,next_meter_value,default_assignee_employee_id,default_vendor_id,checklist_json,estimated_cost_kobo,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,companyId,refs.facilityId,refs.assetId,refs.categoryCode,title,body.description||null,intervalType,intervalValue,body.nextDueAt||null,body.nextMeterValue??null,refs.defaultAssigneeEmployeeId,refs.defaultVendorId,body.checklist?JSON.stringify(body.checklist):null,cost??null,context.employee.id),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source) VALUES(?,?,?,'facilities','create','preventive_schedule',?,?,'web')`).bind(uid('audit'),context.employee.id,companyId,id,JSON.stringify({title,intervalType,intervalValue,facilityId:refs.facilityId,assetId:refs.assetId,nextDueAt:body.nextDueAt||null}))
  ]);
  return json({ok:true,schedule:{id,title}},201);
}

async function facilitiesQaReadiness(request:Request,env:FacilitiesEnv,context:SessionContext){
  // Never expose this route outside the exact staging D1 binding, including production.
  const stage=env as FacilitiesEnv & {APP_STAGE?:string;STAFFPORTAL_DATABASE_NAME?:string};
  if(stage.APP_STAGE!=='staging'||stage.STAFFPORTAL_DATABASE_NAME!=='daenem-staffportal-staging-db')return json({error:'Not found.'},404);
  const groupOwner=context.companies.some(company=>company.id==='company-printing')&&
    hasPermission(context,'facilities.access','manage','company-printing');
  const syntheticOwner=context.employee.id==='qa-staging-v1-owner'&&
    context.companies.some(company=>company.id==='qa-staging-v1-company-a')&&
    hasPermission(context,'facilities.access','manage','qa-staging-v1-company-a');
  if(!context.roles.some(role=>role.code==='owner')||!(groupOwner||syntheticOwner))
    return json({error:'Not authorized.'},403);
  return json(await inspectFacilitiesQaReadiness(env.DB));
}

function qaGrantRepairAccess(env:FacilitiesEnv,context:SessionContext):Response|null{
  // Never expose the control or mutation outside the exact Staging D1 binding.
  const stage=env as FacilitiesEnv & {APP_STAGE?:string;STAFFPORTAL_DATABASE_NAME?:string};
  if(stage.APP_STAGE!=='staging'||stage.STAFFPORTAL_DATABASE_NAME!=='daenem-staffportal-staging-db')
    return json({error:'Not found.'},404);
  const owner=context.employee.id==='employee-owner-bootstrap'&&
    context.roles.some(role=>role.code==='owner'&&role.companyId==='company-printing')&&
    context.companies.some(company=>company.id==='company-printing')&&
    hasPermission(context,'facilities.access','manage','company-printing');
  return owner?null:json({error:'Not authorized.'},403);
}

async function facilitiesQaGrantControl(request:Request,env:FacilitiesEnv,context:SessionContext){
  const denied=qaGrantRepairAccess(env,context);
  if(denied)return denied;
  const pathname=new URL(request.url).pathname;
  return facilitiesQaControlResponse(pathname.endsWith('/control.js')?'script':
    pathname.endsWith('/control.css')?'style':'page');
}

async function facilitiesQaTransactionEvidence(env:FacilitiesEnv,context:SessionContext){
  const denied=qaGrantRepairAccess(env,context);
  if(denied)return denied;
  return json(await inspectQaFacilitiesTransaction(env.DB));
}

async function facilitiesQaTransactionRun(request:Request,env:FacilitiesEnv,context:SessionContext){
  const denied=qaGrantRepairAccess(env,context);
  if(denied)return denied;
  // Exactly the browser control, current Owner session and staging D1 can
  // initiate this one-time synthetic transaction acceptance.
  const origin=new URL(request.url).origin;
  const suppliedOrigin=request.headers.get('origin');
  const fetchSite=request.headers.get('sec-fetch-site');
  if((suppliedOrigin!==null&&suppliedOrigin!==origin)||
     (fetchSite!==null&&fetchSite!=='same-origin')||
     request.headers.get('x-daenem-qa-transaction')!=='qa-staging-v1'||
     (suppliedOrigin===null&&fetchSite!=='same-origin'))
    return json({error:'Request not allowed.',code:'QA_TRANSACTION_ORIGIN_DENIED'},403);
  const length=request.headers.get('content-length');
  if(length!==null&&length!=='0')
    return json({error:'Request body not allowed.',code:'QA_TRANSACTION_PAYLOAD'},403);
  if(request.body!==null){
    const reader=request.body.getReader();
    const first=await reader.read();
    if(!first.done){
      void reader.cancel().catch(()=>{});
      return json({error:'Request body not allowed.',code:'QA_TRANSACTION_PAYLOAD'},403);
    }
  }
  try{
    return json(await runQaFacilitiesTransaction(env as unknown as QaPersonaEnv,origin,
      (nextRequest,liveEnv,persona)=>routeFacilities(nextRequest,liveEnv as FacilitiesEnv,persona)));
  }catch(error){
    return json({error:'Isolated Facilities transaction acceptance unavailable.',
      code:error instanceof QaTransactionFailure?error.code:'QA_TRANSACTION_RUNTIME'},409);
  }
}

async function facilitiesQaPersonaVerify(request:Request,env:FacilitiesEnv,context:SessionContext){
  // The authenticated Group Owner and exact staging D1 guards are shared with
  // the successful, independently verified synthetic-grants repair route.
  const denied=qaGrantRepairAccess(env,context);
  if(denied)return denied;
  const origin=new URL(request.url).origin;
  const suppliedOrigin=request.headers.get('origin');
  const fetchSite=request.headers.get('sec-fetch-site');
  if((suppliedOrigin!==null&&suppliedOrigin!==origin)||
     (fetchSite!==null&&fetchSite!=='same-origin')||
     request.headers.get('x-daenem-qa-persona')!=='qa-staging-v1'||
     (suppliedOrigin===null&&fetchSite!=='same-origin'))
    return json({error:'Request not allowed.',code:'QA_PERSONA_ORIGIN_DENIED'},403);
  const length=request.headers.get('content-length');
  if(length!==null&&length!=='0')
    return json({error:'Request body not allowed.',code:'QA_PERSONA_PAYLOAD'},403);
  if(request.body!==null){
    const reader=request.body.getReader();
    const first=await reader.read();
    if(!first.done){
      void reader.cancel().catch(()=>{});
      return json({error:'Request body not allowed.',code:'QA_PERSONA_PAYLOAD'},403);
    }
  }
  try {
    return json(await verifyQaPersonaAuthentication(env as unknown as QaPersonaEnv,origin,
      (nextRequest,liveEnv,persona)=>routeFacilities(nextRequest,liveEnv as FacilitiesEnv,persona)));
  }catch(error){
    return json({error:'Synthetic QA persona acceptance unavailable.',
      code:error instanceof QaPersonaFailure?error.code:'QA_PERSONA_RUNTIME'},409);
  }
}

async function facilitiesQaGrantRepair(request:Request,env:FacilitiesEnv,context:SessionContext){
  const denied=qaGrantRepairAccess(env,context);
  if(denied)return denied;
  // Require a header only our same-origin console JS can set: a cross-site
  // caller would need a successful CORS preflight, which staging explicitly
  // does not authorize for this custom header. Do NOT rely solely on cookies.
  const origin=new URL(request.url).origin;
  const suppliedOrigin=request.headers.get('origin');
  const fetchSite=request.headers.get('sec-fetch-site');
  const repairHeader=request.headers.get('x-daenem-qa-repair');
  if(suppliedOrigin!==null&&suppliedOrigin!==origin)
    return json({error:'Request not allowed.',code:'QA_REPAIR_ORIGIN_MISMATCH'},403);
  if(fetchSite!==null&&fetchSite!=='same-origin')
    return json({error:'Request not allowed.',code:'QA_REPAIR_FETCH_SITE'},403);
  if(repairHeader!=='qa-staging-v1'||(suppliedOrigin===null&&fetchSite!=='same-origin'))
    return json({error:'Request not allowed.',code:'QA_REPAIR_SAME_ORIGIN_REQUIRED'},403);
  // Workerd may expose an empty POST as a readable stream rather than null.
  // Inspect at most the first chunk, fail closed on any supplied bytes, and
  // never parse, log or accept arbitrary JSON/form payloads.
  const declaredLength=request.headers.get('content-length');
  if(declaredLength!==null&&declaredLength!=='0')
    return json({error:'Request body not allowed.',code:'QA_REPAIR_PAYLOAD'},403);
  if(request.body!==null){
    const reader=request.body.getReader();
    const first=await reader.read();
    if(!first.done){
      void reader.cancel().catch(()=>{});
      return json({error:'Request body not allowed.',code:'QA_REPAIR_PAYLOAD'},403);
    }
  }
  try {
    return json(await reconcileExistingQaFacilitiesGrants(env.DB,context.employee.id));
  }catch{
    // Neutral refusal: do not disclose secrets, SQL, rows or principal identity.
    return json({error:'Synthetic QA grant reconciliation unavailable.'},409);
  }
}

export async function routeFacilities(request:Request,env:FacilitiesEnv,context:SessionContext):Promise<Response|null>{const url=new URL(request.url);if(url.pathname==='/api/facilities/qa-transaction/evidence'&&request.method==='GET')return facilitiesQaTransactionEvidence(env,context);if(url.pathname==='/api/facilities/qa-transaction/run'&&request.method==='POST')return facilitiesQaTransactionRun(request,env,context);if(url.pathname==='/api/facilities/qa-persona/verify'&&request.method==='POST')return facilitiesQaPersonaVerify(request,env,context);if((url.pathname==='/api/facilities/qa-grants/control'||url.pathname==='/api/facilities/qa-grants/control.js'||url.pathname==='/api/facilities/qa-grants/control.css')&&request.method==='GET')return facilitiesQaGrantControl(request,env,context);if(url.pathname==='/api/facilities/qa-grants/reconcile'&&request.method==='POST')return facilitiesQaGrantRepair(request,env,context);if(url.pathname==='/api/facilities/qa-readiness'&&request.method==='GET')return facilitiesQaReadiness(request,env,context);if(url.pathname==='/api/facilities/overview'&&request.method==='GET')return overview(request,env,context);if(url.pathname==='/api/facilities/catalog'&&request.method==='GET')return catalog(request,env,context);if(url.pathname==='/api/facilities'&&request.method==='POST')return createFacility(request,env,context);if(url.pathname==='/api/facilities/readings'&&request.method==='GET')return readingsHistory(request,env,context);if(url.pathname==='/api/facilities/audit'&&request.method==='GET')return facilitiesAudit(request,env,context);if(url.pathname==='/api/facilities/assets'&&request.method==='POST')return createAsset(request,env,context);if(url.pathname==='/api/facilities/work-orders'&&request.method==='POST')return createWorkOrder(request,env,context);if(url.pathname==='/api/facilities/work-orders/update'&&request.method==='POST')return updateWorkOrder(request,env,context);if(url.pathname==='/api/facilities/readings'&&request.method==='POST')return recordReading(request,env,context);if(url.pathname==='/api/facilities/schedules'&&request.method==='POST')return createSchedule(request,env,context);return null;}
