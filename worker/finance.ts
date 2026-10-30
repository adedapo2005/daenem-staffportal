import { hasPermission,type AuthEnv,type SessionContext } from './auth';

interface Env extends AuthEnv{}
const json=(body:Record<string,unknown>|unknown[],status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const uid=(p:string)=>`${p}-${crypto.randomUUID()}`;
const member=(c:SessionContext,id:string)=>c.roles.some(r=>r.code==='owner')||c.companies.some(x=>x.id===id);
const can=(c:SessionContext,p:string,l:'view'|'create'|'edit'|'approve'|'manage',companyId:string)=>hasPermission(c,p,l,companyId);

// Resolve effective Finance Journal authority from current D1 rows inside
// the same D1 transaction as the journal write; do not trust cached context.
const financeJournalLevelSql=(column:string)=>`CASE ${column} WHEN 'view' THEN 1 WHEN 'create' THEN 2
  WHEN 'edit' THEN 3 WHEN 'approve' THEN 4 WHEN 'manage' THEN 5 ELSE 0 END`;
const financeJournalWriteGate=(context:SessionContext,companyId:string,minimum:'create'|'approve')=>({
  sql:`EXISTS(
    SELECT 1 FROM auth_sessions s
    JOIN employees actor ON actor.id=s.employee_id
    JOIN employee_company_memberships m ON m.employee_id=actor.id
      AND m.company_id=? AND m.active=1
    JOIN companies business ON business.id=m.company_id AND business.active=1
    WHERE s.id=? AND s.employee_id=? AND s.revoked_at IS NULL
      AND datetime(s.expires_at)>datetime('now')
      AND actor.employment_status='active'
      AND COALESCE(
        (SELECT ${financeJournalLevelSql('o.access_level')}
         FROM employee_permission_overrides_v2 o
         JOIN permissions p ON p.id=o.permission_id
         WHERE o.employee_id=? AND o.company_id=?
           AND p.code='finance.journal'
           AND (o.expires_at IS NULL OR datetime(o.expires_at)>datetime('now'))
         LIMIT 1),
        (SELECT ${financeJournalLevelSql('o.access_level')}
         FROM employee_permission_overrides o
         JOIN permissions p ON p.id=o.permission_id
         WHERE o.employee_id=? AND o.company_id=?
           AND p.code='finance.journal'
           AND (o.expires_at IS NULL OR datetime(o.expires_at)>datetime('now'))
         LIMIT 1),
        (SELECT MAX(${financeJournalLevelSql('rp.access_level')})
         FROM employee_roles er
         JOIN roles role ON role.id=er.role_id AND role.active=1
           AND (role.company_id IS NULL OR role.company_id=er.company_id)
         JOIN role_permissions rp ON rp.role_id=role.id
         JOIN permissions p ON p.id=rp.permission_id
         WHERE er.employee_id=? AND er.company_id=?
           AND p.code='finance.journal'),
        0
      ) >= ?
  )`,
  params:[companyId,context.sessionId,context.employee.id,
    context.employee.id,companyId,
    context.employee.id,companyId,
    context.employee.id,companyId,
    minimum==='approve'?4:2] as Array<string|number>,
});

const cents=(naira:unknown)=>Math.round(Number(naira||0)*100);
const journalCents=(naira:unknown):number|null=>{if(typeof naira!=='number'||!Number.isFinite(naira)||naira<0)return null;const normalized=String(naira);if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized))return null;const [nairaPart,koboPart='']=normalized.split('.'),kobo=BigInt(nairaPart)*100n+BigInt(koboPart.padEnd(2,'0'));return kobo>BigInt(Number.MAX_SAFE_INTEGER)?null:Number(kobo)};
const receivableCents=(naira:unknown):number|null=>{if(typeof naira!=='number'||!Number.isFinite(naira)||naira<=0)return null;const normalized=String(naira);if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized))return null;const [nairaPart,koboPart='']=normalized.split('.'),kobo=BigInt(nairaPart)*100n+BigInt(koboPart.padEnd(2,'0'));return kobo>BigInt(Number.MAX_SAFE_INTEGER)?null:Number(kobo)};
const requestCorrelationId=(request:Request)=>{const value=request.headers.get('x-request-id')||request.headers.get('cf-ray')||crypto.randomUUID();return value.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,128)||crypto.randomUUID()};
const receivableCreateKey=(request:Request)=>{const value=request.headers.get('idempotency-key')||request.headers.get('x-daenem-idempotency-key')||'';return value.trim()};
const receivableFingerprint=async(value:Record<string,unknown>)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),byte=>byte.toString(16).padStart(2,'0')).join('');

