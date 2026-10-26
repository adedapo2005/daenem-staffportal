import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFormSubmissionAttemptTokens } from '../src/forms-submission-attempt.ts';

test('lost online acknowledgement and offline fallback share one submission key', () => {
  let n=0;
  const attempts=createFormSubmissionAttemptTokens(()=>'form-attempt-'+(++n));
  const first=attempts.get('assignment-printing','printing',{outcome:'Pass',count:0});
  const retry=attempts.get('assignment-printing','printing',{outcome:'Pass',count:0});
  const fallback=attempts.get('assignment-printing','printing',{outcome:'Pass',count:0});
  assert.equal(first,retry);
  assert.equal(retry,fallback);
  assert.equal(n,1,'A lost HTTP response must not mint a new key');
});

test('a changed answer, company or server revision is a new submission attempt', () => {
  let n=0;
  const attempts=createFormSubmissionAttemptTokens(()=>'form-attempt-'+(++n));
  const first=attempts.get('assignment-a','company-a',{count:1},'2026-10-25 13:00:00');
  const edited=attempts.get('assignment-a','company-a',{count:2},'2026-10-25 13:00:00');
  const newerRevision=attempts.get('assignment-a','company-a',{count:2},'2026-10-25 13:00:01');
  const differentCompany=attempts.get('assignment-a','company-b',{count:2},'2026-10-25 13:00:01');
  const anotherAssignment=attempts.get('assignment-b','company-b',{count:2},'2026-10-25 13:00:01');
  assert.equal(new Set([first,edited,newerRevision,differentCompany,anotherAssignment]).size,5);
});

test('successful or queued attempt is released and next action receives a fresh key', () => {
  let n=0;const attempts=createFormSubmissionAttemptTokens(()=>'form-attempt-'+(++n));
  const first=attempts.get('assignment-a',null,{ack:true});
  attempts.forget('assignment-a');
  const next=attempts.get('assignment-a',null,{ack:true});
  assert.notEqual(first,next);
});

test('missing, invalid or unsafe key generators are rejected instead of silently submitting', () => {
  for (const bad of ['', 'bad key with spaces', 'bad/key', 'a'.repeat(201)]) {
    const attempts=createFormSubmissionAttemptTokens(()=>bad);
    assert.throws(()=>attempts.get('assignment-a','company-a',{ok:true}),/secure form submission identity/);
  }
});

test('Forms Center explicitly uses the same key for online and offline submission',()=>{
  const ui=readFileSync(new URL('../src/centers.tsx',import.meta.url),'utf8');
  assert.match(ui,/createFormSubmissionAttemptTokens\(\(\)=>crypto\.randomUUID\(\)\)/);
  assert.match(ui,/const idempotencyKey=submissionAttempts\.get\(item\.assignmentId,assignmentCompanyId,payload,item\.submissionUpdatedAt\)/);
  assert.match(ui,/headers:\{'idempotency-key':idempotencyKey\}/);
  const offlineCalls=[...ui.matchAll(/await offlineRef\.current\.queueFormsSubmission\(\{([\s\S]*?)\},assignmentCompanyId!?\);/g)];
  assert.equal(offlineCalls.length,2,'Both direct-offline and network-fallback paths must remain covered');
  for(const match of offlineCalls) assert.match(match[1],/idempotencyKey/);
  assert.doesNotMatch(ui,/companyId\|\|context\.companies\[0\]/);
});

test('offline Forms queue carries the first online key, without affecting other domains',()=>{
  const offline=readFileSync(new URL('../src/offline-platform.ts',import.meta.url),'utf8');
  assert.match(offline,/export async function queueFormsSubmission[\s\S]*?idempotencyKey: input\.idempotencyKey/);
  assert.match(offline,/input\.kind === 'forms\.submit' && input\.state === 'waiting-to-sync'/);
  assert.match(offline,/current\?\.idempotencyKey \|\| input\.idempotencyKey \|\| strongId/);
  assert.doesNotMatch(offline,/export async function queueExpenseSubmission\([^)]*\)\s*\{\s*return upsertOperation\(identity, \{\s*idempotencyKey: input\.idempotencyKey/);
});
