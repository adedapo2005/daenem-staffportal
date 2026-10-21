import { hasPermission, type AuthEnv, type SessionContext } from './auth';

interface PrintingProductionEnv extends AuthEnv { FILES: R2Bucket }
type Level='view'|'create'|'edit'|'approve'|'manage';
type PrintStatus='enquiry'|'quoted'|'customer_approved'|'design'|'proof'|'queued'|'printing'|'finishing'|'quality_control'|'packaging'|'ready'|'delivered'|'completed'|'on_hold'|'cancelled';
const companyId='company-printing';
const json=(body:Record<string,unknown>|unknown[],status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const uid=(prefix:string)=>`${prefix}-${crypto.randomUUID()}`;
const requestCorrelationId=(request:Request)=>((request.headers.get('x-request-id')||request.headers.get('cf-ray')||crypto.randomUUID()).slice(0,128));
const can=(context:SessionContext,minimum:Level='view')=>hasPermission(context,'printing.access',minimum,companyId);
const canViewFinancials=(context:SessionContext)=>can(context,'approve')||hasPermission(context,'finance.access','view',companyId);
const financialFields=new Set(['quotedKobo','invoicedKobo','materialCostKobo','labourCostKobo','finishingCostKobo','otherCostKobo','grossProfitKobo','marginBasisPoints','costKobo','unitCostKobo']);
const withoutFinancials=<T extends Record<string,unknown>>(row:T):T=>Object.fromEntries(Object.entries(row).filter(([key])=>!financialFields.has(key))) as T;
const validJobFileKey=(key:string|undefined,jobId:string,categories:string[])=>!key||categories.some((category)=>key.startsWith(`printing/${jobId}/${category}/`));
const forward:Record<PrintStatus,PrintStatus[]>={
  enquiry:['quoted','cancelled','on_hold'],quoted:['customer_approved','cancelled','on_hold'],customer_approved:['design','queued','cancelled','on_hold'],
  design:['proof','queued','on_hold'],proof:['queued','design','on_hold'],queued:['printing','on_hold'],printing:['finishing','quality_control','on_hold'],
  finishing:['quality_control','on_hold'],quality_control:['packaging','printing','finishing','on_hold'],packaging:['ready','quality_control','on_hold'],
  ready:['delivered','on_hold'],delivered:['completed'],completed:[],on_hold:['enquiry','quoted','customer_approved','design','proof','queued','printing','finishing','quality_control','packaging','ready','cancelled'],cancelled:[]
};

async function setting(env:PrintingProductionEnv,key:string,fallback='true'){const row=await env.DB.prepare(`SELECT setting_value AS value FROM app_settings WHERE setting_key=?`).bind(key).first<{value:string}>();return row?.value??fallback}
async function jobRecord(env:PrintingProductionEnv,jobId:string){return env.DB.prepare(`SELECT pj.id,pj.job_no AS jobNo,pj.title,pj.description,pj.sales_order_id AS salesOrderId,pj.production_status AS status,pj.artwork_status AS artworkStatus,pj.proof_status AS proofStatus,pj.priority,pj.quantity,pj.unit,pj.size_spec AS sizeSpec,pj.color_spec AS colorSpec,pj.finishing_spec AS finishingSpec,pj.due_at AS dueAt,pj.started_at AS startedAt,pj.ready_at AS readyAt,pj.completed_at AS completedAt,pj.quoted_kobo AS quotedKobo,pj.invoiced_kobo AS invoicedKobo,pj.material_cost_kobo AS materialCostKobo,pj.labour_cost_kobo AS labourCostKobo,pj.finishing_cost_kobo AS finishingCostKobo,pj.other_cost_kobo AS otherCostKobo,pj.gross_profit_kobo AS grossProfitKobo,pj.margin_basis_points AS marginBasisPoints,pj.customer_id AS customerId,c.name AS customerName,c.business_name AS customerBusiness,pj.service_id AS serviceId,ps.code AS serviceCode,ps.name AS serviceName,ps.requires_artwork AS requiresArtwork,ps.requires_proof AS requiresProof,pj.assigned_designer_id AS designerId,designer.display_name AS designerName,pj.assigned_operator_id AS operatorId,operator.display_name AS operatorName,pj.location_id AS locationId,pj.internal_note AS internalNote,pj.created_at AS createdAt,pj.updated_at AS updatedAt FROM print_jobs pj LEFT JOIN customers c ON c.id=pj.customer_id AND c.company_id=pj.company_id LEFT JOIN printing_services ps ON ps.id=pj.service_id AND ps.company_id=pj.company_id LEFT JOIN employee_company_memberships designer_membership ON designer_membership.employee_id=pj.assigned_designer_id AND designer_membership.company_id=pj.company_id AND designer_membership.active=1 LEFT JOIN employees designer ON designer.id=designer_membership.employee_id LEFT JOIN employee_company_memberships operator_membership ON operator_membership.employee_id=pj.assigned_operator_id AND operator_membership.company_id=pj.company_id AND operator_membership.active=1 LEFT JOIN employees operator ON operator.id=operator_membership.employee_id WHERE pj.id=? AND pj.company_id=? LIMIT 1`).bind(jobId,companyId).first<Record<string,unknown>>()}
async function assertJob(env:PrintingProductionEnv,jobId:string){const job=await jobRecord(env,jobId);return job||null}

async function detail(request:Request,env:PrintingProductionEnv,context:SessionContext){if(!can(context))return json({error:'Daenem Printing access is not assigned.'},403);const jobId=new URL(request.url).searchParams.get('jobId')||'';const job=await assertJob(env,jobId);if(!job)return json({error:'Print job not found.'},404);const [artwork,proofs,materials,qc,finishing,delivery,notes,events]=await Promise.all([
  env.DB.prepare(`SELECT av.id,av.version_no AS versionNo,av.file_key AS fileKey,av.preview_key AS previewKey,av.status,av.source,av.note,av.created_at AS createdAt,creator.display_name AS createdBy,approver.display_name AS approvedBy,av.approved_at AS approvedAt FROM print_artwork_versions av LEFT JOIN employees creator ON creator.id=av.created_by LEFT JOIN employees approver ON approver.id=av.approved_by WHERE av.print_job_id=? ORDER BY av.version_no DESC`).bind(jobId).all<Record<string,unknown>>(),
  env.DB.prepare(`SELECT p.id,p.version_no AS versionNo,p.file_key AS fileKey,p.preview_key AS previewKey,p.sent_at AS sentAt,sender.display_name AS sentBy,p.customer_response AS customerResponse,p.customer_comment AS customerComment,p.responded_at AS respondedAt,p.created_at AS createdAt FROM print_proofs p LEFT JOIN employees sender ON sender.id=p.sent_by WHERE p.print_job_id=? ORDER BY p.version_no DESC`).bind(jobId).all<Record<string,unknown>>(),
  env.DB.prepare(`SELECT m.id,m.actual_quantity AS actualQuantity,m.waste_quantity AS wasteQuantity,m.unit_cost_kobo AS unitCostKobo,m.note,m.recorded_at AS recordedAt,i.sku,i.name AS itemName,i.unit,e.display_name AS issuedBy,l.name AS locationName FROM print_job_materials m JOIN inventory_items i ON i.id=m.item_id AND i.company_id=? LEFT JOIN employees e ON e.id=m.issued_by LEFT JOIN company_locations l ON l.id=m.issued_from_location_id AND l.company_id=? WHERE m.print_job_id=? ORDER BY m.recorded_at DESC`).bind(companyId,companyId,jobId).all<Record<string,unknown>>(),
  env.DB.prepare(`SELECT q.id,q.result,q.checklist_json AS checklistJson,q.note,q.photo_key AS photoKey,q.checked_at AS checkedAt,e.display_name AS checkedBy FROM print_quality_checks q LEFT JOIN employees e ON e.id=q.checked_by WHERE q.print_job_id=? ORDER BY q.checked_at DESC`).bind(jobId).all<Record<string,unknown>>(),
  env.DB.prepare(`SELECT f.id,f.finishing_type AS finishingType,f.quantity,f.cost_kobo AS costKobo,f.result,f.note,f.recorded_at AS recordedAt,e.display_name AS recordedBy FROM print_finishing_records f LEFT JOIN employees e ON e.id=f.recorded_by WHERE f.print_job_id=? ORDER BY f.recorded_at DESC`).bind(jobId).all<Record<string,unknown>>(),
  env.DB.prepare(`SELECT d.id,d.method,d.recipient_name AS recipientName,d.recipient_phone AS recipientPhone,d.delivery_address AS deliveryAddress,d.proof_key AS proofKey,d.note,d.dispatched_at AS dispatchedAt,d.delivered_at AS deliveredAt,d.acknowledged_by_customer AS acknowledgedByCustomer,d.created_at AS createdAt FROM print_delivery_records d WHERE d.print_job_id=? ORDER BY d.created_at DESC`).bind(jobId).all<Record<string,unknown>>(),
  env.DB.prepare(`SELECT n.id,n.note_type AS noteType,n.note,n.created_at AS createdAt,e.display_name AS createdBy FROM print_job_notes n LEFT JOIN employees e ON e.id=n.created_by WHERE n.print_job_id=? ORDER BY n.created_at DESC`).bind(jobId).all<Record<string,unknown>>(),
  env.DB.prepare(`SELECT ev.id,ev.from_status AS fromStatus,ev.to_status AS toStatus,ev.note,ev.occurred_at AS occurredAt,e.display_name AS changedBy FROM print_job_status_events ev LEFT JOIN employees e ON e.id=ev.changed_by WHERE ev.print_job_id=? ORDER BY ev.occurred_at DESC`).bind(jobId).all<Record<string,unknown>>()
]);const finance=canViewFinancials(context);const materialRows=materials.results||[],finishingRows=finishing.results||[],noteRows=notes.results||[];return json({job:finance?job:withoutFinancials(job),artwork:artwork.results||[],proofs:proofs.results||[],materials:finance?materialRows:materialRows.map(withoutFinancials),qualityChecks:qc.results||[],finishing:finance?finishingRows:finishingRows.map(withoutFinancials),delivery:delivery.results||[],notes:finance?noteRows:noteRows.filter((row)=>String(row.noteType)!=='finance'),events:events.results||[]})}

async function upload(request:Request,env:PrintingProductionEnv,context:SessionContext){
  if(!can(context,'create'))return json({error:'Create Printing permission is required.'},403);
  let form:FormData;try{form=await request.formData()}catch{return json({error:'Multipart form data is required.'},400)}
  const jobId=String(form.get('jobId')||''),category=String(form.get('category')||'evidence'),file=form.get('file');
  if(!jobId||!(file instanceof File))return json({error:'Print job and file are required.'},400);
  if(!await assertJob(env,jobId))return json({error:'Print job not found.'},404);
  if(file.size<=0||file.size>25*1024*1024)return json({error:'File must be between 1 byte and 25 MB.'},400);
  const allowedCategories=['artwork','proof','qc','delivery','evidence'];if(!allowedCategories.includes(category))return json({error:'Invalid print file category.'},400);
  const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-120)||'file';
  const bytes=await file.arrayBuffer(),digestBytes=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  const digest=Array.from(digestBytes,byte=>byte.toString(16).padStart(2,'0')).join('');
  const fileId=crypto.randomUUID(),key=`printing/${jobId}/${category}/${Date.now()}-${fileId}-${safeName}`,mime=file.type||'application/octet-stream';
  await env.FILES.put(key,bytes,{httpMetadata:{contentType:mime,cacheControl:'private, no-store'},customMetadata:{companyId,jobId,category,uploadedBy:context.employee.id,originalName:safeName,sha256:digest}});
  const mirrorId=`storage-mirror-printing-${fileId}-${digest}`,idempotencyKey=`microsoft_onedrive:printing:${fileId}:${digest}`;
  const auditId=uid('audit'),requestId=requestCorrelationId(request);
  try{
    await env.DB.batch([
      // R2 is outside D1's transaction. Recheck scope after that await, then
      // require this attempt's exact receipt and audit before accepting the file.
      env.DB.prepare(`SELECT json_extract(CASE WHEN EXISTS(SELECT 1 FROM print_jobs WHERE id=? AND company_id=?) THEN '{}' ELSE '{' END,'$')`).bind(jobId,companyId),
      env.DB.prepare(`INSERT OR IGNORE INTO storage_mirror_jobs(id,provider,source_module,source_id,company_id,r2_key,original_name,mime_type,size_bytes,sha256,idempotency_key,status) VALUES(?,'microsoft_onedrive','printing',?,?,?,?,?,?,?,?,'provider_required')`).bind(mirrorId,fileId,companyId,key,safeName,mime,file.size,digest,idempotencyKey),
      env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source,request_id) VALUES(?,?,?,'printing','upload_file','print_job',?,?,'web',?)`).bind(auditId,context.employee.id,companyId,jobId,JSON.stringify({category,key,name:safeName,size:file.size,type:mime,sha256:digest,backupStatus:'provider_required'}),requestId),
      env.DB.prepare(`SELECT json_extract(CASE WHEN EXISTS(SELECT 1 FROM print_jobs WHERE id=? AND company_id=?)
        AND EXISTS(SELECT 1 FROM storage_mirror_jobs WHERE id=? AND provider='microsoft_onedrive' AND source_module='printing' AND source_id=? AND company_id=? AND r2_key=? AND sha256=? AND size_bytes=? AND idempotency_key=? AND status='provider_required')
        AND EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND actor_employee_id=? AND company_id=? AND module='printing' AND action='upload_file' AND entity_type='print_job' AND entity_id=? AND request_id=?)
        THEN '{}' ELSE '{' END,'$')`).bind(jobId,companyId,mirrorId,fileId,companyId,key,digest,file.size,idempotencyKey,auditId,context.employee.id,companyId,jobId,requestId)
    ]);
  }catch(error){await env.FILES.delete(key);throw error}
  return json({ok:true,key,name:safeName,size:file.size,sha256:digest,backupStatus:'provider_required'});
}

async function fileResponse(request:Request,env:PrintingProductionEnv,context:SessionContext){
  if(!can(context))return json({error:'Daenem Printing access is not assigned.'},403);
  const key=new URL(request.url).searchParams.get('key')||'',parts=key.split('/');
  const jobId=parts[1]||'',category=parts[2]||'';
  if(parts[0]!=='printing'||parts.length<4||!['artwork','proof','qc','delivery','evidence'].includes(category)||!await assertJob(env,jobId))return json({error:'File not found.'},404);
  const object=await env.FILES.get(key);
  if(!object||object.customMetadata?.jobId!==jobId||object.customMetadata?.category!==category)return json({error:'File not found.'},404);
  try{
    const audit=await env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source,request_id) VALUES(?,?,?,'printing','protected_file_read','print_job',?,?,'web',?)`).bind(uid('audit'),context.employee.id,companyId,jobId,JSON.stringify({method:request.method,outcome:'authorized_read',category}),requestCorrelationId(request)).run();
    // A resolved INSERT can still write zero rows. This read needs its own
    // confirmed audit before any object headers or protected bytes are exposed.
    if(audit?.success!==true||audit.meta?.changes!==1)return json({error:'The file is temporarily unavailable.'},503);
  }catch{return json({error:'The file is temporarily unavailable.'},503)}
  const headers=new Headers();
  object.writeHttpMetadata(headers);
  headers.set('cache-control','private, no-store');
  headers.set('content-disposition',`inline; filename="${(object.customMetadata?.originalName||'printing-file').replace(/["\r\n]/g,'')}"`);
  headers.set('x-content-type-options','nosniff');
  headers.set('content-security-policy','default-src \'none\'; sandbox');
  return new Response(request.method==='HEAD'?null:object.body,{headers});
}