async function summary(request:Request,env:Env,context:SessionContext){const companyId=new URL(request.url).searchParams.get('companyId')||context.companies[0]?.id||'';if(!member(context,companyId)||!can(context,'finance.reports','view',companyId))return json({error:'Financial Reports access is not assigned for this company.'},403);const month=new Date().toISOString().slice(0,7);const [balances,receivables,budgets,funding,journals]=await Promise.all([
 env.DB.prepare(`SELECT a.account_type AS accountType,COALESCE(SUM(CASE WHEN e.status='posted' THEN l.debit_kobo-l.credit_kobo ELSE 0 END),0) AS netKobo FROM finance_accounts a LEFT JOIN journal_lines l ON l.account_id=a.id LEFT JOIN journal_entries e ON e.id=l.journal_entry_id WHERE a.company_id=? GROUP BY a.account_type`).bind(companyId).all<Record<string,unknown>>(),
 env.DB.prepare(`SELECT COUNT(*) AS openCount,COALESCE(SUM(balance_kobo),0) AS openKobo,COALESCE(SUM(CASE WHEN due_date<date('now') AND status NOT IN ('paid','cancelled','written_off') THEN balance_kobo ELSE 0 END),0) AS overdueKobo FROM finance_receivables WHERE company_id=? AND status NOT IN ('paid','cancelled','written_off')`).bind(companyId).first<Record<string,number>>(),
 env.DB.prepare(`SELECT COALESCE(SUM(bl.amount_kobo),0) AS budgetKobo FROM budgets b JOIN budget_lines bl ON bl.budget_id=b.id WHERE b.company_id=? AND b.status IN ('approved','locked') AND bl.period_key=?`).bind(companyId,month).first<{budgetKobo:number}>(),
 env.DB.prepare(`SELECT COALESCE(SUM(CASE WHEN funding_type IN ('owner_injection','loan','grant','transfer_in') THEN amount_kobo ELSE -amount_kobo END),0) AS netFundingKobo FROM funding_events WHERE company_id=? AND substr(event_date,1,7)=?`).bind(companyId,month).first<{netFundingKobo:number}>(),
 env.DB.prepare(`SELECT COUNT(*) AS count FROM journal_entries WHERE company_id=? AND status='draft'`).bind(companyId).first<{count:number}>()
 ]);const map:Object=Object.fromEntries((balances.results||[]).map(r=>[String(r.accountType),Number(r.netKobo||0)]));return json({companyId,month,balances:map,receivables:{openCount:Number(receivables?.openCount||0),openKobo:Number(receivables?.openKobo||0),overdueKobo:Number(receivables?.overdueKobo||0)},approvedBudgetKobo:Number(budgets?.budgetKobo||0),netFundingKobo:Number(funding?.netFundingKobo||0),draftJournals:Number(journals?.count||0)});}
