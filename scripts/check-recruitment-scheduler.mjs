import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scheduler=readFileSync(new URL('../src/jobs-recruitment-scheduler.tsx',import.meta.url),'utf8');
const board=readFileSync(new URL('../src/jobs-recruitment-workspace.tsx',import.meta.url),'utf8');
const backend=readFileSync(new URL('../worker/recruitment.ts',import.meta.url),'utf8');
const checks=[
  ['screening/interview stage gate',scheduler,/const eligibleStage = stage === 'screening' \|\| stage === 'interview'/],
  ['edit permission UI gate',scheduler,/if \(!canEdit \|\| !eligibleStage\) return null/],
  ['company and candidate directory binding',scheduler,/new URLSearchParams\(\{ companyId, candidateId \}\)/],
  ['no cached interviewer identities',scheduler,/cache: 'no-store', signal: controller.signal/],
  ['abort obsolete identity requests',scheduler,/return \(\) => controller.abort\(\)/],
  ['respond to read permission revocation',scheduler,/result.status === 403 \|\| result.status === 404\)[^\n]*onAccessDenied\(\)/],
  ['reject mismatched directory response',scheduler,/body.companyId !== companyId \|\| body.candidateId !== candidateId/],
  ['selection must come from authorized list',scheduler,/interviewers.some\(person => person.id === interviewerId\)/],
  ['valid future date',scheduler,/date.getTime\(\) > Date.now\(\)/],
  ['submission is idempotent',scheduler,/submit\('\/interviews',[\s\S]*\}, true\)/],
  ['no external communications',scheduler,/No invitation is sent/],
  ['submit disabled for invalid identity or time',scheduler,/disabled=\{busy \|\| loading \|\| !!error \|\| !validPerson \|\| !validTime\}/],
  ['selected record remount invalidates old selection',board,/<CandidateRecord key=\{selectedId\}/],
  ['access denial callback wired',board,/onAccessDenied=\{invalidateAccess\}/],
  ['server requires edit for interviewer list',backend,/if\(!companyFor\(context,companyId,'edit'\)\|\|!candidateId\)return error\(\)/],
  ['server rejects inactive interviewer',backend,/m.active=1 AND e.employment_status='active'/],
  ['server filters interviewer by candidate site',backend,/AND \(\?='' OR m.location_id=\?\)/]
];
for(const [name,source,pattern] of checks){
  assert.match(source,pattern,name);
  console.log('PASS',name);
}
console.log('RECRUITMENT SCHEDULER:',checks.length,'source assertions only; not TSX, browser or D1 acceptance');
