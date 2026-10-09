import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const ranks = { none:0, view:1, create:2, edit:3, approve:4, manage:5 };
const shim = `const hasPermission=(ctx,permission,level,companyId) =>
  (ranks[ctx.grants?.[companyId]?.[permission]||'none']||0)>=(ranks[level]||0);`;
const source = readFileSync(new URL('../worker/recruitment.ts',import.meta.url),'utf8')
  .replace(/^import \{[^\n]+\} from '\.\/auth';\r?\n/m,'');
assert.ok(!source.includes("from './auth'"),'expected one in-memory import substitution');
const code = stripTypeScriptTypes(source, { mode:'transform' });
const executable = 'const ranks=' + JSON.stringify(ranks) + ';\n' + shim + '\n' + code;
const { routeRecruitment } = await import('data:text/javascript;base64,' +
  Buffer.from(executable).toString('base64'));

const db = new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('../migrations/0001_core.sql',import.meta.url),'utf8'));
db.exec(readFileSync(new URL('../migrations/0100_staffportal_recruitment.sql',import.meta.url),'utf8'));
const q=(sql,...args)=>db.prepare(sql).run(...args);
const one=(sql,...args)=>db.prepare(sql).get(...args);
q("INSERT INTO companies(id,code,name,business_type) VALUES('coA','A','A Corp','services')");
q("INSERT INTO companies(id,code,name,business_type) VALUES('coB','B','B Corp','services')");
q("INSERT INTO employees(id,display_name,employment_status) VALUES('ownerA','Owner A','active')");
q("INSERT INTO employees(id,display_name,employment_status) VALUES('interviewerA','Interviewer A','active')");
q("INSERT INTO employee_company_memberships(id,employee_id,company_id,active) VALUES('memberA','interviewerA','coA',1)");
q("INSERT INTO company_locations(id,company_id,name,active) VALUES('locA','coA','Main Office',1)");
q("INSERT INTO recruitment_candidates(id,company_id,candidate_ref,full_name,email,phone,role_title,source_kind,source_reference,stage,created_by) VALUES('candidateA','coA','ref-a','Candidate A','private@example.test','PRIVATE-PHONE','Engineer','referral','private-reference','applied','ownerA')");
q("UPDATE recruitment_candidates SET stage='screening' WHERE id='candidateA'");
let revokeBeforeBatch = false;
const env = { DB: {
  prepare(sql) { return { bind(...values) {
    return {
      first: async()=>db.prepare(sql).get(...values)||null,
      all: async()=>({results:db.prepare(sql).all(...values)}),
      run: async()=>{const result=db.prepare(sql).run(...values);return {meta:{changes:result.changes}};},
    };
  }}; },
  async batch(statements) {
    if (revokeBeforeBatch) {
      q("UPDATE employee_company_memberships SET active=0 WHERE employee_id='interviewerA' AND company_id='coA'");
      revokeBeforeBatch=false;
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      const results=[];
      for (const stmt of statements) results.push(await stmt.run());
      db.exec('COMMIT');
      return results;
    } catch (err) { db.exec('ROLLBACK'); throw err; }
  },
}};
const ctx=(level='view', company='coA', active=true)=>({
  employee:{id:'ownerA',status:active?'active':'terminated'},
  companies:[{id:company,name:'Company',code:company}],
  grants:{[company]:{'jobs.access':level}},
});
const call=async(path,context,method='GET',body=null,key='')=>{
  const headers = { 'content-type':'application/json' };
  if (key) headers['idempotency-key']=key;
  const request=new Request('https://staffportal.test'+path,{method,headers,
    ...(body?{body:JSON.stringify(body)}:{})});
  const result=await routeRecruitment(request,env,context);
  assert.ok(result,'expected internal recruitment route');
  return {status:result.status,body:await result.json()};
};
let passed=0;
const check=async(name,fn)=>{
  try {await fn(); passed++; console.log('PASS',name);}
  catch(err){console.error('FAIL',name,err);process.exitCode=1;}
};