async function accounts(request:Request,env:Env,context:SessionContext){const companyId=new URL(request.url).searchParams.get('companyId')||context.companies[0]?.id||'';if(!member(context,companyId)||!can(context,'finance.coa','view',companyId))return json({error:'Chart of Accounts access is not assigned for this company.'},403);const rows=await env.DB.prepare(`SELECT a.id,a.code,a.name,a.account_type AS accountType,a.parent_id AS parentId,a.currency,a.allow_manual_posting AS allowManualPosting,a.active,COALESCE(SUM(CASE WHEN e.status='posted' THEN l.debit_kobo-l.credit_kobo ELSE 0 END),0) AS balanceKobo FROM finance_accounts a LEFT JOIN journal_lines l ON l.account_id=a.id LEFT JOIN journal_entries e ON e.id=l.journal_entry_id WHERE a.company_id=? GROUP BY a.id ORDER BY a.code`).bind(companyId).all<Record<string,unknown>>();return json({accounts:rows.results||[]});}
async function createAccount(request:Request,env:Env,context:SessionContext){let b:{companyId?:string;code?:string;name?:string;accountType?:string;parentId?:string;allowManualPosting?:boolean};try{b=await request.json()}catch{return json({error:'Invalid account.'},400)}const companyId=String(b.companyId||'');if(!member(context,companyId)||!can(context,'finance.coa','edit',companyId))return json({error:'Edit Chart of Accounts permission is required for this company.'},403);const types=['asset','liability','equity','revenue','expense','cost_of_sales'];if(!String(b.code||'').trim()||!String(b.name||'').trim()||!types.includes(String(b.accountType)))return json({error:'Account code, name and valid type are required.'},400);const id=uid('account'),parentId=b.parentId?String(b.parentId):null;try{const inserted=await env.DB.prepare(`INSERT INTO finance_accounts(id,company_id,code,name,account_type,parent_id,allow_manual_posting) SELECT ?,?,?,?,?,?,? WHERE ? IS NULL OR EXISTS(SELECT 1 FROM finance_accounts WHERE id=? AND company_id=? AND active=1)`).bind(id,companyId,String(b.code).trim(),String(b.name).trim(),b.accountType,parentId,b.allowManualPosting===false?0:1,parentId,parentId,companyId).run();if(Number(inserted?.meta?.changes||0)!==1)return json({error:'Parent account is not valid for this company.'},400)}catch{return json({error:'Account code must be unique within this company.'},409)}return json({ok:true,id},201);}

async function periods(request:Request,env:Env,context:SessionContext){const companyId=new URL(request.url).searchParams.get('companyId')||context.companies[0]?.id||'';if(!member(context,companyId)||!can(context,'finance.periods','view',companyId))return json({error:'Fiscal Period access is not assigned for this company.'},403);const rows=await env.DB.prepare(`SELECT id,name,start_date AS startDate,end_date AS endDate,status,closed_at AS closedAt FROM fiscal_periods WHERE company_id=? ORDER BY start_date DESC LIMIT 60`).bind(companyId).all<Record<string,unknown>>();return json({periods:rows.results||[]});}
async function createPeriod(request:Request,env:Env,context:SessionContext){let b:{companyId?:string;name?:string;startDate?:string;endDate?:string};try{b=await request.json()}catch{return json({error:'Invalid fiscal period.'},400)}const companyId=String(b.companyId||'');if(!member(context,companyId)||!can(context,'finance.periods','edit',companyId))return json({error:'Edit Fiscal Period permission is required for this company.'},403);if(!b.name||!b.startDate||!b.endDate||b.endDate<b.startDate)return json({error:'Company, name and valid dates are required.'},400);const overlap=await env.DB.prepare(`SELECT id FROM fiscal_periods WHERE company_id=? AND NOT(end_date<? OR start_date>?) LIMIT 1`).bind(companyId,b.startDate,b.endDate).first();if(overlap)return json({error:'Fiscal period overlaps an existing period.'},409);const id=uid('fiscal');await env.DB.prepare(`INSERT INTO fiscal_periods(id,company_id,name,start_date,end_date) VALUES(?,?,?,?,?)`).bind(id,companyId,b.name,b.startDate,b.endDate).run();return json({ok:true,id},201);}

