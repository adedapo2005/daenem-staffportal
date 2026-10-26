import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { validGuidedDependencies, guidedFieldVisible } from '../src/guided-form-dependencies.ts';
import { checkFormAnswerCompleteness } from '../worker/form-answer-completeness.ts';
import { validSubmittedSelectAnswer } from '../worker/form-select-contract.ts';

// Execute the real Worker handler with an isolated fake D1 transaction boundary.
// This is not a replacement submit implementation or a mutation of remote D1.
const source = readFileSync(new URL('../worker/forms.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('forms.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
let original;
function walk(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'submitForm') original = node;
  ts.forEachChild(node, walk);
}
walk(parsed);
assert.ok(original, 'Authoritative Forms submission handler is required');
const compiled = ts.transpileModule(original.getText(parsed).replace(/^export\s+/, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

const schema = [
  {key:'outcome',label:'Outcome',type:'select',required:true,options:['Pass','Fail']},
  {key:'remark',label:'Corrective action',type:'textarea',required:true,showWhen:{fieldKey:'outcome',equals:'Fail'}},
  {key:'quantity',label:'Quantity',type:'number',required:true},
  {key:'recorded',label:'Recorded date',type:'date',required:true},
  {key:'ack',label:'Acknowledged',type:'checkbox',required:true},
];
const answers = { outcome:'Pass', quantity:'0', recorded:'2024-02-29', ack:true };

function fixture(options = {}) {
  let idCount = 0;
  const queries = [], committed = [];
  const assignment = {
    id:'assigned-form-1', companyId:'company-printing', formId:'form-1', required:1, blocking:1,
    schemaJson:JSON.stringify(options.schema ?? schema),
    requireLocation:options.requireLocation ? 1 : 0,
    requirePhoto:options.requirePhoto ? 1 : 0,
    requireSignature:options.requireSignature ? 1 : 0,
  };
  const existing = options.existing ?? null;
  const DB = {
    prepare(sql) {
      const statement = {
        sql, args:[],
        bind(...args) { this.args=args; return this; },
        async first() {
          queries.push({sql:this.sql,args:this.args});
          if (this.sql.includes('FROM workflow_form_assignments a JOIN workflow_forms wf')) return assignment;
          if (this.sql.includes('offline_idempotency_key=?')) return options.replay ?? null;
          if (this.sql.includes('SELECT id,status,updated_at AS updatedAt')) return existing;
          throw Error('Unexpected D1 select: '+this.sql);
        },
        async run() { throw Error('Submission and audit must not write outside D1 batch'); },
      };
      return statement;
    },
    async batch(statements) {
      assert.equal(statements.length, 2, 'One write and one audit in the same D1 batch');
      assert.match(statements[0].sql, /workflow_form_submissions/);
      assert.match(statements[1].sql, /INSERT INTO audit_logs/);
      queries.push({kind:'batch',sql:statements.map(s=>s.sql)});
      if (options.failAudit) throw Error('Injected transaction rollback');
      for (const statement of statements) committed.push({sql:statement.sql,args:statement.args});
      return statements.map(()=>({success:true}));
    },
  };
  const context = {employee:{id:'staff-1'}, permissions:{'forms.access':'view'}, companies:[]};
  const json = (body,status=200) => new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
  const allowed = options.allowed !== false;
  const mine = async () => json({assignments:allowed?[{assignmentId:assignment.id}]:[]});
  const can = () => options.hasPermission !== false;
  const uid = prefix => prefix+'-test-'+(++idCount);
  const handler = new Function('can','json','uid','myAssignments','validGuidedDependencies',
    'guidedFieldVisible','validSubmittedSelectAnswer','checkFormAnswerCompleteness',
    compiled+'\nreturn submitForm;')(
      can,json,uid,mine,validGuidedDependencies,guidedFieldVisible,
      validSubmittedSelectAnswer,checkFormAnswerCompleteness);
  async function run(responses = answers, overrides = {}, headers = {}) {
    const request = new Request('https://unit.example/api/forms/submit',{
      method:'POST',headers:{'content-type':'application/json',...headers},
      body:JSON.stringify({assignmentId:assignment.id,responses,...overrides}),
    });
    const response = await handler(request,{DB},context);
    return {status:response.status,body:await response.json()};
  }
  return {run,committed,queries};
}

test('valid submission atomically commits response and audit entry',async()=>{
  const f=fixture();
  const out=await f.run();
  assert.equal(out.status,200);
  assert.equal(out.body.status,'submitted');
  assert.equal(f.committed.length,2);
  assert.match(f.committed[0].sql,/INSERT INTO workflow_form_submissions/);
  assert.equal(f.committed[0].args[4],'company-printing');
  assert.match(f.committed[1].sql,/INSERT INTO audit_logs/);
  assert.equal(f.committed[1].args[2],'company-printing');
});

test('injected audit failure rolls back both writes and never reports success',async()=>{
  const f=fixture({failAudit:true});
  await assert.rejects(f.run(),/Injected transaction rollback/);
  assert.equal(f.committed.length,0);
  assert.equal(f.queries.filter(x=>x.kind==='batch').length,1);
});

test('invalid numeric, impossible dates and unsupported evidence reject before D1 writes',async()=>{
  for(const responses of [
    {...answers,quantity:'not-a-number'},
    {...answers,recorded:'2024-02-30'},
    {...answers,ack:false},
    {...answers,unknown:'forged'},
  ]) {
    const f=fixture();
    const out=await f.run(responses);
    assert.equal(out.status,400,JSON.stringify(out));
    assert.equal(f.committed.length,0);
  }
  const photo=fixture({requirePhoto:true});
  assert.equal((await photo.run()).body.code,'FORM_EVIDENCE_UNSUPPORTED');
  assert.equal(photo.committed.length,0);
});

test('conditional hidden answer cannot be smuggled through direct Worker submission',async()=>{
  const f=fixture();
  const out=await f.run({...answers,remark:'inapplicable private data'});
  assert.equal(out.status,400);
  assert.equal(out.body.code,'FORM_FIELD_HIDDEN');
  assert.equal(f.committed.length,0);
});

test('revoked or unassigned employee cannot query or commit another company form',async()=>{
  const denied=fixture({allowed:false});
  assert.equal((await denied.run()).status,404);
  assert.equal(denied.committed.length,0);
  const missingPermission=fixture({hasPermission:false});
  assert.equal((await missingPermission.run()).status,403);
  assert.equal(missingPermission.committed.length,0);
});

test('offline optimistic conflict prevents response and audit changes',async()=>{
  const f=fixture({existing:{id:'submission-1',status:'submitted',updatedAt:'previous-version'}});
  const out=await f.run(answers,{baseUpdatedAt:'stale-version'});
  assert.equal(out.status,409);
  assert.equal(out.body.code,'CONFLICT');
  assert.equal(f.committed.length,0);
});

test('already-reviewed entries reject updates before any write',async()=>{
  const f=fixture({existing:{id:'submission-1',status:'reviewed',updatedAt:'v1'}});
  assert.equal((await f.run()).status,409);
  assert.equal(f.committed.length,0);
});

test('valid update uses one atomic update-plus-audit batch',async()=>{
  const f=fixture({existing:{id:'submission-1',status:'submitted',updatedAt:'v1'}});
  const out=await f.run(answers,{baseUpdatedAt:'v1'});
  assert.equal(out.status,200);
  assert.equal(f.committed.length,2);
  assert.match(f.committed[0].sql,/UPDATE workflow_form_submissions/);
  assert.match(f.committed[0].sql,/employee_id=\?/);
});

test('idempotent replay returns original receipt without a second batch write',async()=>{
  const f=fixture({replay:{id:'submission-1',status:'submitted'}});
  const out=await f.run(answers,{}, {'idempotency-key':'stable-request-key'});
  assert.equal(out.status,200);
  assert.equal(out.body.deduplicated,true);
  assert.equal(out.body.submissionId,'submission-1');
  assert.equal(f.committed.length,0);
});
