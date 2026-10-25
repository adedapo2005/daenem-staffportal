import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assignedFormDraftCompany } from '../src/forms-assignment-draft-scope.ts';

test('each Forms assignment owns its own offline namespace regardless of navigation context', () => {
  const assignments = [
    { assignmentId: 'printing-a', companyId: 'printing-company' },
    { assignmentId: 'bakery-b', companyId: 'bakery-company' },
    { assignmentId: 'group-c', companyId: null },
  ];
  const routeCompanyId = 'printing-company'; // A permitted navigation context, not a picker.
  const userCompanies = ['printing-company', 'bakery-company'];
  assert.equal(assignedFormDraftCompany(assignments[0]), 'printing-company');
  assert.equal(assignedFormDraftCompany(assignments[1]), 'bakery-company');
  assert.equal(assignedFormDraftCompany(assignments[2]), null);
  assert.notEqual(assignedFormDraftCompany(assignments[1]), routeCompanyId);
  assert.notEqual(assignedFormDraftCompany(assignments[1]), userCompanies[0]);
});
test('global forms never silently reuse the first permitted company', () => {
  for (const item of [{ companyId: null }, { companyId: undefined }, { companyId: '' }, {}]) {
    assert.equal(assignedFormDraftCompany(item), null);
  }
  assert.equal(assignedFormDraftCompany({companyId:'  company-verified  '}), 'company-verified');
});
test('Forms Center reads and saves drafts by assignment company, not parent route or first company', () => {
  const source = readFileSync(new URL('../src/centers.tsx', import.meta.url), 'utf8');
  assert.match(source, /assignedFormDraftCompany\(item\)/);
  assert.match(source, /offlineRef\.current\.readFormsDraft\(item\.assignmentId,assignedFormDraftCompany\(item\)!\)/);
  assert.match(source, /offlineRef\.current\.queueFormsDraft\(\{assignmentId:item\.assignmentId,companyId:assignmentCompanyId/);
  assert.match(source, /offlineRef\.current\.queueFormsSubmission\(\{assignmentId:item\.assignmentId,companyId:assignmentCompanyId/);
  assert.doesNotMatch(source, /companyId\|\|context\.companies\[0\]\?\.id\|\|'group'/);
  assert.match(source, /Group-wide forms need a live connection/);
  assert.match(source, /Answers are not saved offline/);
  assert.doesNotMatch(source, /Select a company to continue/);
});
test('offline authority enforces the exact company identity when using an assignment scope', () => {
  const source = readFileSync(new URL('../src/offline-sync.tsx', import.meta.url), 'utf8');
  assert.match(source, /context\.companies\.find\(\(item\) => item\.id === companyId\)/);
  assert.match(source, /ensureCurrentGrant\(identity\.companyId, 'forms\.submit'\)/);
  assert.match(source, /permitsOfflineKind\(context, identity\.companyId, 'forms\.submit'\)/);
});

test('incomplete or invalid entries are drafted before any offline submit is queued', () => {
  const source = readFileSync(new URL('../src/centers.tsx', import.meta.url), 'utf8');
  const preflight = source.indexOf('const completeness=guidedCompletion(schema,payload),invalid=guidedInvalidAnswers(schema,payload);');
  const submitQueue = source.indexOf('await offlineRef.current.queueFormsSubmission(');
  assert.ok(preflight > 0 && submitQueue > preflight, 'completeness must run before queueing a submission');
  assert.match(source, /if\(completeness\.missingLabels\.length\|\|invalid\.length\)/);
  assert.match(source, /saved as a local draft, not submitted/);
  assert.match(source, /was not submitted\. Draft could not be saved securely/);
  assert.match(source, /Group-wide forms require a live connection/);
});

test('autosave is suspended before submission and queued answers are read-only', () => {
  const source = readFileSync(new URL('../src/centers.tsx', import.meta.url), 'utf8');
  const suspend = source.indexOf('await draftWriter.suspend(item.assignmentId)');
  const flush = source.indexOf('await draftWriter.flushAll()');
  const submitQueue = source.indexOf('await offlineRef.current.queueFormsSubmission(');
  assert.ok(suspend > 0 && flush > suspend && submitQueue > flush,
    'all local autosaves must settle before the offline submission queue changes state');
  assert.match(source, /if\(!heldForSubmission\)\{\s*draftWriter\.resume\(item\.assignmentId\)/);
  assert.match(source, /disabled=\{busy\|\|queuedAssignments\.has\(item\.assignmentId\)\}/);
  assert.match(source, /onBlurCapture=\{\(\)=>\{void draftWriter\.flush\(item\.assignmentId\)/);
  assert.match(source, /Submission is queued for sync/);
  assert.match(source, /if\(generation!==loadGeneration\.current\)return/);
  assert.match(source, /editRevision\.current\[id\]/);
});