async function journals(request:Request,env:Env,context:SessionContext){const u=new URL(request.url),companyId=u.searchParams.get('companyId')||context.companies[0]?.id||'';if(!member(context,companyId)||!can(context,'finance.ledger','view',companyId))return json({error:'Ledger access is not assigned for this company.'},403);const rows=await env.DB.prepare(`SELECT e.id,e.entry_no AS entryNo,e.entry_date AS entryDate,e.description,e.source_module AS sourceModule,e.reference,e.status,e.currency,e.posted_at AS postedAt,COALESCE(SUM(l.debit_kobo),0) AS debitKobo,COALESCE(SUM(l.credit_kobo),0) AS creditKobo FROM journal_entries e LEFT JOIN journal_lines l ON l.journal_entry_id=e.id WHERE e.company_id=? GROUP BY e.id ORDER BY e.entry_date DESC,e.created_at DESC LIMIT 200`).bind(companyId).all<Record<string,unknown>>();return json({journals:rows.results||[]});}
async function createJournal(request:Request,env:Env,context:SessionContext){let b:{companyId?:string;entryDate?:string;description?:string;reference?:string;lines?:Array<{accountId:string;description?:string;debitNaira?:number;creditNaira?:number;costCenter?:string}>};try{b=await request.json()}catch{return json({error:'Invalid journal.'},400)}const companyId=String(b.companyId||''),entryDate=String(b.entryDate||'');if(!member(context,companyId)||!can(context,'finance.journal','create',companyId))return json({error:'Create Journal permission is required for this company.'},403);if(!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)||!String(b.description||'').trim()||!Array.isArray(b.lines)||b.lines.length<2)return json({error:'Company, date, description and at least two journal lines are required.'},400);const period=await env.DB.prepare(`SELECT id,status FROM fiscal_periods WHERE company_id=? AND ? BETWEEN start_date AND end_date ORDER BY start_date DESC LIMIT 1`).bind(companyId,entryDate).first<{id:string;status:string}>();if(period&&period.status==='closed')return json({error:'This fiscal period is closed.'},409);let debit=0,credit=0;const lines:Array<{accountId:string;description?:string;debitKobo:number;creditKobo:number;costCenter?:string}>=[];for(const line of b.lines){const debitKobo=journalCents(line.debitNaira??0),creditKobo=journalCents(line.creditNaira??0);if(debitKobo===null||creditKobo===null||(debitKobo===0&&creditKobo===0)||(debitKobo>0&&creditKobo>0)||!Number.isSafeInteger(debit+debitKobo)||!Number.isSafeInteger(credit+creditKobo))return json({error:'Journal amounts must use whole kobo and balance within the supported amount limit.'},400);debit+=debitKobo;credit+=creditKobo;const valid=await env.DB.prepare(`SELECT id FROM finance_accounts WHERE id=? AND company_id=? AND active=1 AND allow_manual_posting=1`).bind(line.accountId,companyId).first();if(!valid)return json({error:'One or more accounts cannot accept manual postings.'},400);lines.push({...line,debitKobo,creditKobo})}if(debit<=0||debit!==credit)return json({error:'Journal must balance: total debit must equal total credit and be greater than zero.',debitKobo:debit,creditKobo:credit},400);const id=uid('journal'),entryNo=`JE-${entryDate.replaceAll('-','')}-${crypto.randomUUID().slice(0,6).toUpperCase()}`,stmts:D1PreparedStatement[]=[env.DB.prepare(`INSERT INTO journal_entries(id,company_id,fiscal_period_id,entry_no,entry_date,description,source_module,reference,status,prepared_by) VALUES(?,?,?,?,?,?,'manual',?,'draft',?)`).bind(id,companyId,period?.id||null,entryNo,entryDate,String(b.description).trim(),b.reference||null,context.employee.id)];for(const line of lines)stmts.push(env.DB.prepare(`INSERT INTO journal_lines(id,journal_entry_id,account_id,description,debit_kobo,credit_kobo,cost_center) VALUES(?,?,?,?,?,?,?)`).bind(uid('line'),id,line.accountId,line.description||null,line.debitKobo,line.creditKobo,line.costCenter||null));const writeGate=financeJournalWriteGate(context,companyId,'create');
stmts.push(env.DB.prepare(`SELECT json_extract(
  CASE WHEN NOT (${writeGate.sql})
    OR EXISTS(
      SELECT 1 FROM journal_lines line LEFT JOIN finance_accounts account ON account.id=line.account_id
      WHERE line.journal_entry_id=?
        AND (account.id IS NULL OR account.company_id<>? OR account.active<>1 OR account.allow_manual_posting<>1)
    )
    OR (? IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM fiscal_periods period
      WHERE period.id=? AND period.company_id=?
        AND period.status IN ('open','soft_closed')
        AND ? BETWEEN period.start_date AND period.end_date
    ))
  THEN '{' ELSE '{}' END,'$')`).bind(...writeGate.params,id,companyId,period?.id||null,period?.id||null,companyId,entryDate));
