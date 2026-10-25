import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validGuidedDependencies, guidedVisibleFields, pruneHiddenGuidedAnswers, guidedCompletion} from '../src/guided-form-dependencies.ts';
import {checkFormAnswerCompleteness} from '../worker/form-answer-completeness.ts';

const schema=[
 {key:'result',label:'Inspection Result',type:'select',required:true,options:['Pass','Fail']},
 {key:'corrective',label:'Corrective Action',type:'textarea',required:true,showWhen:{fieldKey:'result',equals:'Fail'}},
 {key:'ack',label:'Acknowledged',type:'checkbox',required:true},
];
test('valid deterministic dependency with no company selection',()=>{
 assert.equal(validGuidedDependencies(schema),true);
 assert.deepEqual(guidedVisibleFields(schema,{result:'Pass'}).map(f=>f.key),['result','ack']);
 assert.deepEqual(guidedVisibleFields(schema,{result:'Fail'}).map(f=>f.key),['result','corrective','ack']);
});
test('hidden required field does not block legitimate submission',()=>{
 assert.equal(checkFormAnswerCompleteness(schema,{result:'Pass',ack:true}),null);
 assert.deepEqual(guidedCompletion(schema,{result:'Pass',ack:true}),{completed:2,total:2,missingLabels:[],percent:100});
 assert.equal(checkFormAnswerCompleteness(schema,{result:'Fail',ack:true})?.code,'FORM_FIELD_REQUIRED');
});
test('stale hidden answers are rejected and pruned',()=>{
 const stale={result:'Pass',corrective:'Repair the machine',ack:true};
 assert.equal(checkFormAnswerCompleteness(schema,stale)?.code,'FORM_ANSWER_INVALID');
 assert.deepEqual(pruneHiddenGuidedAnswers(schema,stale),{result:'Pass',ack:true});
 assert.equal(checkFormAnswerCompleteness(schema,pruneHiddenGuidedAnswers(schema,stale)),null);
});
test('dependency schema rejects forward references, free-text sources, cycles and unknown options',()=>{
 for(const invalid of [
  [{key:'a',label:'A',type:'text',showWhen:{fieldKey:'b',equals:'x'}},{key:'b',label:'B',type:'select',options:['x']}],
  [{key:'a',label:'A',type:'text'},{key:'b',label:'B',type:'text',showWhen:{fieldKey:'a',equals:'x'}}],
  [{key:'a',label:'A',type:'select',options:['x']},{key:'b',label:'B',type:'text',showWhen:{fieldKey:'a',equals:'y'}}],
 ]) assert.equal(validGuidedDependencies(invalid),false);
});
test('visible missing checklist updates when selection changes',()=>{
 assert.deepEqual(guidedCompletion(schema,{result:'Fail',ack:true}).missingLabels,['Corrective Action']);
 assert.equal(guidedCompletion(schema,{result:'Fail',corrective:'Repair logged',ack:true}).percent,100);
 assert.equal(guidedCompletion(schema,{result:'Pass',ack:true}).percent,100);
});
test('Worker authority gate and UI progress integration stay connected',()=>{
 const backend=readFileSync(new URL('../worker/forms.ts',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../src/centers.tsx',import.meta.url),'utf8');
 assert.match(backend,/validGuidedDependencies\(schema\)/);
 assert.match(backend,/guidedFieldVisible\(schema,body\.responses,field\)/);
 assert.match(backend,/checkFormAnswerCompleteness\(schema,body\.responses/);
 assert.match(ui,/guidedVisibleFields\(schema,draft\)/);
 assert.match(ui,/guidedCompletion\(schema,draft\)/);
 assert.match(ui,/pruneHiddenGuidedAnswers\(formSchema\(item\)/);
 assert.doesNotMatch(ui,/Select company to continue/i);
});