async function artwork(request:Request,env:PrintingProductionEnv,context:SessionContext){
  if(!can(context,'edit'))return json({error:'Edit Printing permission is required.'},403);
  let body:{jobId?:string;status?:string;source?:string;note?:string;fileKey?:string;previewKey?:string};
  try{body=await request.json()}catch{return json({error:'Invalid artwork request.'},400)}
  const jobId=String(body.jobId||''),status=String(body.status||'received');
  if(!await assertJob(env,jobId))return json({error:'Print job not found.'},404);
  if(!['received','designing','ready','approved','rejected','superseded'].includes(status))return json({error:'Invalid artwork status.'},400);
  if(status==='approved'&&!can(context,'approve'))return json({error:'Printing approval permission is required to approve artwork.'},403);
  if(!validJobFileKey(body.fileKey,jobId,['artwork'])||!validJobFileKey(body.previewKey,jobId,['artwork']))return json({error:'Artwork files must belong to this print job.'},400);
  const latest=await env.DB.prepare(`SELECT COALESCE(MAX(av.version_no),0) AS versionNo FROM print_artwork_versions av JOIN print_jobs pj ON pj.id=av.print_job_id AND pj.company_id=? WHERE av.print_job_id=?`).bind(companyId,jobId).first<{versionNo:number}>();
  const version=Number(latest?.versionNo||0)+1,id=uid('artwork'),auditId=uid('audit'),requestId=requestCorrelationId(request);
  const jobStatus=status==='rejected'||status==='superseded'?'ready':status;
  // The unique job/version constraint chooses one writer. Each subsequent write
  // requires its predecessor; the final assertion also catches silent no-op writes.
  try{await env.DB.batch([
    env.DB.prepare(`INSERT INTO print_artwork_versions(id,print_job_id,version_no,file_key,preview_key,status,source,note,created_by,approved_by,approved_at) SELECT ?,id,?,?,?,?,?,?,?,?,? FROM print_jobs WHERE id=? AND company_id=?`).bind(id,version,body.fileKey||null,body.previewKey||null,status,body.source||'internal',body.note||null,context.employee.id,status==='approved'?context.employee.id:null,status==='approved'?new Date().toISOString():null,jobId,companyId),
    env.DB.prepare(`UPDATE print_jobs SET artwork_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND changes()=1 AND EXISTS(SELECT 1 FROM print_artwork_versions WHERE id=? AND print_job_id=? AND version_no=? AND status=?)`).bind(jobStatus,jobId,companyId,id,jobId,version,status),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source,request_id) SELECT ?,?,?,'printing','artwork_version','print_job',?,?, 'web',? FROM print_jobs WHERE id=? AND company_id=? AND artwork_status=? AND changes()=1`).bind(auditId,context.employee.id,companyId,jobId,JSON.stringify({version,status,fileKey:body.fileKey||null}),requestId,jobId,companyId,jobStatus),
    env.DB.prepare(`SELECT json_extract(CASE WHEN EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND actor_employee_id=? AND company_id=? AND module='printing' AND action='artwork_version' AND entity_type='print_job' AND entity_id=? AND request_id=?) AND EXISTS(SELECT 1 FROM print_artwork_versions av JOIN print_jobs pj ON pj.id=av.print_job_id AND pj.company_id=? WHERE av.id=? AND av.print_job_id=? AND av.version_no=? AND av.status=? AND pj.artwork_status=?) THEN '{}' ELSE '{' END,'$')`).bind(auditId,context.employee.id,companyId,jobId,requestId,companyId,id,jobId,version,status,jobStatus),
  ])}catch{
    return json({error:'The Printing artwork could not be saved. Refresh and try again.'},503);
  }
  return json({ok:true,artwork:{id,versionNo:version,status}});
}

async function proof(request:Request,env:PrintingProductionEnv,context:SessionContext){
  if(!can(context,'edit'))return json({error:'Edit Printing permission is required.'},403);
  let body:{jobId?:string;action?:'create'|'sent'|'customer_response';proofId?:string;fileKey?:string;previewKey?:string;response?:'pending'|'approved'|'changes_requested'|'rejected';customerComment?:string};
  try{body=await request.json()}catch{return json({error:'Invalid proof request.'},400)}
  const jobId=String(body.jobId||''),action=body.action||'create';
  if(!['create','sent','customer_response'].includes(action))return json({error:'Invalid proof action.'},400);
  if(!await assertJob(env,jobId))return json({error:'Print job not found.'},404);
  if(!validJobFileKey(body.fileKey,jobId,['proof'])||!validJobFileKey(body.previewKey,jobId,['proof']))return json({error:'Proof files must belong to this print job.'},400);
  let proofId=String(body.proofId||'');
  if(action!=='create'&&!proofId)return json({error:'Proof ID is required.'},400);
  if(action==='customer_response'&&!['pending','approved','changes_requested','rejected'].includes(String(body.response)))return json({error:'Proof ID and customer response are required.'},400);
  const auditId=uid('audit'),requestId=requestCorrelationId(request),response=String(body.response||'');
  const statements:D1PreparedStatement[]=[];
  if(action==='create'){
    const latest=await env.DB.prepare(`SELECT COALESCE(MAX(p.version_no),0) AS versionNo FROM print_proofs p JOIN print_jobs j ON j.id=p.print_job_id AND j.company_id=? WHERE p.print_job_id=?`).bind(companyId,jobId).first<{versionNo:number}>();
    proofId=uid('proof');
    statements.push(env.DB.prepare(`INSERT INTO print_proofs(id,print_job_id,version_no,file_key,preview_key,customer_response) SELECT ?,id,?,?,?,'pending' FROM print_jobs WHERE id=? AND company_id=? AND production_status NOT IN ('completed','cancelled')`).bind(proofId,Number(latest?.versionNo||0)+1,body.fileKey||null,body.previewKey||null,jobId,companyId));
    statements.push(env.DB.prepare(`UPDATE print_jobs SET proof_status='pending',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND production_status NOT IN ('completed','cancelled') AND changes()=1 AND EXISTS(SELECT 1 FROM print_proofs WHERE id=? AND print_job_id=?)`).bind(jobId,companyId,proofId,jobId));
  }else if(action==='sent'){
    statements.push(env.DB.prepare(`UPDATE print_proofs SET sent_at=CURRENT_TIMESTAMP,sent_by=? WHERE id=? AND print_job_id=? AND sent_at IS NULL AND customer_response='pending' AND version_no=(SELECT MAX(version_no) FROM print_proofs WHERE print_job_id=?) AND EXISTS(SELECT 1 FROM print_jobs WHERE id=? AND company_id=? AND production_status NOT IN ('completed','cancelled'))`).bind(context.employee.id,proofId,jobId,jobId,jobId,companyId));
    statements.push(env.DB.prepare(`UPDATE print_jobs SET proof_status='sent',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND production_status NOT IN ('completed','cancelled') AND changes()=1 AND EXISTS(SELECT 1 FROM print_proofs WHERE id=? AND print_job_id=? AND sent_by=? AND sent_at IS NOT NULL)`).bind(jobId,companyId,proofId,jobId,context.employee.id));
  }else{
    const jobProof=response==='approved'?'approved':response==='changes_requested'||response==='rejected'?'changes_requested':'pending';
    statements.push(env.DB.prepare(`UPDATE print_proofs SET customer_response=?,customer_comment=?,responded_at=CURRENT_TIMESTAMP,approved_by_employee_id=CASE WHEN ?='approved' THEN ? ELSE NULL END WHERE id=? AND print_job_id=? AND sent_at IS NOT NULL AND customer_response IN ('pending','changes_requested') AND customer_response<>? AND version_no=(SELECT MAX(version_no) FROM print_proofs WHERE print_job_id=?) AND EXISTS(SELECT 1 FROM print_jobs WHERE id=? AND company_id=? AND production_status NOT IN ('completed','cancelled'))`).bind(response,body.customerComment||null,response,context.employee.id,proofId,jobId,response,jobId,jobId,companyId));
    statements.push(env.DB.prepare(`UPDATE print_jobs SET proof_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND production_status NOT IN ('completed','cancelled') AND changes()=1 AND EXISTS(SELECT 1 FROM print_proofs WHERE id=? AND print_job_id=? AND customer_response=?)`).bind(jobProof,jobId,companyId,proofId,jobId,response));
  }
  statements.push(env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source,request_id) SELECT ?,?,?,'printing','proof_update','print_job',?,?, 'web',? FROM print_jobs WHERE id=? AND company_id=? AND changes()=1 AND EXISTS(SELECT 1 FROM print_proofs WHERE id=? AND print_job_id=?)`).bind(auditId,context.employee.id,companyId,jobId,JSON.stringify({action,proofId,response:body.response||null}),requestId,jobId,companyId,proofId,jobId));
  statements.push(env.DB.prepare(`SELECT json_extract(CASE WHEN EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND company_id=? AND module='printing' AND action='proof_update' AND entity_id=? AND request_id=?) AND EXISTS(SELECT 1 FROM print_proofs p JOIN print_jobs j ON j.id=p.print_job_id AND j.company_id=? WHERE p.id=? AND p.print_job_id=? AND p.version_no=(SELECT MAX(version_no) FROM print_proofs WHERE print_job_id=?) AND j.proof_status=?) THEN '{}' ELSE '{' END,'$')`).bind(auditId,companyId,jobId,requestId,companyId,proofId,jobId,jobId,action==='create'?'pending':action==='sent'?'sent':response==='approved'?'approved':response==='pending'?'pending':'changes_requested'));
  try{await env.DB.batch(statements)}catch{
    return json({error:'The Printing proof could not be saved. Refresh and try again.'},503);
  }
  return json({ok:true,proofId,action});
}

