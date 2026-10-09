import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const actions=readFileSync(new URL('../src/jobs-recruitment-actions.tsx',import.meta.url),'utf8');
const board=readFileSync(new URL('../src/jobs-recruitment-workspace.tsx',import.meta.url),'utf8');
const checks=[
  ['interview review uses scoped endpoint and revision',actions,/submit\('\/interviews\/review',[\s\S]*expectedRevision:interview\.revision/],
  ['interview review requires editing permission',actions,/if\(!canEdit\|\|!scheduled\.length\)return null/],
  ['completed interview requires feedback',actions,/decision==='completed'&&!feedback\.trim\(\)/],
  ['future interview completion is disabled in picker',actions,/disabled=\{!canComplete\}>Completed with documented feedback/],
  ['future completion submission fails closed',actions,/if\(decision==='completed'&&!canComplete\)return/],
  ['offer draft sent with replay key',actions,/submit\('\/offers',\{companyId,candidateId,roleTitle:role,termsSummary:terms\},true\)/],
  ['offer decision uses version',actions,/submit\('\/offers\/decision',[\s\S]*expectedRevision:offer\.revision/],
  ['offer management checks approver scope',actions,/if\(!canApprove\)return/],
  ['offer draft only in decision stage',actions,/stage==='decision'&&<OfferDraft/],
  ['HR handoff remains scoped to approved offers',actions,/approved=\(offers\|\|\[\]\)\.filter\(offer=>offer\.status==='approved'\)/],
  ['HR handoff refuses pending or acknowledged duplicate',actions,/stage==='offer_prepared'&&approved\.length>0&&!pending&&!acknowledged/],
  ['HR handoff records request with replay key',actions,/submit\('\/hr-handoffs',[\s\S]*acceptanceEvidenceRef:reference\},true\)/],
  ['no false employee creation in UI',actions,/does not verify acceptance, create an employee or complete onboarding/],
  ['HR handoff reference does not assert acceptance verification',actions,/Acceptance evidence reference \(HR must verify independently\)/],
  ['HR acknowledgment does not assert verified actor',actions,/An HR acknowledgment status is recorded; HR authority must verify it/],
  ['cancelled HR handoff does not claim completion',actions,/This handoff was cancelled; no onboarding completion is implied/],
  ['interview actions wired to selected candidate',board,/<InterviewActions interviews=\{detail\.interviews\} companyId=\{companyId\}/],
  ['offers wired to record approval',board,/<OfferActions offers=\{detail\.offers\}[\s\S]*canApprove=\{cap\.approve\}/],
  ['HR handoff wired to record approval',board,/<HandoffActions handoffs=\{detail\.hrHandoffs\}[\s\S]*canApprove=\{cap\.approve\}/],
  ['stage transition requires documented evidence',board,/const prerequisiteReady=next==='decision'\?detail\.interviews\.some/],
  ['replay key is retained across ambiguous error',board,/pendingRequestKeys\.current\.get\(fingerprint\)\|\|key\(\)/],
  ['replay key retired only after confirmed success',board,/if\(withKey\)pendingRequestKeys\.current\.delete\(fingerprint\)/]
];
let passed=0;
for(const [name,source,pattern] of checks) {
  assert.match(source,pattern,name);passed++;
  process.stdout.write('PASS: '+name+'\n');
}
process.stdout.write('PASS: '+passed+'/'+checks.length+' source action assertions; NOT rendered/browser/D1/TypeScript acceptance\n');