// Draft creation needs immutable formal audit evidence, committed with the
// journal, its lines and the live at-write authorization check in ONE D1 batch.
const creationAuditId=uid('audit');
stmts.push(env.DB.prepare(`INSERT INTO audit_logs(
    id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source
  ) SELECT ?,?,?, 'finance','create_journal','journal_entry',?,?,'web'
  WHERE EXISTS(
    SELECT 1 FROM journal_entries
    WHERE id=? AND company_id=? AND prepared_by=? AND status='draft'
  )`).bind(creationAuditId,context.employee.id,companyId,id,
  JSON.stringify({entryNo,status:'draft',debitKobo:debit,creditKobo:credit,lineCount:lines.length}),
  id,companyId,context.employee.id));
// A trigger can silently skip an INSERT. Force a batch rollback unless the
// required audit row was actually persisted for this journal and actor.
stmts.push(env.DB.prepare(`SELECT json_extract(
  CASE WHEN NOT EXISTS(
    SELECT 1 FROM audit_logs
    WHERE id=? AND actor_employee_id=? AND company_id=?
      AND module='finance' AND action='create_journal'
      AND entity_type='journal_entry' AND entity_id=? AND source='web'
  ) THEN '{' ELSE '{}' END,'$')`).bind(
  creationAuditId,context.employee.id,companyId,id));
