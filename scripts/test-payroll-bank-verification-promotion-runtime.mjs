import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../worker/payroll-bank-draft.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
new Function('exports', 'require', js)(exports, (id) => {
  assert.equal(id, './auth');
  return { hasPermission: (context, key, level, companyId) => context.companyPermissions?.[companyId]?.[key] === level };
});
const { promoteVerifiedEmployeeBankAccount } = exports;
assert.equal(typeof promoteVerifiedEmployeeBankAccount, 'function');

function createDb({ duplicateAudit, onPendingRead, failAudit = false, ignoreAudit = false } = {}) {
  const accounts = [
    { id: 'primary-a', employee_id: 'employee-a', active: 1, is_primary: 1, verified_at: '2026-01-01T00:00:00.000Z', verification_source: 'bank:old' },
    { id: 'candidate-a', employee_id: 'employee-a', active: 1, is_primary: 0, verified_at: null, verification_source: null },
    { id: 'candidate-b', employee_id: 'employee-a', active: 1, is_primary: 0, verified_at: null, verification_source: null }
  ];
  const audits = duplicateAudit ? [{ entity_id: duplicateAudit.entityId, action: 'verify_employee_bank', after_json: JSON.stringify({ verificationSource: duplicateAudit.source, verificationReference: duplicateAudit.reference }), request_id: 'prior-request' }] : [];
  const membership = { employee_id: 'employee-a', company_id: 'company-a', active: 1 };
  const actorMembership = { employee_id: 'actor-a', company_id: 'company-a', active: 1 };
  const actorGrant = { active: true };
  const db = {
    accounts, audits, batchCalls: 0,
    prepare(sql) {
      return {
        sql, args: [], bind(...args) { this.args = args; return this; },
        async first() {
          if (this.sql.includes('employee_company_memberships')) return membership.active === 1 ? { one: 1 } : null;
          if (this.sql.includes('employee_bank_accounts')) {
            const candidate = accounts.find(row => row.id === this.args[0] && row.employee_id === this.args[1] && row.active === 1 && row.is_primary === 0 && row.verified_at === null);
            const primary = accounts.find(row => row.employee_id === this.args[1] && row.active === 1 && row.is_primary === 1);
            onPendingRead?.(candidate, accounts, audits, membership, actorMembership, actorGrant);
            return candidate ? { id: candidate.id, priorPrimaryId: primary?.id ?? null } : null;
          }
          throw new Error(`Unexpected first query: ${this.sql}`);
        }
      };
    },
    async batch(statements) {
      this.batchCalls++;
      const originalAccounts = structuredClone(accounts);
      const originalAudits = structuredClone(audits);
      let changes = 0;
      try {
        const [update, insert, select] = statements;
        assert.match(update.sql, /^UPDATE employee_bank_accounts/);
        const [targetId, _targetId2, verifiedAt, _targetId3, verification, employeeId, _targetId4, candidateId, candidateEmployeeId, expectedPrimaryId, _primaryEmployeeId, _expectedPrimaryIdAgain, _expectedPrimaryIdForExists, _primaryEmployeeIdForExists, memberEmployeeId, memberCompanyId] = update.args;
        const actorOwnerId = update.args[16], actorMemberId = update.args[17], actorCompanyId = update.args[18];
        const source = update.args[29], reference = update.args[30];
        const priorRefExists = audits.some(row => row.action === 'verify_employee_bank' && JSON.parse(row.after_json).verificationSource === source && JSON.parse(row.after_json).verificationReference === reference);
        const candidate = accounts.find(row => row.id === candidateId && row.employee_id === candidateEmployeeId && row.active === 1 && row.is_primary === 0 && row.verified_at === null);
        const currentPrimary = accounts.find(row => row.employee_id === employeeId && row.active === 1 && row.is_primary === 1);
        const primaryUnchanged = expectedPrimaryId == null ? !currentPrimary : currentPrimary?.id === expectedPrimaryId;
        assert.match(update.sql, /EXISTS \(SELECT 1 FROM employee_company_memberships WHERE employee_id=\? AND company_id=\? AND active=1\)/);
        assert.match(update.sql, /JOIN role_permissions rp/);
        assert.match(update.sql, /employee_permission_overrides_v2/);
        assert.match(update.sql, /employee_permission_overrides o/);
        const currentMembership = membership.employee_id === memberEmployeeId && membership.company_id === memberCompanyId && membership.active === 1;
        const actorIsOwner = actorOwnerId === 'owner-a';
        const actorAuthorized = actorIsOwner || (actorMembership.employee_id === actorMemberId && actorMembership.company_id === actorCompanyId && actorMembership.active === 1 && actorGrant.active);
        if (candidate && primaryUnchanged && currentMembership && actorAuthorized && !priorRefExists) {
          const affected = accounts.filter(row => row.employee_id === employeeId && row.active === 1 && (row.id === targetId || row.is_primary === 1));
          for (const row of affected) {
            row.is_primary = row.id === targetId ? 1 : 0;
            if (row.id === targetId) {
              row.verified_at = verifiedAt;
              row.verification_source = verification;
            }
          }
          changes = affected.length;
        }
        assert.match(insert.sql, /^INSERT INTO audit_logs/);
        const [auditId, actorId, companyId, entityId, afterJson, requestId, auditCandidateId, auditEmployeeId, auditVerification, auditSource, auditReference] = insert.args;
        const row = accounts.find(item => item.id === auditCandidateId && item.employee_id === auditEmployeeId && item.active === 1 && item.is_primary === 1 && item.verified_at !== null && item.verification_source === auditVerification);
        const duplicate = audits.some(item => item.action === 'verify_employee_bank' && JSON.parse(item.after_json).verificationSource === auditSource && JSON.parse(item.after_json).verificationReference === auditReference);
        if (failAudit) throw new Error('simulated audit insert failure');
        if (changes > 0 && row && !duplicate && !ignoreAudit) {
          audits.push({ id: auditId, actor_employee_id: actorId, company_id: companyId, entity_id: entityId, action: 'verify_employee_bank', after_json: afterJson, request_id: requestId });
        }
        assert.match(select.sql, /^SELECT json_extract\(CASE WHEN EXISTS \(SELECT 1 FROM audit_logs WHERE id=\?\) THEN/);
        const [requiredAuditId, expectedSource, expectedReference, promotedId, promotedEmployeeId, expectedVerifiedAt, expectedVerification] = select.args;
        const auditPersisted = audits.some(item => item.id === requiredAuditId);
        const sameReferenceAuditExists = audits.some(item => item.action === 'verify_employee_bank' && JSON.parse(item.after_json).verificationSource === expectedSource && JSON.parse(item.after_json).verificationReference === expectedReference);
        const candidatePromoted = accounts.some(item => item.id === promotedId && item.employee_id === promotedEmployeeId && item.active === 1 && item.is_primary === 1 && item.verified_at === expectedVerifiedAt && item.verification_source === expectedVerification);
        if (!auditPersisted && !sameReferenceAuditExists && candidatePromoted) throw new Error('malformed JSON: required audit was silently ignored');
        changes = auditPersisted ? 1 : 0;
        return [{ results: [] }, { results: [] }, { results: [{ changed: changes }] }];
      } catch (error) {
        accounts.splice(0, accounts.length, ...originalAccounts);
        audits.splice(0, audits.length, ...originalAudits);
        throw error;
      }
    }
  };
  db.membership = membership;
  db.actorMembership = actorMembership;
  db.actorGrant = actorGrant;
  return db;
}

const context = {
  employee: { id: 'actor-a' },
  roles: [{ code: 'payroll-manager' }],
  companies: [{ id: 'company-a' }],
  companyPermissions: { 'company-a': { 'payroll.access': 'edit' } }
};
const input = { companyId: 'company-a', employeeId: 'employee-a', bankAccountId: 'candidate-a', verificationSource: 'bank', verificationReference: 'verify-123', verifiedAt: '2026-10-06T12:00:00.000Z' };
const makeRequest = (id = 'request-a') => new Request('https://staffportal.test/api/payroll/employee-bank/verify', { headers: { 'x-request-id': id } });
const auditCount = db => db.audits.length;
const responseJson = response => response.json();

{
  const db = createDb();
  const response = await promoteVerifiedEmployeeBankAccount(makeRequest(), { DB: db }, context, input);
  assert.equal(response.status, 200);
  assert.equal((await responseJson(response)).verified, true);
  assert.equal(db.accounts.find(row => row.id === 'candidate-a').is_primary, 1);
  assert.equal(db.accounts.find(row => row.id === 'primary-a').is_primary, 0);
  assert.equal(auditCount(db), 1);
  assert.equal(db.audits[0].request_id, 'request-a');
}

{
  const db = createDb();
  db.accounts.find(row => row.id === 'candidate-a').verified_at = '2026-10-05T00:00:00.000Z';
  const response = await promoteVerifiedEmployeeBankAccount(makeRequest(), { DB: db }, context, input);
  assert.equal(response.status, 404);
  assert.equal(db.accounts.find(row => row.id === 'primary-a').is_primary, 1);
  assert.equal(auditCount(db), 0);
}

{
  const db = createDb();
  const first = await promoteVerifiedEmployeeBankAccount(makeRequest('request-first'), { DB: db }, context, input);
  const replay = await promoteVerifiedEmployeeBankAccount(makeRequest('request-replay'), { DB: db }, context, input);
  assert.equal(first.status, 200);
  assert.equal(replay.status, 404);
  assert.equal(auditCount(db), 1);
  assert.equal(db.accounts.find(row => row.id === 'candidate-a').is_primary, 1);
}

{
  let raced = false;
  const db = createDb({ onPendingRead(candidate, accounts, audits) {
    if (!candidate || raced) return;
    raced = true;
    const primary = accounts.find(row => row.id === 'primary-a');
    const promoted = accounts.find(row => row.id === 'candidate-a');
    primary.is_primary = 0;
    promoted.is_primary = 1;
    promoted.verified_at = input.verifiedAt;
    promoted.verification_source = 'bank:verify-123';
    audits.push({ entity_id: 'candidate-a', action: 'verify_employee_bank', after_json: JSON.stringify({ verificationSource: 'bank', verificationReference: 'verify-123' }), request_id: 'winner-request' });
  } });
  const response = await promoteVerifiedEmployeeBankAccount(makeRequest('loser-request'), { DB: db }, context, input);
  assert.equal(response.status, 404);
  assert.equal(db.accounts.find(row => row.id === 'candidate-a').is_primary, 1);
  assert.equal(db.accounts.find(row => row.id === 'primary-a').is_primary, 0);
  assert.equal(auditCount(db), 1);
  assert.equal(db.audits[0].request_id, 'winner-request');
}

{
  let raced = false;
  const db = createDb({ onPendingRead(candidate, accounts, audits) {
    if (!candidate || raced) return;
    raced = true;
    const primary = accounts.find(row => row.id === 'primary-a');
    const winner = accounts.find(row => row.id === 'candidate-b');
    primary.is_primary = 0;
    winner.is_primary = 1;
    winner.verified_at = '2026-10-06T11:59:00.000Z';
    winner.verification_source = 'bank:other-verify';
    audits.push({ entity_id: 'candidate-b', action: 'verify_employee_bank', after_json: JSON.stringify({ verificationSource: 'bank', verificationReference: 'other-verify' }), request_id: 'winner-request' });
  } });
  const response = await promoteVerifiedEmployeeBankAccount(makeRequest('loser-request'), { DB: db }, context, input);
  assert.equal(response.status, 404);
  assert.equal(db.accounts.find(row => row.id === 'candidate-a').is_primary, 0);
  assert.equal(db.accounts.find(row => row.id === 'candidate-a').verified_at, null);
  assert.equal(db.accounts.find(row => row.id === 'candidate-b').is_primary, 1);
  assert.equal(db.accounts.find(row => row.id === 'primary-a').is_primary, 0);
  assert.equal(auditCount(db), 1);
  assert.equal(db.audits[0].request_id, 'winner-request');
}

{
  const db = createDb({ duplicateAudit: { entityId: 'candidate-a', source: 'bank', reference: 'verify-123' } });
  const nextCandidate = { ...input, bankAccountId: 'candidate-b' };
  const response = await promoteVerifiedEmployeeBankAccount(makeRequest(), { DB: db }, context, nextCandidate);
  assert.equal(response.status, 404);
  assert.equal(db.accounts.find(row => row.id === 'primary-a').is_primary, 1);
  assert.equal(db.accounts.find(row => row.id === 'candidate-b').is_primary, 0);
  assert.equal(auditCount(db), 1);
}

{
  const db = createDb({ duplicateAudit: { entityId: 'candidate-a', source: 'provider', reference: 'verify-123' } });
  const nextCandidate = { ...input, bankAccountId: 'candidate-b' };
  const response = await promoteVerifiedEmployeeBankAccount(makeRequest(), { DB: db }, context, nextCandidate);
  assert.equal(response.status, 200);
  assert.equal(db.accounts.find(row => row.id === 'candidate-b').is_primary, 1);
  assert.equal(db.accounts.find(row => row.id === 'candidate-b').verification_source, 'bank:verify-123');
  assert.equal(auditCount(db), 2);
}

{
  const db = createDb({ failAudit: true });
  await assert.rejects(promoteVerifiedEmployeeBankAccount(makeRequest(), { DB: db }, context, input), /simulated audit insert failure/);
  assert.equal(db.accounts.find(row => row.id === 'primary-a').is_primary, 1);
  assert.equal(db.accounts.find(row => row.id === 'candidate-a').is_primary, 0);
  assert.equal(db.accounts.find(row => row.id === 'candidate-a').verified_at, null);
  assert.equal(auditCount(db), 0);
}

{
  const db = createDb({ ignoreAudit: true });
  await assert.rejects(promoteVerifiedEmployeeBankAccount(makeRequest(), { DB: db }, context, input), /silently ignored/);
  assert.equal(db.accounts.find(row => row.id === 'primary-a').is_primary, 1);
  assert.equal(db.accounts.find(row => row.id === 'candidate-a').is_primary, 0);
  assert.equal(db.accounts.find(row => row.id === 'candidate-a').verified_at, null);
  assert.equal(auditCount(db), 0);
}

{
  const db = createDb({ onPendingRead(candidate, _accounts, _audits, membership) {
    if (candidate) membership.active = 0;
  } });
  const response = await promoteVerifiedEmployeeBankAccount(makeRequest('revoked-membership-request'), { DB: db }, context, input);
  assert.equal(response.status, 404);
  assert.equal(db.accounts.find(row => row.id === 'primary-a').is_primary, 1);
  assert.equal(db.accounts.find(row => row.id === 'candidate-a').is_primary, 0);
  assert.equal(db.accounts.find(row => row.id === 'candidate-a').verified_at, null);
  assert.equal(auditCount(db), 0);
}

{
  const db = createDb();
  const noCompanyPermission = { ...context, companyPermissions: {} };
  const response = await promoteVerifiedEmployeeBankAccount(makeRequest(), { DB: db }, noCompanyPermission, { ...input, companyId: 'company-b' });
  assert.equal(response.status, 404);
  assert.equal(db.batchCalls, 0);
  assert.equal(db.accounts.find(row => row.id === 'primary-a').is_primary, 1);
  assert.equal(auditCount(db), 0);
}

console.log('PASS payroll bank promotion isolated runtime: positive, stale, replay, cross-account replay, source distinction, stale-candidate race, changed-primary lost race, thrown and silently ignored audit rollback, post-preflight membership revocation, and company authorization (11 scenarios)');
