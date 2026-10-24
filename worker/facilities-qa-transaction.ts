import { getSessionContext, hasPermission, type SessionContext } from './auth';
import { routePasswordAuth } from './password-auth';
import { derivePasswordHash, WORKER_SAFE_PASSWORD_ITERATIONS } from './credential-security';
import { inspectFacilitiesQaReadiness } from './facilities-qa-readiness';
import type { QaPersonaEnv } from './facilities-qa-persona-verify';

type Route = (request: Request, env: QaPersonaEnv, context: SessionContext) => Promise<Response | null>;
const ns = 'qa-staging-v1';
const companyA = ns + '-company-a', companyB = ns + '-company-b';
const siteA = ns + '-site-a';
const managerId = ns + '-manager';
const markerId = ns + '-facilities-transaction-start';
const facilityName = 'QA Staging Facilities D1 Acceptance';
const rollbackName = 'QA Staging Rollback Probe Must Not Persist';
const assetName = 'QA Staging Generator D1 Acceptance';
const assetTag = 'QA-STAGING-V1-GENERATOR';
const readingValue = 321.5;
const evidenceKeys = ['facilities','equipment','readings','workOrders',
  'schedules','inspections','auditEvents'] as const;

export class QaTransactionFailure extends Error {
  constructor(public readonly code:string) { super('Synthetic Facilities transaction acceptance unavailable'); }
}
function fixedTimeEqual(left:string,right:string) {
  if(left.length!==right.length)return false;
  let diff=0;
  for(let i=0;i<left.length;i++)diff|=left.charCodeAt(i)^right.charCodeAt(i);
  return diff===0;
}
const pristine = (r:Awaited<ReturnType<typeof inspectFacilitiesQaReadiness>>) =>
  r.scope===ns&&r.state==='ready'&&r.syntheticCompanies===2&&
  r.syntheticSites===2&&r.syntheticEmployees===3&&
  r.activeMemberships===4&&r.credentials===3&&r.facilitiesGrants===3&&
  r.safeToReset===true&&evidenceKeys.every(k=>r.evidence[k]===0);

type Evidence = {
  scope:'qa-staging-v1';
  state:'not_started'|'in_progress'|'verified'|'incomplete';
  reserved:boolean;
  facilityPersisted:boolean;
  equipmentPersisted:boolean;
  readingPersisted:boolean;
  runningHoursUpdated:boolean;
  auditCorrelated:boolean;
  rollbackProbeAbsent:boolean;
  companyBIsolated:boolean;
  evidence:Awaited<ReturnType<typeof inspectFacilitiesQaReadiness>>['evidence'];
  safeToReset:boolean;
};