await check('company-level create remains hidden from viewer',async()=>{
  const r=await call('/api/recruitment/companies',ctx('view'));
  assert.equal(r.body.companies[0].capabilities.create,false);
});
await check('view-only candidate list omits all contact fields',async()=>{
  const r=await call('/api/recruitment/candidates?companyId=coA',ctx());
  assert.equal(r.status,200);
  assert.equal(r.body.candidates.length,1);
  assert.equal(r.body.candidates[0].email,undefined);
  assert.equal(r.body.candidates[0].phone,undefined);
});
await check('view-only detail does not fetch or return contact/reference',async()=>{
  const r=await call('/api/recruitment/candidates/candidateA?companyId=coA',ctx());
  assert.equal(r.status,200);
  assert.equal(r.body.candidate.email,undefined);
  assert.equal(r.body.candidate.phone,undefined);
  assert.equal(r.body.candidate.sourceReference,undefined);
  assert.equal(r.body.capabilities.edit,false);
});
await check('privileged candidate contact is returned only with edit',async()=>{
  const r=await call('/api/recruitment/candidates/candidateA?companyId=coA',ctx('edit'));
  assert.ok(r.body.candidate.email);
});
await check('unauthorized company and offboarded role fail closed',async()=>{
  assert.equal((await call('/api/recruitment/candidates/candidateA?companyId=coA',ctx('manage','coB'))).status,404);
  assert.equal((await call('/api/recruitment/candidates/candidateA?companyId=coA',ctx('manage','coA',false))).status,404);
});
await check('non-string candidate name fails validation without throwing',async()=>{
  const response=await call('/api/recruitment/candidates',ctx('create'),'POST',
    {companyId:'coA',fullName:42,roleTitle:'Designer'},'recruitment-invalid-name-key-001');
  assert.equal(response.status,400);
});
await check('malformed or overlong candidate fields cannot silently lose site or intake data',async()=>{
  const invalid=[{email:55},{phone:['private']},{sourceKind:33},{sourceKind:''},
    {sourceReference:{value:'private'}},{locationId:99},{locationId:'L'.repeat(129)},
    {email:'x'.repeat(321)},{phone:'9'.repeat(41)},
    {sourceKind:'internal'.repeat(8)},{sourceReference:'R'.repeat(201)}];
  for(let i=0;i<invalid.length;i++){
    const r=await call('/api/recruitment/candidates',ctx('create'),'POST',
      {companyId:'coA',fullName:'Rejected Candidate',roleTitle:'Designer',...invalid[i]},
      'recruitment-invalid-extra-key-'+i+'-001');
    assert.equal(r.status,400);
  }
  assert.equal(one("SELECT count(*) AS c FROM recruitment_candidates WHERE full_name='Rejected Candidate'").c,0);
});
await check('candidate creation and identical idempotency replay are single-record',async()=>{
  const body={companyId:'coA',fullName:'Candidate B',roleTitle:'Designer',sourceKind:'internal'};
  const first=await call('/api/recruitment/candidates',ctx('create'),'POST',body,'recruitment-candidate-key-001');
  assert.equal(first.status,201);
  const replay=await call('/api/recruitment/candidates',ctx('create'),'POST',body,'recruitment-candidate-key-001');
  assert.equal(replay.body.deduplicated,true);
  assert.equal(one("SELECT count(*) AS c FROM recruitment_candidates WHERE full_name='Candidate B'").c,1);
});
await check('reused creation key with changed payload conflicts and creates nothing',async()=>{
  const result=await call('/api/recruitment/candidates',ctx('create'),'POST',
    {companyId:'coA',fullName:'Candidate C',roleTitle:'Designer',sourceKind:'internal'},
    'recruitment-candidate-key-001');
  assert.equal(result.status,409);
  assert.equal(one("SELECT count(*) AS c FROM recruitment_candidates WHERE full_name='Candidate C'").c,0);
});
await check('view-only and foreign-company writers cannot create candidates',async()=>{
  const body={companyId:'coA',fullName:'Denied Candidate',roleTitle:'Designer'};
  assert.equal((await call('/api/recruitment/candidates',ctx('view'),'POST',
    body,'recruitment-denied-view-001')).status,404);
  assert.equal((await call('/api/recruitment/candidates',ctx('create','coB'),'POST',
    body,'recruitment-denied-company-001')).status,404);
  assert.equal(one("SELECT count(*) AS c FROM recruitment_candidates WHERE full_name='Denied Candidate'").c,0);
});
await check('eligible interviewer directory denies viewer, foreign company and other site',async()=>{
  q("INSERT INTO company_locations(id,company_id,name,active) VALUES('locOther','coA','Other Site',1)");
  q("INSERT INTO employees(id,display_name,employment_status) VALUES('otherSite','Other Site Staff','active')");
  q("INSERT INTO employee_company_memberships(id,employee_id,company_id,location_id,active) VALUES('otherSiteMembership','otherSite','coA','locOther',1)");
  q("INSERT INTO employees(id,display_name,employment_status) VALUES('terminatedA','Terminated','terminated')");
  q("INSERT INTO employee_company_memberships(id,employee_id,company_id,location_id,active) VALUES('terminatedMembership','terminatedA','coA','locA',1)");
  q("UPDATE recruitment_candidates SET location_id='locA' WHERE id='candidateA'");
  q("UPDATE employee_company_memberships SET location_id='locA' WHERE employee_id='interviewerA'");
  const path='/api/recruitment/interviewers?companyId=coA&candidateId=candidateA';
  assert.equal((await call(path,ctx('view'))).status,404);
  assert.equal((await call(path,ctx('approve','coB'))).status,404);
  const result=await call(path,ctx('edit'));
  assert.equal(result.status,200);
  assert.deepEqual(result.body.interviewers.map(row=>row.id),['interviewerA']);
  assert.equal(result.body.interviewers[0].displayName,'Interviewer A');
});
await check('interviewer discovery refuses missing candidate and wrong stage',async()=>{
  assert.equal((await call('/api/recruitment/interviewers?companyId=coA&candidateId=missing',ctx('edit'))).status,404);
  q("INSERT INTO recruitment_candidates(id,company_id,candidate_ref,full_name,role_title,stage,created_by) VALUES('appliedA','coA','ref-applied','Applicant','Analyst','applied','ownerA')");
  assert.equal((await call('/api/recruitment/interviewers?companyId=coA&candidateId=appliedA',ctx('edit'))).status,404);
});
await check('stage revision permits one winner and one correlated audit',async()=>{
  const payload={companyId:'coA',id:'candidateA',nextStage:'interview',expectedRevision:0};
  const first=await call('/api/recruitment/candidates/stage',ctx('edit'),'POST',payload);
  assert.equal(first.status,200);
  assert.equal(first.body.revision,1);
  const stale=await call('/api/recruitment/candidates/stage',ctx('edit'),'POST',payload);
  assert.equal(stale.status,409);
  assert.equal(one("SELECT revision FROM recruitment_candidates WHERE id='candidateA'").revision,1);
  assert.equal(one("SELECT count(*) AS c FROM audit_logs WHERE action='candidate_stage' AND entity_id='candidateA'").c,1);
});
await check('malformed interview mode cannot silently become a remote interview',async()=>{
  const invalidModes=['',55,{},'remote'.repeat(5)];
  for(let i=0;i<invalidModes.length;i++){
    const key='recruitment-invalid-mode-key-'+i+'-001';
    const r=await call('/api/recruitment/interviews',ctx('edit'),'POST',
      {companyId:'coA',candidateId:'candidateA',interviewerEmployeeId:'interviewerA',
        scheduledAt:'2027-02-01T10:00:00.000Z',meetingMode:invalidModes[i]},key);
    assert.equal(r.status,400);
    assert.equal(one('SELECT count(*) AS c FROM recruitment_request_receipts WHERE request_key=?',key).c,0);
  }
});
await check('authorized company interviewer scheduling passes transactional adapter',async()=>{
  const body={companyId:'coA',candidateId:'candidateA',interviewerEmployeeId:'interviewerA',
    scheduledAt:'2027-02-01T10:00:00.000Z',meetingMode:'remote'};
  const result=await call('/api/recruitment/interviews',ctx('edit'),'POST',body,'recruitment-interview-key-001');
  assert.equal(result.status,201);
  assert.equal(one("SELECT count(*) AS c FROM recruitment_interviews WHERE id=? ",result.body.id).c,1);
});
await check('two scheduled candidates cannot double-book an interviewer slot',async()=>{
  q("INSERT INTO recruitment_candidates(id,company_id,location_id,candidate_ref,full_name,role_title,stage,created_by) VALUES('candidateSlot','coA','locA','ref-slot','Slot Candidate','Designer','applied','ownerA')");
  q("UPDATE recruitment_candidates SET stage='screening' WHERE id='candidateSlot'");
  const result=await call('/api/recruitment/interviews',ctx('edit'),'POST',
    {companyId:'coA',candidateId:'candidateSlot',interviewerEmployeeId:'interviewerA',
      scheduledAt:'2027-02-01T10:00:00.000Z',meetingMode:'remote'},'recruitment-slot-conflict-key-001');
  assert.equal(result.status,409);
  assert.equal(one("SELECT count(*) AS c FROM recruitment_request_receipts WHERE request_key='recruitment-slot-conflict-key-001'").c,0);
  assert.equal(one("SELECT count(*) AS c FROM audit_logs WHERE action='schedule_interview'").c,1);
});
await check('future interview completion is denied without an audit',async()=>{
  const id=one("SELECT id FROM recruitment_interviews WHERE scheduled_at='2027-02-01T10:00:00.000Z'").id;
  const result=await call('/api/recruitment/interviews/review',ctx('edit'),'POST',
    {companyId:'coA',id,decision:'completed',recommendation:'advance',
      feedback:'This did not occur.',expectedRevision:0});
  assert.equal(result.status,409);
  assert.equal(one('SELECT status FROM recruitment_interviews WHERE id=?',id).status,'scheduled');
  assert.equal(one("SELECT count(*) AS c FROM audit_logs WHERE action='interview_review'").c,0);
});
await check('past interview completion is single-winner and auditable',async()=>{
  q("INSERT INTO recruitment_interviews(id,company_id,candidate_id,interviewer_employee_id,scheduled_at,created_by) VALUES('interviewPast','coA','candidateA','interviewerA','2025-01-01T10:00:00.000Z','ownerA')");
  const body={companyId:'coA',id:'interviewPast',decision:'completed',
    recommendation:'hold',feedback:'Documented evidence reviewed.',expectedRevision:0};
  const first=await call('/api/recruitment/interviews/review',ctx('edit'),'POST',body);
  assert.equal(first.status,200);
  assert.equal((await call('/api/recruitment/interviews/review',ctx('edit'),'POST',body)).status,409);
  assert.equal(one("SELECT status FROM recruitment_interviews WHERE id='interviewPast'").status,'completed');
  assert.equal(one("SELECT count(*) AS c FROM audit_logs WHERE action='interview_review' AND entity_id='interviewPast'").c,1);
});
await check('terminal candidate cannot gain completed interview evidence',async()=>{
  q("INSERT INTO recruitment_candidates(id,company_id,location_id,candidate_ref,full_name,role_title,stage,created_by) VALUES('candidateTerminal','coA','locA','ref-terminal','Terminal Candidate','Designer','applied','ownerA')");
  q("UPDATE recruitment_candidates SET stage='screening' WHERE id='candidateTerminal'");
  q("INSERT INTO recruitment_interviews(id,company_id,candidate_id,interviewer_employee_id,scheduled_at,created_by) VALUES('interviewTerminal','coA','candidateTerminal','interviewerA','2025-01-01T11:00:00.000Z','ownerA')");
  q("UPDATE recruitment_candidates SET stage='withdrawn' WHERE id='candidateTerminal'");
  const result=await call('/api/recruitment/interviews/review',ctx('edit'),'POST',
    {companyId:'coA',id:'interviewTerminal',decision:'completed',recommendation:'hold',
      feedback:'Should not be recorded.',expectedRevision:0});
  assert.equal(result.status,409);
  assert.equal(one("SELECT status FROM recruitment_interviews WHERE id='interviewTerminal'").status,'scheduled');
});
await check('interviewer revocation during request aborts audit and receipt',async()=>{
  revokeBeforeBatch=true;
  const body={companyId:'coA',candidateId:'candidateA',interviewerEmployeeId:'interviewerA',
    scheduledAt:'2027-03-01T10:00:00.000Z',meetingMode:'remote'};
  const result=await call('/api/recruitment/interviews',ctx('edit'),'POST',body,'recruitment-interview-key-002');
  assert.equal(result.status,409);
  assert.equal(one("SELECT count(*) AS c FROM recruitment_request_receipts WHERE request_key='recruitment-interview-key-002'").c,0);
  assert.equal(one("SELECT count(*) AS c FROM audit_logs WHERE action='schedule_interview'").c,1);
});
await check('revoked interviewer disappears from the company/site picker',async()=>{
  const result=await call('/api/recruitment/interviewers?companyId=coA&candidateId=candidateA',ctx('edit'));
  assert.equal(result.status,200);
  assert.deepEqual(result.body.interviewers,[]);
});
let approvedOfferId='';
await check('internal offer approval and HR handoff remain pending, replay safe',async()=>{
  q("INSERT INTO recruitment_candidates(id,company_id,candidate_ref,full_name,role_title,stage,created_by) VALUES('candidateOffer','coA','ref-offer','Candidate Offer','Engineer','applied','ownerA')");
  q("UPDATE recruitment_candidates SET stage='screening' WHERE id='candidateOffer'");
  q("UPDATE recruitment_candidates SET stage='interview' WHERE id='candidateOffer'");
  q("INSERT INTO recruitment_interviews(id,company_id,candidate_id,interviewer_employee_id,scheduled_at,created_by) VALUES('offerInterview','coA','candidateOffer','otherSite','2025-02-01T10:00:00.000Z','ownerA')");
  q("UPDATE recruitment_interviews SET status='completed',feedback='Internal interview outcome recorded',recommendation='advance' WHERE id='offerInterview'");
  q("UPDATE recruitment_candidates SET stage='decision' WHERE id='candidateOffer'");
  const offer=await call('/api/recruitment/offers',ctx('approve'),'POST',
    {companyId:'coA',candidateId:'candidateOffer',roleTitle:'Engineer',termsSummary:'Restricted internal draft terms'},
    'recruitment-offer-create-key-001');
  assert.equal(offer.status,201);approvedOfferId=offer.body.id;
  const approved=await call('/api/recruitment/offers/decision',ctx('approve'),'POST',
    {companyId:'coA',id:approvedOfferId,decision:'approved',expectedRevision:0});
  assert.equal(approved.status,200);
  assert.match(approved.body.message,/No offer sent/);
  const stage=await call('/api/recruitment/candidates/stage',ctx('approve'),'POST',
    {companyId:'coA',id:'candidateOffer',nextStage:'offer_prepared',expectedRevision:0});
  assert.equal(stage.status,200);
  const payload={companyId:'coA',candidateId:'candidateOffer',offerId:approvedOfferId,
    acceptanceEvidenceRef:'verified-externally-reference-001'};
  const handoff=await call('/api/recruitment/hr-handoffs',ctx('approve'),'POST',
    payload,'recruitment-handoff-key-001');
  assert.equal(handoff.status,201);assert.equal(handoff.body.status,'pending');
  const replay=await call('/api/recruitment/hr-handoffs',ctx('approve'),'POST',
    payload,'recruitment-handoff-key-001');
  assert.equal(replay.body.deduplicated,true);
  assert.equal(one("SELECT count(*) AS c FROM recruitment_hr_handoffs WHERE candidate_id='candidateOffer'").c,1);
  assert.equal(one("SELECT status FROM recruitment_hr_handoffs WHERE candidate_id='candidateOffer'").status,'pending');
});
await check('same-company wrong-candidate offer cannot request HR handoff',async()=>{
  q("INSERT INTO recruitment_candidates(id,company_id,candidate_ref,full_name,role_title,stage,created_by) VALUES('candidateOther','coA','ref-other','Other Candidate','Engineer','applied','ownerA')");
  q("UPDATE recruitment_candidates SET stage='screening' WHERE id='candidateOther'");
  q("UPDATE recruitment_candidates SET stage='interview' WHERE id='candidateOther'");
  q("INSERT INTO recruitment_interviews(id,company_id,candidate_id,interviewer_employee_id,scheduled_at,created_by) VALUES('otherInterview','coA','candidateOther','otherSite','2025-02-01T11:00:00.000Z','ownerA')");
  q("UPDATE recruitment_interviews SET status='completed',feedback='Other candidate interview',recommendation='hold' WHERE id='otherInterview'");
  q("UPDATE recruitment_candidates SET stage='decision' WHERE id='candidateOther'");
  q("INSERT INTO recruitment_offers(id,company_id,candidate_id,role_title,terms_summary,created_by) VALUES('otherOffer','coA','candidateOther','Engineer','Internal approved terms','ownerA')");
  q("UPDATE recruitment_offers SET status='approved',approved_by='ownerA',approved_at=CURRENT_TIMESTAMP WHERE id='otherOffer'");
  q("UPDATE recruitment_candidates SET stage='offer_prepared' WHERE id='candidateOther'");
  const result=await call('/api/recruitment/hr-handoffs',ctx('approve'),'POST',
    {companyId:'coA',candidateId:'candidateOther',offerId:approvedOfferId,
      acceptanceEvidenceRef:'verified-externally-reference-002'},'recruitment-handoff-wrong-key-001');
  assert.equal(result.status,404);
  assert.equal(one("SELECT count(*) AS c FROM recruitment_request_receipts WHERE request_key='recruitment-handoff-wrong-key-001'").c,0);
});
await check('competing HR handoff request cannot leave false success receipt',async()=>{
  const result=await call('/api/recruitment/hr-handoffs',ctx('approve'),'POST',
    {companyId:'coA',candidateId:'candidateOffer',offerId:approvedOfferId,
      acceptanceEvidenceRef:'verified-externally-reference-003'},'recruitment-handoff-compete-key-001');
  assert.equal(result.status,409);
  assert.equal(one("SELECT count(*) AS c FROM recruitment_request_receipts WHERE request_key='recruitment-handoff-compete-key-001'").c,0);
  assert.equal(one("SELECT count(*) AS c FROM audit_logs WHERE action='request_hr_handoff'").c,1);
});
await check('view-only candidate detail cannot disclose offer terms or HR evidence',async()=>{
  const r=await call('/api/recruitment/candidates/candidateOffer?companyId=coA',ctx('view'));
  assert.equal(r.status,200);
  assert.equal(r.body.offers,undefined);assert.equal(r.body.hrHandoffs,undefined);
});
await check('idempotent replay proves entity existence, kind and company across all four create actions',async()=>{
  const cases=[
    ['/api/recruitment/candidates','create',
      {companyId:'coA',fullName:'Candidate B',roleTitle:'Designer',sourceKind:'internal'},
      'recruitment-candidate-key-001','candidate'],
    ['/api/recruitment/interviews','edit',
      {companyId:'coA',candidateId:'candidateA',interviewerEmployeeId:'interviewerA',
        scheduledAt:'2027-02-01T10:00:00.000Z',meetingMode:'remote'},
      'recruitment-interview-key-001','interview'],
    ['/api/recruitment/offers','approve',
      {companyId:'coA',candidateId:'candidateOffer',roleTitle:'Engineer',
        termsSummary:'Restricted internal draft terms'},
      'recruitment-offer-create-key-001','offer'],
    ['/api/recruitment/hr-handoffs','approve',
      {companyId:'coA',candidateId:'candidateOffer',offerId:approvedOfferId,
        acceptanceEvidenceRef:'verified-externally-reference-001'},
      'recruitment-handoff-key-001','hr_handoff']
  ];
  for(const [path,level,body,key,kind] of cases){
    const receipt=one('SELECT entity_id AS entityId,entity_type AS entityType FROM recruitment_request_receipts WHERE request_key=?',key);
    assert.equal(receipt.entityType,kind);
    const replay=()=>call(path,ctx(level),'POST',body,key);
    assert.equal((await replay()).body.deduplicated,true);
    q('UPDATE recruitment_request_receipts SET entity_id=? WHERE request_key=?',`missing-${kind}`,key);
    const missing=await replay();
    assert.equal(missing.status,409);
    assert.equal(missing.body.deduplicated,undefined);
    q('UPDATE recruitment_request_receipts SET entity_id=? WHERE request_key=?',receipt.entityId,key);
    q("UPDATE recruitment_request_receipts SET entity_type='not-a-recruitment-kind' WHERE request_key=?",key);
    assert.equal((await replay()).status,409);
    q('UPDATE recruitment_request_receipts SET entity_type=? WHERE request_key=?',kind,key);
    assert.equal((await replay()).body.deduplicated,true);
  }
  q("INSERT INTO recruitment_candidates(id,company_id,candidate_ref,full_name,role_title,created_by) VALUES('foreignReplay','coB','foreign-replay-ref','Foreign Candidate','Designer','ownerA')");
  q("UPDATE recruitment_request_receipts SET entity_id='foreignReplay' WHERE request_key='recruitment-candidate-key-001'");
  assert.equal((await call('/api/recruitment/candidates',ctx('create'),'POST',
    {companyId:'coA',fullName:'Candidate B',roleTitle:'Designer',sourceKind:'internal'},
    'recruitment-candidate-key-001')).status,409);
  q("UPDATE recruitment_request_receipts SET entity_id=(SELECT id FROM recruitment_candidates WHERE full_name='Candidate B' AND company_id='coA') WHERE request_key='recruitment-candidate-key-001'");
});
await check('historical success receipt never bypasses current create permission or employment status',async()=>{
  const body={companyId:'coA',fullName:'Candidate B',roleTitle:'Designer',sourceKind:'internal'};
  const key='recruitment-candidate-key-001';
  assert.equal((await call('/api/recruitment/candidates',ctx('view'),'POST',body,key)).status,404);
  assert.equal((await call('/api/recruitment/candidates',ctx('create','coB'),'POST',body,key)).status,404);
  assert.equal((await call('/api/recruitment/candidates',ctx('create','coA',false),'POST',body,key)).status,404);
  assert.equal((await call('/api/recruitment/candidates',ctx('create'),'POST',body,key)).body.deduplicated,true);
});

console.log('RECRUITMENT ROUTE SQLITE-MOCK:',passed,'checks passed; not Cloudflare D1/true multi-worker acceptance');
if(process.exitCode)process.exit(process.exitCode);