try { await env.DB.batch(stmts); }
catch (error) {
  if (/malformed JSON/i.test(String(error))) return json({error:'The journal changed or is no longer authorized. Reload and try again.'},409);
  return json({error:'The journal could not be saved with its required integrity checks.'},503);
}
return json({ok:true,id,entryNo,debitKobo:debit,creditKobo:credit,status:'draft'},201);}
async function postJournal(request:Request,env:Env,context:SessionContext){
 let b:{id?:string};
 try{b=await request.json()}catch{return json({error:'Invalid posting request.'},400)}
 const entry=await env.DB.prepare(`SELECT e.id,e.company_id AS companyId,e.fiscal_period_id AS fiscalPeriodId,e.entry_date AS entryDate,e.status,fp.company_id AS periodCompanyId,fp.start_date AS periodStartDate,fp.end_date AS periodEndDate,fp.status AS periodStatus FROM journal_entries e LEFT JOIN fiscal_periods fp ON fp.id=e.fiscal_period_id WHERE e.id=?`).bind(b.id||'').first<Record<string,unknown>>();
 if(!entry||!member(context,String(entry.companyId))||!can(context,'finance.journal','approve',String(entry.companyId)))return json({error:'Journal not found.'},404);
 if(entry.status!=='draft')return json({error:'Only draft journals can be posted.'},409);
 const periodId=String(entry.fiscalPeriodId||''),companyId=String(entry.companyId),entryDate=String(entry.entryDate||'');
 if(!periodId||entry.periodStatus!=='open'||entry.periodCompanyId!==companyId||String(entry.periodStartDate||'')>entryDate||String(entry.periodEndDate||'')<entryDate)return json({error:'An open fiscal period is required to post this journal.'},409);
 const totals=await env.DB.prepare(`SELECT COALESCE(SUM(debit_kobo),0) AS debitKobo,COALESCE(SUM(credit_kobo),0) AS creditKobo FROM journal_lines WHERE journal_entry_id=?`).bind(b.id||'').first<{debitKobo:number;creditKobo:number}>();
 if(!totals||Number(totals.debitKobo)<=0||Number(totals.debitKobo)!==Number(totals.creditKobo))return json({error:'Journal is not balanced and cannot be posted.'},409);
  const writeGate=financeJournalWriteGate(context,companyId,'approve');
  const auditId=uid('audit');
  let results:D1Result[];
  try{results=await env.DB.batch([
   env.DB.prepare(`UPDATE journal_entries SET status='posted',approved_by=?,approved_at=CURRENT_TIMESTAMP,posted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND company_id=? AND status='draft' AND fiscal_period_id=? AND EXISTS(SELECT 1 FROM fiscal_periods WHERE id=? AND company_id=? AND status='open' AND start_date<=? AND end_date>=?)
     AND (SELECT COUNT(1) FROM journal_lines WHERE journal_entry_id=journal_entries.id)>=2
     AND (SELECT COALESCE(SUM(debit_kobo),0) FROM journal_lines WHERE journal_entry_id=journal_entries.id)=?
     AND (SELECT COALESCE(SUM(credit_kobo),0) FROM journal_lines WHERE journal_entry_id=journal_entries.id)=?
     AND NOT EXISTS(
       SELECT 1 FROM journal_lines line LEFT JOIN finance_accounts account ON account.id=line.account_id
       WHERE line.journal_entry_id=journal_entries.id
         AND (account.id IS NULL OR account.company_id<>journal_entries.company_id
              OR account.active<>1 OR account.allow_manual_posting<>1))
     AND (${writeGate.sql})`).bind(context.employee.id,b.id||'',companyId,periodId,periodId,companyId,entryDate,entryDate,Number(totals.debitKobo),Number(totals.creditKobo),...writeGate.params),
   env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source) SELECT ?,?,?, 'finance','post_journal','journal_entry',?,?,'web' WHERE changes()=1`).bind(auditId,context.employee.id,companyId,b.id||'',JSON.stringify({debitKobo:totals.debitKobo,creditKobo:totals.creditKobo})),
   // A zero-row audit insert is not a SQL error. Force the D1 batch to roll
   // back unless the posting has matching formal audit evidence.
   env.DB.prepare(`SELECT json_extract(CASE WHEN NOT EXISTS(SELECT 1 FROM journal_entries WHERE id=? AND company_id=? AND status='posted' AND approved_by=?) OR NOT EXISTS(SELECT 1 FROM audit_logs WHERE id=? AND actor_employee_id=? AND company_id=? AND module='finance' AND action='post_journal' AND entity_type='journal_entry' AND entity_id=? AND source='web') THEN '{' ELSE '{}' END,'$')`).bind(b.id||'',companyId,context.employee.id,auditId,context.employee.id,companyId,b.id||'')
  ]);}catch(error){
    if (/malformed JSON/i.test(String(error))) return json({error:'The journal changed or access was revoked. Reload and try again.'},409);
    return json({error:'The journal could not be posted with its required audit record. Please try again.'},503);
  }
 if(Number(results?.[0]?.meta?.changes||0)!==1||Number(results?.[1]?.meta?.changes||0)!==1)return json({error:'The journal changed before it could be posted. Reload and try again.'},409);
 return json({ok:true,status:'posted'});
}

async function receivables(request:Request,env:Env,context:SessionContext){const companyId=new URL(request.url).searchParams.get('companyId')||context.companies[0]?.id||'';if(!member(context,companyId)||!can(context,'finance.receivables','view',companyId))return json({error:'Accounts Receivable access is not assigned for this company.'},403);const rows=await env.DB.prepare(`SELECT id,customer_name AS customerName,customer_ref AS customerRef,invoice_no AS invoiceNo,invoice_date AS invoiceDate,due_date AS dueDate,amount_kobo AS amountKobo,paid_kobo AS paidKobo,balance_kobo AS balanceKobo,status,notes FROM finance_receivables WHERE company_id=? ORDER BY CASE WHEN status='overdue' THEN 0 WHEN status='open' THEN 1 ELSE 2 END,due_date,invoice_date DESC LIMIT 300`).bind(companyId).all<Record<string,unknown>>();return json({receivables:rows.results||[]});}
async function createReceivable(request:Request,env:Env,context:SessionContext){let b:{companyId?:string;customerName?:string;customerRef?:string;invoiceNo?:string;invoiceDate?:string;dueDate?:string;amountNaira?:number;notes?:string};try{b=await request.json()}catch{return json({error:'Invalid receivable.'},400)}const companyId=String(b.companyId||''),amount=receivableCents(b.amountNaira);if(!member(context,companyId)||!can(context,'finance.receivables','create',companyId))return json({error:'Create Receivable permission is required for this company.'},403);if(!String(b.customerName||'').trim()||!b.invoiceDate||amount===null)return json({error:'Company, customer, invoice date and a positive amount with no more than two decimal places are required.'},400);const createKey=receivableCreateKey(request);if(!/^[\x21-\x7e]{1,128}$/.test(createKey))return json({error:'A valid request identity is required to record this receivable.'},400);const id=uid('receivable'),customerName=String(b.customerName).trim(),customerRef=String(b.customerRef||'').trim()||null,invoiceNo=String(b.invoiceNo||'').trim()||null,invoiceDate=String(b.invoiceDate).trim(),dueDate=String(b.dueDate||'').trim()||null,notes=String(b.notes||'').trim()||null,status=dueDate&&dueDate<new Date().toISOString().slice(0,10)?'overdue':'open',requestId=requestCorrelationId(request),fingerprint=await receivableFingerprint({companyId,actorId:context.employee.id,customerName,customerRef,invoiceNo,invoiceDate,dueDate,amountKobo:amount,notes}),actorRoles=context.roles.filter(role=>role.companyId===companyId||role.code==='owner').map(role=>role.code);let results:D1Result[];try{results=await env.DB.batch([
 env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,before_json,after_json,source,request_id) VALUES(?,?,?,'finance','create_receivable','finance_receivable',?,NULL,?,'web',?)`).bind(uid('audit'),context.employee.id,companyId,id,JSON.stringify({customerName,customerRef,invoiceNo,amountKobo:amount,currency:'NGN',actorRoles,beforeStatus:null,afterStatus:status}),requestId),
 env.DB.prepare(`INSERT INTO finance_receivables(id,company_id,customer_name,customer_ref,invoice_no,invoice_date,due_date,amount_kobo,balance_kobo,status,notes,created_by,create_request_id,create_request_fingerprint) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE changes()=1`).bind(id,companyId,customerName,customerRef,invoiceNo,invoiceDate,dueDate,amount,amount,status,notes,context.employee.id,createKey,fingerprint)
])}catch{try{const prior=await env.DB.prepare(`SELECT id,create_request_fingerprint AS fingerprint FROM finance_receivables WHERE company_id=? AND create_request_id=?`).bind(companyId,createKey).first<{id:string;fingerprint:string}>();if(prior){if(prior.fingerprint!==fingerprint)return json({error:'Request could not be processed. Use a new request identity and try again.'},409);return json({ok:true,id:prior.id,replayed:true},200)}}catch{return json({error:'Receivable could not be recorded. Try again later.'},503)}return json({error:'Receivable could not be recorded. Try again later.'},503)}if(Number(results?.[0]?.meta?.changes||0)!==1||Number(results?.[1]?.meta?.changes||0)!==1)return json({error:'Receivable could not be recorded. Reload and try again.'},409);return json({ok:true,id,balanceKobo:amount,status},201);}
async function receivePayment(request:Request,env:Env,context:SessionContext){
 let b:{id?:string;amountNaira?:number;paymentMethod?:string;reference?:string};
 try{b=await request.json()}catch{return json({error:'Invalid payment.'},400)}
 const row=await env.DB.prepare(`SELECT id,company_id AS companyId,balance_kobo AS balanceKobo,paid_kobo AS paidKobo FROM finance_receivables WHERE id=? AND status NOT IN ('paid','cancelled','written_off')`).bind(b.id||'').first<{id:string;companyId:string;balanceKobo:number;paidKobo:number}>();
 if(!row||!member(context,row.companyId)||!can(context,'finance.receivables','edit',row.companyId))return json({error:'Open receivable not found.'},404);
 try{await env.DB.prepare(`INSERT INTO audit_logs(id,actor_employee_id,company_id,module,action,entity_type,entity_id,after_json,source,request_id) VALUES(?,?,?,'finance','receivable_payment_verification_required','finance_receivable',?,?,'web',?)`).bind(uid('audit'),context.employee.id,row.companyId,row.id,JSON.stringify({outcome:'denied_attempt',reason:'verified_settlement_evidence_required'}),requestCorrelationId(request)).run()}catch{return json({error:'Payment verification is required. Try again later.'},503)}
 return json({error:'Payment must be verified through the authorized payment reconciliation process before updating this receivable.'},409);
}