/** Read-only fixed-namespace report. No arbitrary IDs, contact data, tokens or SQL results. */
export async function inspectQaFacilitiesTransaction(db:D1Database):Promise<Evidence>{
  const readiness=await inspectFacilitiesQaReadiness(db);
  const reserved=Boolean(await db.prepare(
    "SELECT 1 AS found FROM audit_logs WHERE id=? AND company_id=? AND module='qa-fixture-access' AND action='qa_facilities_transaction_started'"
  ).bind(markerId,companyA).first());
  const facility=await db.prepare(
    "SELECT id FROM facilities WHERE company_id=? AND location_id=? AND name=? AND facility_type='office' AND active=1 LIMIT 1"
  ).bind(companyA,siteA,facilityName).first<{id:string}>();
  const asset=await db.prepare(
    "SELECT id,facility_id AS facilityId,category,name,running_hours AS runningHours FROM assets WHERE company_id=? AND asset_tag=? LIMIT 1"
  ).bind(companyA,assetTag).first<{id:string;facilityId:string;category:string;name:string;runningHours:number|null}>();
  const reading=asset?await db.prepare(
    "SELECT id,facility_id AS facilityId,reading_value AS readingValue,recorded_by AS recordedBy FROM asset_readings WHERE company_id=? AND asset_id=? AND reading_type='running_hours' LIMIT 1"
  ).bind(companyA,asset.id).first<{id:string;facilityId:string;readingValue:number;recordedBy:string}>():null;
  const audit=await db.prepare(
    "SELECT action,entity_type AS entityType,entity_id AS entityId,after_json AS afterJson,actor_employee_id AS actorId FROM audit_logs WHERE company_id=? AND module='facilities'"
  ).bind(companyA).all<{action:string;entityType:string;entityId:string;afterJson:string;actorId:string}>();
  const entries=audit.results||[];
  const facilityAudit=Boolean(facility&&entries.some(e=>e.action==='create'&&e.entityType==='facility'&&e.entityId===facility.id&&e.actorId===managerId));
  const assetAudit=Boolean(asset&&entries.some(e=>e.action==='create'&&e.entityType==='asset'&&e.entityId===asset.id&&e.actorId===managerId));
  const meterAudit=Boolean(asset&&reading&&entries.some(e=>{
    if(e.action!=='record_reading'||e.entityType!=='asset'||e.entityId!==asset.id||e.actorId!==managerId)return false;
    try{return JSON.parse(e.afterJson||'null')?.readingId===reading.id;}catch{return false;}
  }));
  const rollbackProbeAbsent=!Boolean(await db.prepare(
    'SELECT 1 AS found FROM facilities WHERE company_id=? AND name=? LIMIT 1'
  ).bind(companyA,rollbackName).first());
  const foreign=await db.prepare(
    'SELECT (SELECT COUNT(*) FROM facilities WHERE company_id=?) AS facilities, (SELECT COUNT(*) FROM assets WHERE company_id=?) AS assets, (SELECT COUNT(*) FROM asset_readings WHERE company_id=?) AS readings, (SELECT COUNT(*) FROM audit_logs WHERE company_id=? AND module=?) AS audits'
  ).bind(companyB,companyB,companyB,companyB,'facilities').first<{facilities:number;assets:number;readings:number;audits:number}>();
  const companyBIsolated=Boolean(foreign&&Object.values(foreign).every(v=>Number(v)===0));
  const facilityPersisted=Boolean(facility);
  const equipmentPersisted=Boolean(asset&&facility&&asset.facilityId===facility.id&&asset.category==='generator'&&asset.name===assetName);
  const readingPersisted=Boolean(reading&&facility&&reading.facilityId===facility.id&&Number(reading.readingValue)===readingValue&&reading.recordedBy===managerId);
  const runningHoursUpdated=Boolean(asset&&Number(asset.runningHours)===readingValue);
  const auditCorrelated=facilityAudit&&assetAudit&&meterAudit&&entries.length===3;
  const counts=readiness.evidence;
  const exact=counts.facilities===1&&counts.equipment===1&&counts.readings===1&&
    counts.auditEvents===3&&counts.workOrders===0&&counts.schedules===0&&counts.inspections===0;
  const verified=reserved&&readiness.state==='transaction_evidence_present'&&
    facilityPersisted&&equipmentPersisted&&readingPersisted&&runningHoursUpdated&&
    auditCorrelated&&rollbackProbeAbsent&&companyBIsolated&&exact;
  const empty=evidenceKeys.every(k=>counts[k]===0);
  const state=verified?'verified':!reserved&&empty?'not_started':reserved&&empty?'in_progress':'incomplete';
  return {scope:ns,state,reserved,facilityPersisted,equipmentPersisted,readingPersisted,
    runningHoursUpdated,auditCorrelated,rollbackProbeAbsent,companyBIsolated,
    evidence:counts,safeToReset:readiness.safeToReset&&!reserved};
}

/**
 * One-shot, append-only, canonical Worker Facilities acceptance.
 * The protected Owner route must authorize exact staging D1 and same-origin
 * invocation before calling this. Only synthetic QA company A may be written.
 */
