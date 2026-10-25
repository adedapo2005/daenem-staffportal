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
  assert.match(source, /offline\.readFormsDraft\(item\.assignmentId,assignedFormDraftCompany\(item\)!\)/);
  assert.match(source, /offline\.queueFormsDraft\(\{assignmentId:item\.assignmentId,companyId:assignmentCompanyId/);
  assert.match(source, /offline\.queueFormsSubmission\(\{assignmentId:item\.assignmentId,companyId:assignmentCompanyId/);
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