async function funding(request:Request,env:Env,context:SessionContext){const u=new URL(request.url),companyId=u.searchParams.get('companyId')||context.companies[0]?.id||'';if(!member(context,companyId)||!can(context,'finance.funding','view',companyId))return json({error:'Funding Event access is not assigned for this company.'},403);if(request.method==='GET'){const rows=await env.DB.prepare(`SELECT id,event_date AS eventDate,funding_type AS fundingType,source_name AS sourceName,amount_kobo AS amountKobo,currency,reference,notes,created_at AS createdAt FROM funding_events WHERE company_id=? ORDER BY event_date DESC,created_at DESC LIMIT 200`).bind(companyId).all<Record<string,unknown>>();return json({events:rows.results||[]})}let b:{companyId?:string;eventDate?:string;fundingType?:string;sourceName?:string;amountNaira?:number;reference?:string;notes?:string};try{b=await request.json()}catch{return json({error:'Invalid funding event.'},400)}const cid=String(b.companyId||''),types=['owner_injection','loan','grant','transfer_in','transfer_out','dividend','other'],amount=cents(b.amountNaira);if(!member(context,cid)||!can(context,'finance.funding','create',cid))return json({error:'Create Funding Event permission is required for this company.'},403);if(!b.eventDate||!types.includes(String(b.fundingType))||amount<=0)return json({error:'Company, date, funding type and positive amount are required.'},400);const id=uid('funding');await env.DB.prepare(`INSERT INTO funding_events(id,company_id,event_date,funding_type,source_name,amount_kobo,reference,notes,recorded_by) VALUES(?,?,?,?,?,?,?,?,?)`).bind(id,cid,b.eventDate,b.fundingType,b.sourceName||null,amount,b.reference||null,b.notes||null,context.employee.id).run();return json({ok:true,id},201);}

