// Isolated local Cloudflare D1 acceptance: no remote credentials, remote mutations or production data.
// Uses the real Forms Worker functions, repository migrations, and synthetic data.
import { Miniflare } from 'miniflare';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { validGuidedDependencies, guidedFieldVisible } from '../src/guided-form-dependencies.ts';
import { validSubmittedSelectAnswer } from '../worker/form-select-contract.ts';
import { checkFormAnswerCompleteness } from '../worker/form-answer-completeness.ts';

const mf = new Miniflare({
  modules: true,
  script: 'export default {fetch(){return new Response("Local D1 acceptance")}}',
  compatibilityDate: '2026-08-08',
  d1Databases: { DB: 'staffportal-forms-isolated-never-remote' },
});
try {
  const db = await mf.getD1Database('DB');
  for (const file of ['0001_core.sql','0002_identity_auth.sql','0003_attendance_defaults.sql',
    '0004_admin_settings.sql','0008_forms_broadcasts_smart.sql','0054_offline_sync_audit.sql']) {
    const source = readFileSync(new URL('../migrations/'+file, import.meta.url),'utf8')
      .replace(/\r\n/g,'\n').replace(/^PRAGMA foreign_keys = ON;\n/gm,'');
    for (const statement of source.split(';').map(s=>s.trim()).filter(Boolean))
      await db.prepare(statement).run();
  }
  console.log('PASS Forms dependency migrations applied to isolated local D1');
  const schema = [
    {key:'outcome',label:'Outcome',type:'select',required:true,options:['Pass','Fail']},
    {key:'note',label:'Corrective Action',type:'textarea',required:true,
     showWhen:{fieldKey:'outcome',equals:'Fail'}},
    {key:'qty',label:'Quantity',type:'number',required:true},
  ];
  for(const [id,code] of [['printing','QA_PRINT_1'],['bakery','QA_BAKE_1']]) {
    await db.prepare('INSERT INTO companies(id,code,name,business_type) VALUES(?,?,?,?)')
      .bind(id,code,id,'business').run();
  }
  await db.prepare('INSERT INTO employees(id,display_name) VALUES(?,?)')
    .bind('staff','Synthetic QA Employee').run();
  for (const c of ['printing','bakery']) {
    await db.prepare('INSERT INTO employee_company_memberships(id,employee_id,company_id) VALUES(?,?,?)')
      .bind('member-'+c,'staff',c).run();
    await db.prepare('INSERT INTO workflow_forms(id,company_id,title,form_type,schema_json,created_by) VALUES(?,?,?,?,?,?)')
      .bind('form-'+c,c,'QA '+c,'inspection',JSON.stringify(schema),'staff').run();
    await db.prepare('INSERT INTO workflow_form_assignments(id,form_id,company_id,employee_id,audience_type,assigned_by) VALUES(?,?,?,?,?,?)')
      .bind('assignment-'+c,'form-'+c,c,'staff','employee','staff').run();
  }
  await db.prepare('INSERT INTO workflow_form_assignments(id,form_id,company_id,employee_id,audience_type,assigned_by) VALUES(?,?,?,?,?,?)')
    .bind('assignment-other','form-printing','printing','staff','employee','staff').run();

  const file=readFileSync(new URL('../worker/forms.ts',import.meta.url),'utf8');
  const ast=ts.createSourceFile('forms.ts',file,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  function compile(name) {
    let found;
    function walk(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node;ts.forEachChild(node,walk);}
    walk(ast);
    assert.ok(found,'Missing Worker handler '+name);
    return ts.transpileModule(found.getText(ast).replace(/^export\s+/,''),{
      compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None},
    }).outputText;
  }
  const json=(body,status=200)=>new Response(JSON.stringify(body),{
    status,headers:{'content-type':'application/json'},
  });
  const levels=['none','view','create','edit','approve','manage'];
  const hasPermission=(ctx,code,minimum='view',companyId)=>
    levels.indexOf(companyId?ctx.companyPermissions[companyId]?.[code]||'none':
      ctx.permissions[code]||'none')>=levels.indexOf(minimum);
  const can=(ctx,level='view')=>hasPermission(ctx,'forms.access',level);
  const companyScope=(ctx,level='view')=>ctx.companies
    .filter(c=>hasPermission(ctx,'forms.access',level,c.id)).map(c=>c.id);
  const canGroup=(ctx,level='view')=>ctx.roles.some(r=>r.code==='owner')&&can(ctx,level);
  const myAssignments=new Function('json','companyScope','canGroup',
    compile('myAssignments')+'\nreturn myAssignments;')(json,companyScope,canGroup);
  const submit=new Function('json','can','myAssignments','uid','validGuidedDependencies',
    'guidedFieldVisible','validSubmittedSelectAnswer','checkFormAnswerCompleteness',
    compile('submitForm')+'\nreturn submitForm;')(
      json,can,myAssignments,prefix=>prefix+'-qa-'+crypto.randomUUID(),
      validGuidedDependencies,guidedFieldVisible,validSubmittedSelectAnswer,
      checkFormAnswerCompleteness,
    );
  const ctx={
    employee:{id:'staff',department:''},
    sessionId:'synthetic-session',
    companies:[{id:'printing'},{id:'bakery'}],
    roles:[],
    permissions:{'forms.access':'view'},
    companyPermissions:{printing:{'forms.access':'view'},bakery:{'forms.access':'none'}},
  };
  async function call(assignmentId,responses,extra={},headers={},database=db){
    const req=new Request('https://isolated.local/api/forms/submit',{
      method:'POST',headers:{'content-type':'application/json',...headers},
      body:JSON.stringify({assignmentId,responses,...extra}),
    });
    const response=await submit(req,{DB:database},ctx);
    return {status:response.status,body:await response.json()};
  }
  const valid={outcome:'Pass',qty:'0'};
  let result=await call('assignment-printing',valid);
  assert.equal(result.status,200,JSON.stringify(result));
  const record=await db.prepare('SELECT response_json,company_id FROM workflow_form_submissions WHERE id=?')
    .bind(result.body.submissionId).first();
  assert.equal(record.company_id,'printing');
  assert.equal(JSON.parse(record.response_json).qty,'0');
  const audits=await db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE module='forms' AND action='submit'").first();
  assert.equal(audits.count,1);
  console.log('PASS real D1 successful form submission and matching audit');

  result=await call('assignment-bakery',valid);
  assert.equal(result.status,404,JSON.stringify(result));
  console.log('PASS real D1 rejects unauthorized second company even with membership');

  result=await call('assignment-other',{outcome:'Fail',qty:'1'});
  assert.equal(result.status,400,JSON.stringify(result));
  console.log('PASS real D1 rejects missing conditional mandatory field');

  // Real D1 trigger raises a database failure on audit write in same transaction.
  await db.prepare("CREATE TRIGGER fail_forms_audit BEFORE INSERT ON audit_logs WHEN NEW.module='forms' AND NEW.action='submit' BEGIN SELECT RAISE(ABORT,'simulated audit failure'); END").run();
  let caught;
  try { await call('assignment-other',{outcome:'Fail',note:'Repair logged',qty:'1'}); }
  catch(e){caught=e;}
  assert.ok(caught,'Expected actual D1 audit transaction failure');
  const failedRow=await db.prepare("SELECT COUNT(*) AS count FROM workflow_form_submissions WHERE assignment_id='assignment-other'").first();
  assert.equal(failedRow.count,0,'submission must roll back with audit');
  const afterAudit=await db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE module='forms' AND action='submit'").first();
  assert.equal(afterAudit.count,1,'previous audit persists; failed batch adds nothing');
  console.log('PASS real D1 audit failure causes atomic rollback of new submission');

  await db.prepare('DROP TRIGGER fail_forms_audit').run();
  result=await call('assignment-other',{outcome:'Fail',note:'Repair logged',qty:'1'});
  assert.equal(result.status,200,JSON.stringify(result));
  console.log('PASS real D1 accepts corrected conditional form');

  // Two submissions within the same second must still have distinct versions.
  const printingId=await db.prepare("SELECT id FROM workflow_form_submissions WHERE assignment_id='assignment-printing'").first().then(r=>r.id);
  const oldVersion=await db.prepare('SELECT updated_at AS version FROM workflow_form_submissions WHERE id=?')
    .bind(printingId).first().then(r=>r.version);
  result=await call('assignment-printing',{...valid,qty:'2'},{baseUpdatedAt:oldVersion});
  assert.equal(result.status,200,JSON.stringify(result));
  const nextVersion=await db.prepare('SELECT updated_at AS version FROM workflow_form_submissions WHERE id=?')
    .bind(printingId).first().then(r=>r.version);
  assert.ok(nextVersion>oldVersion,'Update must advance the revision even when wall-clock second is unchanged');
  result=await call('assignment-printing',{...valid,qty:'3'},{baseUpdatedAt:oldVersion});
  assert.equal(result.status,409,JSON.stringify(result));
  assert.equal(result.body.code,'CONFLICT');
  console.log('PASS real D1 monotonic submission versions and stale offline conflict');

  // Interleave a reviewer between read and write, proving SQL (not just
  // preflight code) prevents a stale submit from overwriting review status.
  const beforeSubmitAudit=await db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE module='forms' AND action='submit'").first().then(r=>r.n);
  let injected=false;
  const staleSubmitDb={
    prepare:(...args)=>db.prepare(...args),
    batch:async statements=>{
      if(!injected){
        injected=true;
        await db.prepare("UPDATE workflow_form_submissions SET status='reviewed',updated_at='2040-01-01 00:00:00' WHERE id=?").bind(printingId).run();
      }
      return db.batch(statements);
    },
  };
  result=await call('assignment-printing',{...valid,qty:'4'},{}, {},staleSubmitDb);
  assert.equal(result.status,409,JSON.stringify(result));
  assert.equal(result.body.code,'CONFLICT');
  const reviewed=await db.prepare('SELECT status,response_json FROM workflow_form_submissions WHERE id=?')
    .bind(printingId).first();
  assert.equal(reviewed.status,'reviewed');
  assert.equal(JSON.parse(reviewed.response_json).qty,'2');
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE module='forms' AND action='submit'").first().then(r=>r.n),beforeSubmitAudit);
  console.log('PASS real D1 concurrent review cannot be overwritten or create phantom submit audit');

  // Approvals use the same compare-and-swap gate and cannot double-review.
  await db.prepare("INSERT INTO employees(id,display_name) VALUES('qa-reviewer','Synthetic Forms Reviewer')").run();
  const reviewerContext={...ctx,employee:{id:'qa-reviewer',department:''},
    permissions:{'forms.access':'approve'},
    companyPermissions:{printing:{'forms.access':'approve'},bakery:{'forms.access':'none'}}};
  const reviewForm=new Function('json','hasPermission','canGroup','uid',
    compile('review')+'\nreturn review;')(
      json,hasPermission,canGroup,prefix=>prefix+'-qa-'+crypto.randomUUID());
  async function reviewCall(submissionId,decision,database=db){
    const request=new Request('https://isolated.local/api/forms/review',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({submissionId,decision,note:'QA reviewer decision'}),
    });
    const response=await reviewForm(request,{DB:database},reviewerContext);
    return {status:response.status,body:await response.json()};
  }
  const otherId=await db.prepare("SELECT id FROM workflow_form_submissions WHERE assignment_id='assignment-other'").first().then(r=>r.id);
  let concurrentReview=false;
  const staleReviewDb={
    prepare:(...args)=>db.prepare(...args),
    batch:async statements=>{
      if(!concurrentReview){
        concurrentReview=true;
        await db.prepare("UPDATE workflow_form_submissions SET status='approved',updated_at='2040-01-01 00:00:00' WHERE id=?")
          .bind(otherId).run();
      }
      return db.batch(statements);
    },
  };
  let reviewResult=await reviewCall(otherId,'rejected',staleReviewDb);
  assert.equal(reviewResult.status,409,JSON.stringify(reviewResult));
  assert.equal(reviewResult.body.code,'CONFLICT');
  assert.equal(await db.prepare('SELECT status FROM workflow_form_submissions WHERE id=?').bind(otherId).first().then(r=>r.status),'approved');
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE module='forms' AND action='review'").first().then(r=>r.n),0);
  console.log('PASS real D1 competing reviewers cannot silently reverse approved decisions');

  await db.prepare("INSERT INTO workflow_form_assignments(id,form_id,company_id,employee_id,audience_type,assigned_by) VALUES('assignment-review','form-printing','printing','staff','employee','staff')").run();
  result=await call('assignment-review',valid);
  assert.equal(result.status,200,JSON.stringify(result));
  reviewResult=await reviewCall(result.body.submissionId,'approved');
  assert.equal(reviewResult.status,200,JSON.stringify(reviewResult));
  assert.equal(await db.prepare('SELECT status,reviewed_by FROM workflow_form_submissions WHERE id=?')
    .bind(result.body.submissionId).first().then(r=>r.status),'approved');
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE module='forms' AND action='review'").first().then(r=>r.n),1);
  console.log('PASS real D1 authorised review commits one state transition and one audit');

  console.log('LOCAL_FORMS_D1_ACCEPTANCE=PASS; synthetic local database only');
} finally {await mf.dispose();}