export async function runQaFacilitiesTransaction(
  env:QaPersonaEnv,origin:string,route:Route,phase:'prepare'|'write'
){
  if(env.APP_STAGE!=='staging'||env.STAFFPORTAL_DATABASE_NAME!=='daenem-staffportal-staging-db')
    throw new QaTransactionFailure('QA_TRANSACTION_STAGE');
  const prior=await inspectFacilitiesQaReadiness(env.DB);
  if(!pristine(prior))throw new QaTransactionFailure('QA_TRANSACTION_FIXTURE_NOT_READY');
  if(phase==='prepare'){
    const initial=await inspectQaFacilitiesTransaction(env.DB);
    if(initial.state!=='not_started'||!initial.rollbackProbeAbsent||!initial.companyBIsolated)
      throw new QaTransactionFailure('QA_TRANSACTION_ALREADY_ATTEMPTED');
  }else{
    const reservation=await env.DB.prepare(
      "SELECT 1 AS found FROM audit_logs WHERE id=? AND company_id=? AND module='qa-fixture-access' AND action='qa_facilities_transaction_started'"
    ).bind(markerId,companyA).first();
    if(!reservation)throw new QaTransactionFailure('QA_TRANSACTION_NOT_PREPARED');
  }
  const password=env.STAFFPORTAL_QA_MANAGER_PASSWORD;
  if(!env.AUTH_PEPPER||typeof password!=='string'||password.length<16||password.length>128)
    throw new QaTransactionFailure('QA_TRANSACTION_SECRET_UNAVAILABLE');
  const credential=await env.DB.prepare(
    'SELECT c.password_hash AS hash,c.password_salt AS salt,c.password_iterations AS iterations FROM employee_credentials c JOIN employees e ON e.id=c.employee_id WHERE c.employee_id=? AND c.username=? AND e.employment_status=?'
  ).bind(managerId,managerId,'active').first<{hash:string;salt:string;iterations:number}>();
  if(!credential||Number(credential.iterations)!==WORKER_SAFE_PASSWORD_ITERATIONS)
    throw new QaTransactionFailure('QA_TRANSACTION_CREDENTIAL_INCOMPATIBLE');
  const hashed=await derivePasswordHash(env,password,credential.salt,Number(credential.iterations));
  if(!fixedTimeEqual(hashed,credential.hash))
    throw new QaTransactionFailure('QA_TRANSACTION_SECRET_MISMATCH');

  let newSessionId:string|undefined;
  try{
    const authResponse=await routePasswordAuth(new Request(origin+'/api/auth/login',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({identifier:managerId,password})
    }),env);
    if(authResponse?.status!==200)throw new QaTransactionFailure('QA_TRANSACTION_LOGIN_UNAVAILABLE');
    const cookie=authResponse.headers.get('set-cookie')?.split(';')[0];
    if(!cookie?.startsWith('daenem_workforce_session='))
      throw new QaTransactionFailure('QA_TRANSACTION_SESSION_MISSING');
    const manager=await getSessionContext(new Request(origin+'/api/auth/me',{
      headers:{cookie}
    }),env);
    if(!manager||manager.employee.id!==managerId||!manager.sessionId)
      throw new QaTransactionFailure('QA_TRANSACTION_CONTEXT_UNAVAILABLE');
    newSessionId=manager.sessionId;
    if(manager.companies.length!==1||manager.companies[0].id!==companyA||
      !manager.roles.some(r=>r.code==='manager'&&r.companyId===companyA)||
      !hasPermission(manager,'facilities.access','create',companyA)||
      hasPermission(manager,'facilities.access','view',companyB))
      throw new QaTransactionFailure('QA_TRANSACTION_RBAC_MISMATCH');

    const call=async(method:'GET'|'POST',path:string,body?:Record<string,unknown>,db=env.DB)=>{
      const request=new Request(origin+path,{method,
        ...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
      const response=await route(request,{...env,DB:db},manager);
      if(!response)throw new QaTransactionFailure('QA_TRANSACTION_ROUTE_MISSING');
      return response;
    };
    if(phase==='prepare'){
    // A denied cross-company write must occur before any test records exist.
    if((await call('POST','/api/facilities',{
      companyId:companyB,locationId:ns+'-site-b',facilityType:'office',
      name:'QA Foreign Company Must Not Persist'})).status!==403)
      throw new QaTransactionFailure('QA_TRANSACTION_FOREIGN_WRITE_NOT_DENIED');

    // Reservation is append-only and unique across concurrent Owners. A second
    // invocation cannot produce duplicate facilities or audit events.
    await env.DB.prepare(
      'INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,reason,source) VALUES(?,?,?,?,?,?,?,?,?)'
    ).bind(markerId,managerId,companyA,'qa-fixture-access','qa_facilities_transaction_started',
      'qa_fixture',ns,'One-time isolated Facilities D1 acceptance reservation.','system').run();

    // Inject failure ONLY into the audit stage of a real canonical Facilities
    // creation batch. Cloudflare D1 must roll back the preceding facility insert.
    const failingDb={
      prepare:(sql:string)=>env.DB.prepare(sql),
      batch:(statements:D1PreparedStatement[])=>{
        if(statements.length!==2)throw new QaTransactionFailure('QA_TRANSACTION_UNEXPECTED_BATCH');
        return env.DB.batch([statements[0],env.DB.prepare("SELECT json('QA_TRANSACTION_INJECTED_FAILURE')")]);
      }
    } as D1Database;
    let rolledBack=false;
    try{
      await call('POST','/api/facilities',{
        companyId:companyA,locationId:siteA,name:rollbackName,facilityType:'office'
      },failingDb);
    }catch{rolledBack=true;}
    if(!rolledBack)throw new QaTransactionFailure('QA_TRANSACTION_ROLLBACK_NOT_OBSERVED');
    const noRollbackRow=await env.DB.prepare(
      'SELECT 1 AS found FROM facilities WHERE company_id=? AND name=?'
    ).bind(companyA,rollbackName).first();
    if(noRollbackRow)throw new QaTransactionFailure('QA_TRANSACTION_ROLLBACK_BROKEN');
    const afterFailure=await inspectFacilitiesQaReadiness(env.DB);
    if(!pristine(afterFailure))throw new QaTransactionFailure('QA_TRANSACTION_ROLLBACK_CHANGED_RECORDS');

      const saved=await env.DB.prepare(
        'SELECT password_hash AS hash FROM employee_credentials WHERE employee_id=?'
      ).bind(managerId).first<{hash:string}>();
      if(!saved||!fixedTimeEqual(credential.hash,saved.hash))
        throw new QaTransactionFailure('QA_TRANSACTION_CREDENTIAL_CHANGED');
    } else {
    const created=await call('POST','/api/facilities',{
      companyId:companyA,locationId:siteA,name:facilityName,facilityType:'office'
    });
    if(created.status!==201)throw new QaTransactionFailure('QA_TRANSACTION_FACILITY_CREATE');
    const facilityId=(await created.json() as {facility?:{id?:string}}).facility?.id;
    if(!facilityId?.startsWith('facility-'))
      throw new QaTransactionFailure('QA_TRANSACTION_FACILITY_ID');

    const duplicate=await call('POST','/api/facilities',{
      companyId:companyA,locationId:siteA,name:facilityName,facilityType:'office'
    });
    if(duplicate.status!==409)throw new QaTransactionFailure('QA_TRANSACTION_DUPLICATE_ACCEPTED');

    const equipment=await call('POST','/api/facilities/assets',{
      companyId:companyA,facilityId,assetTag,category:'generator',name:assetName
    });
    if(equipment.status!==201)throw new QaTransactionFailure('QA_TRANSACTION_ASSET_CREATE');
    const assetId=(await equipment.json() as {asset?:{id?:string}}).asset?.id;
    if(!assetId?.startsWith('asset-'))
      throw new QaTransactionFailure('QA_TRANSACTION_ASSET_ID');

    const meter=await call('POST','/api/facilities/readings',{
      companyId:companyA,facilityId,assetId,readingType:'running_hours',
      readingValue,unit:'hours',note:'Isolated QA D1 acceptance.'
    });
    if(meter.status!==200)throw new QaTransactionFailure('QA_TRANSACTION_READING_CREATE');
    const readingId=(await meter.json() as {readingId?:string}).readingId;
    if(!readingId?.startsWith('asset-reading-'))
      throw new QaTransactionFailure('QA_TRANSACTION_READING_ID');

    const catalog=await call('GET','/api/facilities/catalog?companyId='+companyA);
    const catalogJson=await catalog.json() as {facilities?:Array<{id:string}>;assets?:Array<{id:string;runningHours:number}>};
    if(catalog.status!==200||
      !catalogJson.facilities?.some(f=>f.id===facilityId)||
      !catalogJson.assets?.some(a=>a.id===assetId&&Number(a.runningHours)===readingValue))
      throw new QaTransactionFailure('QA_TRANSACTION_CATALOG_READBACK');
    const readings=await call('GET','/api/facilities/readings?companyId='+companyA);
    const readingJson=await readings.json() as {readings?:Array<{id:string;readingValue:number}>};
    if(readings.status!==200||
      !readingJson.readings?.some(r=>r.id===readingId&&Number(r.readingValue)===readingValue))
      throw new QaTransactionFailure('QA_TRANSACTION_METER_READBACK');
    const audits=await call('GET','/api/facilities/audit?companyId='+companyA);
    const auditJson=await audits.json() as {events?:Array<{action:string;entityId:string;entityType:string;readingId?:string}>};
    if(audits.status!==200||
      !auditJson.events?.some(e=>e.action==='create'&&e.entityType==='facility'&&e.entityId===facilityId)||
      !auditJson.events?.some(e=>e.action==='create'&&e.entityType==='asset'&&e.entityId===assetId)||
      !auditJson.events?.some(e=>e.action==='record_reading'&&e.entityId===assetId&&e.readingId===readingId))
      throw new QaTransactionFailure('QA_TRANSACTION_AUDIT_READBACK');
    if((await call('GET','/api/facilities/catalog?companyId='+companyB)).status!==403)
      throw new QaTransactionFailure('QA_TRANSACTION_FOREIGN_CATALOG_EXPOSED');

    // Independent persisted D1 acceptance occurs through the Owner-only GET
    // evidence endpoint in a separate Worker invocation (keeps D1 query limits).

    const fingerprint=await env.DB.prepare(
      'SELECT password_hash AS hash FROM employee_credentials WHERE employee_id=?'
    ).bind(managerId).first<{hash:string}>();
    if(!fingerprint||!fixedTimeEqual(credential.hash,fingerprint.hash))
      throw new QaTransactionFailure('QA_TRANSACTION_CREDENTIAL_CHANGED');
    }
  }finally{
    if(newSessionId){
      await env.DB.prepare(
        'UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP) WHERE id=? AND employee_id=?'
      ).bind(newSessionId,managerId).run();
    }
  }
  return phase==='prepare'
    ?{ok:true,scope:ns,state:'prepared',rollbackVerified:true,
      companyIsolationVerified:true,syntheticSessionRevoked:true,realCompanyMutated:false}
    :{ok:true,scope:ns,state:'written',facility:1,equipment:1,readings:1,
      facilitiesAudits:3,rollbackVerified:true,companyIsolationVerified:true,
      syntheticSessionRevoked:true,realCompanyMutated:false};
}