async function finishing(request:Request,env:PrintingProductionEnv,context:SessionContext){
  if(!can(context,'create'))return json({error:'Create Printing permission is required.'},403);
  let body:{jobId?:string;finishingType?:string;quantity?:number;costNaira?:number;result?:string;note?:string};
  try{body=await request.json();if(!body||typeof body!=='object'||Array.isArray(body))return json({error:'Invalid finishing record.'},400)}catch{return json({error:'Invalid finishing record.'},400)}
  const jobId=String(body.jobId||''),type=String(body.finishingType||'').trim();
  const costNaira=Number(body.costNaira??0),cost=Math.round(costNaira*100);
  if(!type||!Number.isFinite(costNaira)||costNaira<0||!Number.isSafeInteger(cost)||(body.quantity!=null&&(!Number.isFinite(body.quantity)||body.quantity<0)))return json({error:'Invalid finishing record.'},400);
  if(costNaira>0&&!canViewFinancials(context))return json({error:'Printing approval or Finance view permission is required to record finishing cost.'},403);
  const job=await assertJob(env,jobId);
  if(!job)return json({error:'Print job not found.'},404);
  const expectedStatus=String(job.status);
  if(['completed','cancelled'].includes(expectedStatus))return json({error:'This Printing job cannot accept finishing records.'},409);
  const result=['pending','completed','rework','rejected'].includes(String(body.result))?String(body.result):'completed';
  const id=uid('finishing'),auditId=uid('audit'),requestId=requestCorrelationId(request);
  const revenue=`COALESCE(NULLIF(invoiced_kobo,0),quoted_kobo,0)`;
  const profit=`(${revenue}-material_cost_kobo-finishing_cost_kobo-COALESCE(labour_cost_kobo,0)-COALESCE(other_cost_kobo,0))`;
  // Recompute from durable rows inside the same transaction as the new evidence.
  // Every stage must win; a silent zero-row write also rolls the entire attempt back.
  try{await env.DB.batch([
    env.DB.prepare(`INSERT INTO print_finishing_records(id,print_job_id,finishing_type,quantity,cost_kobo,result,note,recorded_by) SELECT ?,id,?,?,?,?,?,? FROM print_jobs WHERE id=? AND company_id=? AND production_status=? AND production_status NOT IN ('completed','cancelled')`).bind(id,type,body.quantity??null,cost,result,body.note||null,context.employee.id,jobId,companyId,expectedStatus),
    env.DB.prepare(`UPDATE print_jobs SET material_cost_kobo=ROUND(COALESCE((SELECT SUM((actual_quantity+waste_quantity)*unit_cost_kobo) FROM print_job_materials WHERE print_job_id=print_jobs.id),0)),finishing_cost_kobo=ROUND(COALESCE((SELECT SUM(cost_kobo) FROM print_finishing_records WHERE print_job_id=print_jobs.id AND result IN ('completed','rework')),0)),updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND production_status=? AND changes()=1 AND EXISTS(SELECT 1 FROM print_finishing_records WHERE id=? AND print_job_id=?)`).bind(jobId,companyId,expectedStatus,id,jobId),
    env.DB.prepare(`UPDATE print_jobs SET gross_profit_kobo=${profit},margin_basis_points=CASE WHEN ${revenue}>0 THEN FLOOR(1.0*${profit}/${revenue}*10000+0.5) ELSE 0 END WHERE id=? AND company_id=? AND production_status=? AND changes()=1`).bind(jobId,companyId,expectedStatus),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source,request_id) SELECT ?,?,?,'printing','finishing_record','print_job',?,?,'web',? FROM print_jobs WHERE id=? AND company_id=? AND production_status=? AND changes()=1 AND EXISTS(SELECT 1 FROM print_finishing_records WHERE id=? AND print_job_id=?)`).bind(auditId,context.employee.id,companyId,jobId,JSON.stringify({finishingId:id,finishingType:type,costKobo:cost,result}),requestId,jobId,companyId,expectedStatus,id,jobId),
    env.DB.prepare(`SELECT json_extract(CASE WHEN changes()=1 AND EXISTS(SELECT 1 FROM print_finishing_records f JOIN print_jobs j ON j.id=f.print_job_id WHERE f.id=? AND j.id=? AND j.company_id=? AND j.production_status=? AND f.recorded_by=?) AND EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND company_id=? AND module='printing' AND action='finishing_record' AND entity_type='print_job' AND entity_id=? AND actor_employee_id=? AND request_id=?) THEN '{}' ELSE '{' END,'$')`).bind(id,jobId,companyId,expectedStatus,context.employee.id,auditId,companyId,jobId,context.employee.id,requestId),
  ])}catch{
    return json({error:'The Printing finishing record could not be saved. Refresh and try again.'},503);
  }
  return json({ok:true,finishingId:id});
}

async function delivery(request:Request,env:PrintingProductionEnv,context:SessionContext){
  if(!can(context,'edit'))return json({error:'Edit Printing permission is required.'},403);
  let body:{jobId?:string;method?:string;recipientName?:string;recipientPhone?:string;deliveryAddress?:string;proofKey?:string;note?:string;markDelivered?:boolean;acknowledgedByCustomer?:boolean};
  try{body=await request.json()}catch{return json({error:'Invalid delivery record.'},400)}
  const jobId=String(body.jobId||''),job=await assertJob(env,jobId);
  if(!job)return json({error:'Print job not found.'},404);
  if(!validJobFileKey(body.proofKey,jobId,['delivery']))return json({error:'Delivery proof must belong to this print job.'},400);
  if(body.markDelivered&&job.status!=='ready')return json({error:'This Printing job is not ready for delivery.'},409);
  const method=['pickup','company_delivery','courier','customer_transport','other'].includes(String(body.method))?String(body.method):'pickup';
  const id=uid('delivery'),eventId=uid('print-event'),auditId=uid('audit'),requestId=requestCorrelationId(request);
  const deliveredAt=body.markDelivered?new Date().toISOString():null,expectedStatus=body.markDelivered?'delivered':String(job.status);
  const statements:D1PreparedStatement[]=[];
  if(body.markDelivered){
    // The NOT NULL subject makes a stale/lost-race claim abort the whole D1 batch.
    // A delivery record must never survive without its ready -> delivered event.
    statements.push(env.DB.prepare(`INSERT INTO print_job_status_events(id,print_job_id,from_status,to_status,changed_by,note) VALUES(?,(SELECT id FROM print_jobs WHERE id=? AND company_id=? AND production_status='ready'),'ready','delivered',?,'Delivery recorded')`).bind(eventId,jobId,companyId,context.employee.id));
    statements.push(env.DB.prepare(`UPDATE print_jobs SET production_status='delivered',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND production_status='ready' AND changes()=1 AND EXISTS(SELECT 1 FROM print_job_status_events WHERE id=? AND print_job_id=? AND from_status='ready' AND to_status='delivered')`).bind(jobId,companyId,eventId,jobId));
  }
  statements.push(env.DB.prepare(`INSERT INTO print_delivery_records(id,print_job_id,method,recipient_name,recipient_phone,delivery_address,proof_key,note,dispatched_by,delivered_by,dispatched_at,delivered_at,acknowledged_by_customer) SELECT ?,id,?,?,?,?,?,?,?,?,?,?,? FROM print_jobs WHERE id=? AND company_id=? AND production_status=? AND (?=0 OR (changes()=1 AND EXISTS(SELECT 1 FROM print_job_status_events WHERE id=? AND print_job_id=? AND from_status='ready' AND to_status='delivered')))`).bind(id,method,body.recipientName||null,body.recipientPhone||null,body.deliveryAddress||null,body.proofKey||null,body.note||null,context.employee.id,body.markDelivered?context.employee.id:null,new Date().toISOString(),deliveredAt,body.acknowledgedByCustomer?1:0,jobId,companyId,expectedStatus,body.markDelivered?1:0,eventId,jobId));
  statements.push(env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source,request_id) SELECT ?,?,?,'printing','delivery_record','print_job',?,?,'web',? FROM print_delivery_records d JOIN print_jobs j ON j.id=d.print_job_id WHERE d.id=? AND d.print_job_id=? AND j.company_id=? AND j.production_status=? AND changes()=1`).bind(auditId,context.employee.id,companyId,jobId,JSON.stringify({method,markDelivered:Boolean(body.markDelivered),proofKey:body.proofKey||null}),requestId,id,jobId,companyId,expectedStatus));
  // Abort within the batch on a silently ignored write; old evidence cannot satisfy this attempt.
  statements.push(env.DB.prepare(`SELECT json_extract(CASE WHEN changes()=1 AND EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND company_id=? AND module='printing' AND action='delivery_record' AND entity_type='print_job' AND entity_id=? AND request_id=?) AND EXISTS(SELECT 1 FROM print_delivery_records d JOIN print_jobs j ON j.id=d.print_job_id WHERE d.id=? AND d.print_job_id=? AND j.company_id=? AND j.production_status=? AND d.delivered_at IS ?) AND (?=0 OR EXISTS(SELECT 1 FROM print_job_status_events WHERE id=? AND print_job_id=? AND from_status='ready' AND to_status='delivered')) THEN '{}' ELSE '{' END,'$')`).bind(auditId,companyId,jobId,requestId,id,jobId,companyId,expectedStatus,deliveredAt,body.markDelivered?1:0,eventId,jobId));
  try{await env.DB.batch(statements)}catch{
    return json({error:'The Printing delivery could not be saved. Refresh and try again.'},503);
  }
  return json({ok:true,deliveryId:id,delivered:Boolean(body.markDelivered)});
}