export async function routeFinance(request:Request,env:Env,context:SessionContext):Promise<Response|null>{const u=new URL(request.url);if(u.pathname==='/api/finance/summary'&&request.method==='GET')return summary(request,env,context);if(u.pathname==='/api/finance/accounts'&&request.method==='GET')return accounts(request,env,context);if(u.pathname==='/api/finance/accounts'&&request.method==='POST')return createAccount(request,env,context);if(u.pathname==='/api/finance/periods'&&request.method==='GET')return periods(request,env,context);if(u.pathname==='/api/finance/periods'&&request.method==='POST')return createPeriod(request,env,context);if(u.pathname==='/api/finance/journals'&&request.method==='GET')return journals(request,env,context);if(u.pathname==='/api/finance/journals'&&request.method==='POST')return createJournal(request,env,context);if(u.pathname==='/api/finance/journals/post'&&request.method==='POST')return postJournal(request,env,context);if(u.pathname==='/api/finance/receivables'&&request.method==='GET')return receivables(request,env,context);if(u.pathname==='/api/finance/receivables'&&request.method==='POST')return createReceivable(request,env,context);if(u.pathname==='/api/finance/receivables/payment'&&request.method==='POST')return receivePayment(request,env,context);if(u.pathname==='/api/finance/funding'&&(request.method==='GET'||request.method==='POST'))return funding(request,env,context);return null;}