async function note(request:Request,env:PrintingProductionEnv,context:SessionContext){
  if(!can(context,'create'))return json({error:'Create Printing permission is required.'},403);
  let body:{jobId?:string;noteType?:string;note?:string};
  try{body=await request.json()}catch{return json({error:'Invalid note request.'},400)}
  const jobId=String(body.jobId||''),text=String(body.note||'').trim();
  if(!text||!await assertJob(env,jobId))return json({error:'Print job and note are required.'},400);
  const type=['internal','customer','production','design','qc','delivery','finance'].includes(String(body.noteType))?String(body.noteType):'internal';
  if(type==='finance'&&!canViewFinancials(context))return json({error:'Printing approval or Finance view permission is required for finance notes.'},403);
  const id=uid('job-note'),auditId=uid('audit'),requestId=requestCorrelationId(request);
  try{
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO print_job_notes(id,print_job_id,note_type,note,created_by) SELECT ?,id,?,?,? FROM print_jobs WHERE id=? AND company_id=?`).bind(id,type,text,context.employee.id,jobId,companyId),
      // Reference the protected note; do not copy its free text into audit metadata.
      env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source,request_id) SELECT ?,?,?,'printing','note_record','print_job',?,?,'web',? FROM print_job_notes n JOIN print_jobs j ON j.id=n.print_job_id WHERE n.id=? AND n.print_job_id=? AND j.company_id=? AND n.created_by=? AND changes()=1`).bind(auditId,context.employee.id,companyId,jobId,JSON.stringify({noteId:id,noteType:type}),requestId,id,jobId,companyId,context.employee.id),
      // Abort the batch on a zero-row note or audit INSERT as well as SQL errors.
      env.DB.prepare(`SELECT json_extract(CASE WHEN changes()=1 AND EXISTS(SELECT 1 FROM print_job_notes n JOIN print_jobs j ON j.id=n.print_job_id WHERE n.id=? AND n.print_job_id=? AND j.company_id=? AND n.note_type=? AND n.created_by=?) AND EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND company_id=? AND module='printing' AND action='note_record' AND entity_type='print_job' AND entity_id=? AND actor_employee_id=? AND request_id=?) THEN '{}' ELSE '{' END,'$')`).bind(id,jobId,companyId,type,context.employee.id,auditId,companyId,jobId,context.employee.id,requestId),
    ]);
  }catch{return json({error:'The Printing note could not be saved. Refresh and try again.'},503)}
  return json({ok:true,noteId:id});
}

async function transition(request:Request,env:PrintingProductionEnv,context:SessionContext){if(!can(context,'edit'))return json({error:'Edit Printing Job permission is required.'},403);let body:{jobId?:string;toStatus?:PrintStatus;note?:string};try{body=await request.json()}catch{return json({error:'Invalid job status request.'},400)}const jobId=String(body.jobId||''),to=body.toStatus;if(!jobId||!to)return json({error:'Job and destination status are required.'},400);if(['customer_approved','completed','cancelled'].includes(to)&&!can(context,'approve'))return json({error:'Printing approval permission is required.'},403);const job=await assertJob(env,jobId);if(!job)return json({error:'Print job not found.'},404);const from=String(job.status) as PrintStatus;if(to==='customer_approved'&&from==='customer_approved'){const linked=job.salesOrderId?await env.DB.prepare(`SELECT id,company_id AS companyId,status,payment_status AS paymentStatus,total_kobo AS totalKobo,EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND company_id=? AND module='printing' AND action='customer_approved_order_link' AND entity_type='print_job' AND entity_id=?) AS hasAudit FROM sales_orders WHERE id=? AND company_id=?`).bind(`print-audit-customer-approved-${jobId}`,companyId,jobId,job.salesOrderId,companyId).first<{id:string;companyId:string;status:string;paymentStatus:string;totalKobo:number;hasAudit:number}>():null;if(!linked||linked.companyId!==companyId||linked.status!=='approved'||linked.paymentStatus==='refunded'||Number(linked.totalKobo)!==Number(job.quotedKobo||0)||!Number(linked.hasAudit))return json({error:'The approved Printing order link is unavailable.'},409);return json({ok:true,status:to,salesOrderId:linked.id})}if(!(forward[from]||[]).includes(to))return json({error:`A print job cannot move directly from ${from} to ${to}.`},409);
  if(to==='queued'){
    if(Number(job.requiresArtwork)&&String(job.artworkStatus)!=='approved')return json({error:'Artwork must be approved before production queue.'},409);
    if(Number(job.requiresProof)&&String(job.proofStatus)!=='approved')return json({error:'Customer proof approval is required before production queue.'},409);
    if(Number(job.requiresProof)&&(await setting(env,'printing.require_proof_evidence_when_service_requires_proof'))==='true'){const approved=await env.DB.prepare(`SELECT COUNT(*) AS count FROM print_proofs WHERE print_job_id=? AND customer_response='approved'`).bind(jobId).first<{count:number}>();if(!Number(approved?.count||0))return json({error:'An approved proof record is required before production queue.'},409)}
  }
  if(['quality_control','packaging','ready','delivered','completed'].includes(to)&&(await setting(env,'printing.require_material_usage_before_qc'))==='true'&&String(job.serviceCode||'')!=='FINISHING'){const materials=await env.DB.prepare(`SELECT COUNT(*) AS count FROM print_job_materials WHERE print_job_id=?`).bind(jobId).first<{count:number}>();if(!Number(materials?.count||0))return json({error:'Material usage and wastage must be recorded before this job can advance.'},409)}
  if(to==='packaging'&&(await setting(env,'printing.require_passed_qc_before_packaging'))==='true'){const qc=await env.DB.prepare(`SELECT result FROM print_quality_checks WHERE print_job_id=? ORDER BY checked_at DESC, rowid DESC LIMIT 1`).bind(jobId).first<{result:string}>();if(qc?.result!=='pass')return json({error:'A passed quality-control check is required before packaging.'},409)}
  if(to==='completed'&&(await setting(env,'printing.require_delivery_record_before_completion'))==='true'){const delivered=await env.DB.prepare(`SELECT COUNT(*) AS count FROM print_delivery_records WHERE print_job_id=? AND delivered_at IS NOT NULL`).bind(jobId).first<{count:number}>();if(!Number(delivered?.count||0))return json({error:'A completed delivery/pickup record is required before this job can be completed.'},409)}
  const extra:string[]=[];if(to==='printing')extra.push(`started_at=COALESCE(started_at,CURRENT_TIMESTAMP)`);if(to==='ready')extra.push(`ready_at=CURRENT_TIMESTAMP`);if(to==='completed')extra.push(`completed_at=CURRENT_TIMESTAMP`);
  if(to==='customer_approved'){
    const linkedSalesOrderId=String(job.salesOrderId||'');
    const salesOrderId=linkedSalesOrderId||`print-order-${jobId}`;
    const existing=await env.DB.prepare(`SELECT id,company_id AS companyId,notes,status,payment_status AS paymentStatus,total_kobo AS totalKobo FROM sales_orders WHERE id=?`).bind(salesOrderId).first<{id:string;companyId:string;notes:string|null;status:string;paymentStatus:string;totalKobo:number}>();
    if(linkedSalesOrderId&&!existing)return json({error:'The Printing sales-order link could not be verified.'},409);
    if(existing&&(existing.companyId!==companyId||(!linkedSalesOrderId&&existing.notes!==`Printing job ${jobId}`)||!['draft','approved'].includes(existing.status)||existing.paymentStatus==='refunded'))return json({error:'The Printing sales-order link could not be verified.'},409);
    if(!linkedSalesOrderId&&Number(job.quotedKobo||0)<=0)return json({error:'A quoted amount is required before approving this Printing job.'},409);
    if(!linkedSalesOrderId&&existing&&(existing.paymentStatus!=='unpaid'||Number(existing.totalKobo)!==Number(job.quotedKobo||0)))return json({error:'The Printing sales-order link could not be verified.'},409);
    const quantity=Math.max(0.000001,Number(job.quantity||1));
    const unitPriceKobo=Math.round(Number(job.quotedKobo||0)/quantity);
    const orderNo=`PRINT-${String(job.jobNo||'').slice(0,80)}`;
    const orderNotes=`Printing job ${jobId}`;
    const requestId=requestCorrelationId(request);
    const linkGuard=linkedSalesOrderId?'sales_order_id=?':'sales_order_id IS NULL';
    const linkGuardBindings=linkedSalesOrderId?[linkedSalesOrderId]:[];
    const eventId=`print-event-customer-approved-${jobId}`,auditId=`print-audit-customer-approved-${jobId}`;
    // Assert the observed commercial state inside the batch, before any writes.
    // A later failure (including an ignored INSERT) must roll back the entire link.
    try{await env.DB.batch([
      env.DB.prepare(`SELECT json_extract(CASE WHEN EXISTS(SELECT 1 FROM print_jobs WHERE id=? AND company_id=? AND production_status=? AND ${linkGuard} AND quoted_kobo IS ? AND quantity IS ? AND title IS ? AND job_no IS ? AND customer_id IS ? AND location_id IS ?) THEN '{}' ELSE '{' END,'$')`).bind(jobId,companyId,from,...linkGuardBindings,job.quotedKobo,job.quantity,job.title,job.jobNo,job.customerId??null,job.locationId??null),
      existing?env.DB.prepare(`SELECT json_extract(CASE WHEN EXISTS(SELECT 1 FROM sales_orders WHERE id=? AND company_id=? AND status=? AND payment_status=? AND total_kobo=? AND notes IS ?) THEN '{}' ELSE '{' END,'$')`).bind(salesOrderId,companyId,existing.status,existing.paymentStatus,existing.totalKobo,existing.notes):env.DB.prepare(`SELECT json_extract(CASE WHEN NOT EXISTS(SELECT 1 FROM sales_orders WHERE id=?) THEN '{}' ELSE '{' END,'$')`).bind(salesOrderId),
      ...(!linkedSalesOrderId?[env.DB.prepare(`INSERT OR IGNORE INTO sales_orders (id,company_id,location_id,customer_id,order_no,channel,order_date,status,payment_status,currency,subtotal_kobo,discount_kobo,tax_kobo,total_kobo,amount_paid_kobo,notes,created_by,approved_by) SELECT ?,company_id,location_id,customer_id,?,'other',date('now'),'approved','unpaid','NGN',quoted_kobo,0,0,quoted_kobo,0,?,?,? FROM print_jobs WHERE id=? AND company_id=? AND production_status=? AND sales_order_id IS NULL AND quoted_kobo>0`).bind(salesOrderId,orderNo,orderNotes,context.employee.id,context.employee.id,jobId,companyId,from),env.DB.prepare(`INSERT OR IGNORE INTO sales_order_items (id,sales_order_id,description,quantity,unit_price_kobo,unit_cost_kobo,discount_kobo,line_total_kobo) SELECT ?,so.id,pj.title,pj.quantity,?,0,0,pj.quoted_kobo FROM print_jobs pj JOIN sales_orders so ON so.id=? AND so.company_id=pj.company_id WHERE pj.id=? AND pj.company_id=? AND pj.production_status=? AND pj.sales_order_id IS NULL AND so.notes=?`).bind(`print-order-item-${jobId}`,unitPriceKobo,salesOrderId,jobId,companyId,from,orderNotes)]:[]),
      env.DB.prepare(`UPDATE print_jobs SET sales_order_id=?,production_status=?,${extra.length?extra.join(',')+',':''}updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND production_status=? AND ${linkGuard}`).bind(salesOrderId,to,jobId,companyId,from,...linkGuardBindings),
      env.DB.prepare(`UPDATE sales_orders SET status='approved',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND status='draft' AND payment_status!='refunded' AND EXISTS(SELECT 1 FROM print_jobs WHERE id=? AND company_id=? AND production_status='customer_approved' AND sales_order_id=?)`).bind(salesOrderId,companyId,jobId,companyId,salesOrderId),
      env.DB.prepare(`INSERT OR IGNORE INTO print_job_status_events(id,print_job_id,from_status,to_status,changed_by,note) SELECT ?,?,?,?, ?,? FROM print_jobs WHERE id=? AND company_id=? AND production_status=? AND sales_order_id=?`).bind(`print-event-customer-approved-${jobId}`,jobId,from,to,context.employee.id,body.note||'Customer-approved order linked to Printing sales order',jobId,companyId,to,salesOrderId),
      env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,before_json,after_json,source,request_id) SELECT ?,?,?, 'printing','customer_approved_order_link','print_job',?,?,?,'web',? FROM print_jobs WHERE id=? AND company_id=? AND production_status=? AND sales_order_id=? AND changes()=1`).bind(auditId,context.employee.id,companyId,jobId,JSON.stringify({status:from,salesOrderId:linkedSalesOrderId||null}),JSON.stringify({status:to,salesOrderId,orderNo,totalKobo:Number(existing?.totalKobo??job.quotedKobo??0),paymentStatus:existing?.paymentStatus||'unpaid'}),requestId,jobId,companyId,to,salesOrderId),
      env.DB.prepare(`SELECT json_extract(CASE WHEN changes()=1 AND EXISTS(SELECT 1 FROM print_jobs pj JOIN sales_orders so ON so.id=pj.sales_order_id AND so.company_id=pj.company_id WHERE pj.id=? AND pj.company_id=? AND pj.production_status='customer_approved' AND pj.sales_order_id=? AND so.status='approved' AND so.payment_status=? AND so.total_kobo=?) AND EXISTS(SELECT 1 FROM print_job_status_events WHERE id=? AND print_job_id=? AND from_status=? AND to_status='customer_approved' AND changed_by=?) AND EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND company_id=? AND module='printing' AND action='customer_approved_order_link' AND entity_type='print_job' AND entity_id=? AND actor_employee_id=? AND request_id=?) THEN '{}' ELSE '{' END,'$')`).bind(jobId,companyId,salesOrderId,existing?.paymentStatus||'unpaid',existing?.totalKobo??job.quotedKobo,eventId,jobId,from,context.employee.id,auditId,companyId,jobId,context.employee.id,requestId),
      ...(!linkedSalesOrderId?[env.DB.prepare(`SELECT json_extract(CASE WHEN EXISTS(SELECT 1 FROM sales_order_items WHERE id=? AND sales_order_id=? AND description=? AND quantity=? AND unit_price_kobo=? AND unit_cost_kobo=0 AND discount_kobo=0 AND line_total_kobo=?) THEN '{}' ELSE '{' END,'$')`).bind(`print-order-item-${jobId}`,salesOrderId,job.title,job.quantity,unitPriceKobo,job.quotedKobo)]:[]),
    ])}catch{
      const committed=await env.DB.prepare(`SELECT pj.sales_order_id AS salesOrderId,so.company_id AS companyId,so.status,so.payment_status AS paymentStatus,so.total_kobo AS totalKobo,EXISTS(SELECT 1 FROM audit_logs a JOIN print_job_status_events e ON e.print_job_id=a.entity_id AND e.changed_by=a.actor_employee_id WHERE a.id=? AND e.id=? AND e.to_status='customer_approved' AND a.company_id=pj.company_id AND a.module='printing' AND a.action='customer_approved_order_link' AND a.entity_type='print_job' AND a.entity_id=pj.id) AS hasAudit FROM print_jobs pj JOIN sales_orders so ON so.id=pj.sales_order_id AND so.company_id=pj.company_id WHERE pj.id=? AND pj.company_id=? AND pj.production_status='customer_approved' AND pj.sales_order_id=?`).bind(auditId,eventId,jobId,companyId,salesOrderId).first<{salesOrderId:string;companyId:string;status:string;paymentStatus:string;totalKobo:number;hasAudit:number}>();
      if(!committed||committed.salesOrderId!==salesOrderId||committed.companyId!==companyId||committed.status!=='approved'||committed.paymentStatus==='refunded'||!Number(committed.hasAudit)||(!linkedSalesOrderId&&(committed.paymentStatus!=='unpaid'||Number(committed.totalKobo)!==Number(job.quotedKobo||0))))return json({error:'The Printing approval could not be saved. Refresh and try again.'},503);
      return json({ok:true,status:to,salesOrderId});
    }
    const linked=await env.DB.prepare(`SELECT pj.sales_order_id AS salesOrderId,so.company_id AS companyId,so.status,so.payment_status AS paymentStatus,so.total_kobo AS totalKobo,EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND company_id=pj.company_id AND module='printing' AND action='customer_approved_order_link' AND entity_type='print_job' AND entity_id=pj.id) AS hasAudit FROM print_jobs pj JOIN sales_orders so ON so.id=pj.sales_order_id AND so.company_id=pj.company_id WHERE pj.id=? AND pj.company_id=? AND pj.production_status='customer_approved'`).bind(`print-audit-customer-approved-${jobId}`,jobId,companyId).first<{salesOrderId:string;companyId:string;status:string;paymentStatus:string;totalKobo:number;hasAudit:number}>();
    if(!linked||linked.salesOrderId!==salesOrderId||linked.companyId!==companyId||linked.status!=='approved'||linked.paymentStatus==='refunded'||!Number(linked.hasAudit)||(!linkedSalesOrderId&&(linked.paymentStatus!=='unpaid'||Number(linked.totalKobo)!==Number(job.quotedKobo||0))))return json({error:'The Printing sales-order approval could not be confirmed.'},409);
    return json({ok:true,status:to,salesOrderId});
  }
  if(to==='completed'){
    const salesOrderId=String(job.salesOrderId||'');
    if(!salesOrderId)return json({error:'A linked Printing sales order is required before completion.'},409);
    const order=await env.DB.prepare(`SELECT status,payment_status AS paymentStatus FROM sales_orders WHERE id=? AND company_id=?`).bind(salesOrderId,companyId).first<{status:string;paymentStatus:string}>();
    if(!order||!['approved','processing'].includes(order.status)||order.paymentStatus==='refunded')return json({error:'The linked Printing sales order is not eligible for completion.'},409);
    const requestId=requestCorrelationId(request);
    const eventId=`print-event-completed-${jobId}`,auditId=`print-audit-completed-${jobId}`;
    // Each write requires the preceding winner. The final assertion runs inside the
    // transaction, so even a silently ignored write rolls back Finance eligibility.
    try{await env.DB.batch([
      env.DB.prepare(`UPDATE sales_orders SET status='completed',updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND status=? AND payment_status=? AND EXISTS(SELECT 1 FROM print_jobs WHERE id=? AND company_id=? AND production_status='delivered' AND sales_order_id=?)`).bind(salesOrderId,companyId,order.status,order.paymentStatus,jobId,companyId,salesOrderId),
      env.DB.prepare(`UPDATE print_jobs SET production_status='completed',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND production_status='delivered' AND sales_order_id=? AND changes()=1 AND EXISTS(SELECT 1 FROM sales_orders WHERE id=? AND company_id=? AND status='completed' AND payment_status=?)`).bind(jobId,companyId,salesOrderId,salesOrderId,companyId,order.paymentStatus),
      env.DB.prepare(`INSERT INTO print_job_status_events(id,print_job_id,from_status,to_status,changed_by,note) SELECT ?,id,'delivered','completed',?,'Delivered Printing job completed and linked sale made Finance eligible' FROM print_jobs WHERE id=? AND company_id=? AND production_status='completed' AND sales_order_id=? AND changes()=1`).bind(eventId,context.employee.id,jobId,companyId,salesOrderId),
      env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,before_json,after_json,source,request_id) SELECT ?,?,?,'printing','completed_sales_order_eligible','print_job',?,?,?,'web',? FROM print_jobs pj JOIN sales_orders so ON so.id=pj.sales_order_id AND so.company_id=pj.company_id WHERE pj.id=? AND pj.company_id=? AND pj.production_status='completed' AND pj.sales_order_id=? AND so.status='completed' AND so.payment_status=? AND changes()=1`).bind(auditId,context.employee.id,companyId,jobId,JSON.stringify({status:'delivered',salesOrderId}),JSON.stringify({status:'completed',salesOrderId,paymentStatus:order.paymentStatus}),requestId,jobId,companyId,salesOrderId,order.paymentStatus),
      env.DB.prepare(`SELECT json_extract(CASE WHEN changes()=1 AND EXISTS(SELECT 1 FROM print_jobs pj JOIN sales_orders so ON so.id=pj.sales_order_id AND so.company_id=pj.company_id WHERE pj.id=? AND pj.company_id=? AND pj.production_status='completed' AND pj.sales_order_id=? AND so.status='completed' AND so.payment_status=?) AND EXISTS(SELECT 1 FROM print_job_status_events WHERE id=? AND print_job_id=? AND from_status='delivered' AND to_status='completed' AND changed_by=?) AND EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND company_id=? AND module='printing' AND action='completed_sales_order_eligible' AND entity_type='print_job' AND entity_id=? AND actor_employee_id=? AND request_id=?) THEN '{}' ELSE '{' END,'$')`).bind(jobId,companyId,salesOrderId,order.paymentStatus,eventId,jobId,context.employee.id,auditId,companyId,jobId,context.employee.id,requestId),
    ])}catch{
      return json({error:'The Printing completion could not be saved. Refresh and try again.'},503);
    }
    return json({ok:true,status:to,salesOrderId});
  }
  const eventId=uid('print-event'),auditId=uid('audit'),requestId=requestCorrelationId(request);
  try{await env.DB.batch([
    // Revalidate current service requirements, approvals and evidence in the
    // status/audit transaction; a revision after preflight must stop production.
    ...(to==='queued'?[env.DB.prepare(`SELECT json_extract(CASE WHEN EXISTS(
      SELECT 1 FROM print_jobs j LEFT JOIN printing_services s ON s.id=j.service_id AND s.company_id=j.company_id
      WHERE j.id=? AND j.company_id=?
        AND (COALESCE(s.requires_artwork,0)=0 OR j.artwork_status='approved')
        AND (COALESCE(s.requires_proof,0)=0 OR (j.proof_status='approved' AND (
          COALESCE((SELECT setting_value FROM app_settings WHERE setting_key='printing.require_proof_evidence_when_service_requires_proof'),'true')!='true'
          OR EXISTS(SELECT 1 FROM print_proofs p WHERE p.print_job_id=j.id AND p.customer_response='approved')
        )))
      ) THEN '{}' ELSE '{' END,'$')`).bind(jobId,companyId)]:[]),
    // QC and its existing configurable gate must still authorize packaging at
    // commit time; an intervening rework/reject cannot reuse the preflight pass.
    ...(to==='packaging'?[env.DB.prepare(`SELECT json_extract(CASE WHEN COALESCE((SELECT setting_value FROM app_settings WHERE setting_key='printing.require_passed_qc_before_packaging'),'true')!='true' OR (SELECT q.result FROM print_quality_checks q JOIN print_jobs j ON j.id=q.print_job_id AND j.company_id=? WHERE q.print_job_id=? ORDER BY q.checked_at DESC,q.rowid DESC LIMIT 1)='pass' THEN '{}' ELSE '{' END,'$')`).bind(companyId,jobId)]:[]),
    env.DB.prepare(`UPDATE print_jobs SET production_status=?,${extra.length?extra.join(',')+',':''}updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND production_status=?`).bind(to,jobId,companyId,from),
    env.DB.prepare(`INSERT INTO print_job_status_events(id,print_job_id,from_status,to_status,changed_by,note) SELECT ?,id,?,?,?,? FROM print_jobs WHERE id=? AND company_id=? AND production_status=? AND changes()=1`).bind(eventId,from,to,context.employee.id,body.note||null,jobId,companyId,to),
    env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,before_json,after_json,source,request_id) SELECT ?,?,?,'printing','status_change','print_job',?,?,?,'web',? FROM print_job_status_events WHERE id=? AND print_job_id=? AND from_status=? AND to_status=?`).bind(auditId,context.employee.id,companyId,jobId,JSON.stringify({status:from}),JSON.stringify({status:to,note:body.note||null}),requestId,eventId,jobId,from,to),
    env.DB.prepare(`SELECT json_extract(CASE WHEN EXISTS(SELECT 1 FROM print_jobs WHERE id=? AND company_id=? AND production_status=?) AND EXISTS(SELECT 1 FROM print_job_status_events WHERE id=? AND print_job_id=? AND from_status=? AND to_status=?) AND EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND company_id=? AND module='printing' AND action='status_change' AND entity_id=? AND request_id=?) THEN '{}' ELSE '{' END,'$')`).bind(jobId,companyId,to,eventId,jobId,from,to,auditId,companyId,jobId,requestId),
  ])}catch(error){const current=await assertJob(env,jobId);if(!current||String(current.status)!==from)return json({error:'Print job status has changed. Refresh and try again.'},409);if(to==='queued')return json({error:'The Printing queue transition could not be saved. Refresh and try again.'},503);if(to==='packaging')return json({error:'The Printing packaging transition could not be saved. Refresh and try again.'},503);throw error}
  return json({ok:true,status:to})}

export async function routePrintingProduction(request:Request,env:PrintingProductionEnv,context:SessionContext):Promise<Response|null>{
  const url=new URL(request.url);
  if(url.pathname==='/api/printing/jobs/files'&&request.method==='POST'){
    // Keep storage, receipt/audit and compensation failures inside the HTTP
    // boundary so the shared runtime still applies its security/CORS headers.
    try{return await upload(request,env,context)}catch{
      return json({error:'The Printing file could not be saved. Please try again later.'},503);
    }
  }
  if(url.pathname==='/api/printing/jobs/detail'&&request.method==='GET')return detail(request,env,context);if(url.pathname==='/api/printing/jobs/file'&&request.method==='GET')return fileResponse(request,env,context);if(url.pathname==='/api/printing/jobs/artwork'&&request.method==='POST')return artwork(request,env,context);if(url.pathname==='/api/printing/jobs/proof'&&request.method==='POST')return proof(request,env,context);if(url.pathname==='/api/printing/jobs/finishing'&&request.method==='POST')return finishing(request,env,context);if(url.pathname==='/api/printing/jobs/delivery'&&request.method==='POST')return delivery(request,env,context);if(url.pathname==='/api/printing/jobs/note'&&request.method==='POST')return note(request,env,context);if(url.pathname==='/api/printing/jobs/status'&&request.method==='POST')return transition(request,env,context);return null
}
