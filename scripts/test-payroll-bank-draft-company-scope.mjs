import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../worker/payroll-bank-draft.ts', import.meta.url), 'utf8');
const erpSource = await readFile(new URL('../worker/group-erp.ts', import.meta.url), 'utf8');
const authImport = "import{hasPermission,type AuthEnv,type SessionContext}from'./auth';";
assert.ok(source.includes(authImport), 'the dedicated payroll bank draft route must keep its auth dependency');
const testAuth = `const hasPermission=(context,code,minimum='view',companyId)=>{const levels=['none','view','create','edit','approve','manage'];const granted=companyId?context.companyPermissions?.[companyId]?.[code]||'none':context.permissions?.[code]||'none';return levels.indexOf(granted)>=levels.indexOf(minimum)};`;
const javascript = ts.transpile(source.replace(authImport, testAuth), { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
const moduleUrl = `data:text/javascript;base64,${Buffer.from(javascript).toString('base64')}`;
const { routePayrollBankDraft } = await import(moduleUrl);

const saveBankStart = erpSource.indexOf('async function saveBankAccount(');
const saveBankEnd = erpSource.indexOf('\nasync function ', saveBankStart);
const saveBankSource = erpSource.slice(saveBankStart, saveBankEnd < 0 ? undefined : saveBankEnd);
assert.ok(saveBankSource.includes('VALUES(?,?,?,?,?,?,?,?,0,?)'), 'new employee bank details must remain pending, not become payout-primary before verification');
assert.ok(!saveBankSource.includes('UPDATE employee_bank_accounts SET is_primary=0'), 'saving pending details must not demote an existing verified primary account');
assert.ok(erpSource.includes('ba.active=1 AND ba.is_primary=1 AND ba.verified_at IS NOT NULL WHERE pi.payroll_run_id=?'), 'the duplicate draft implementation must only select verified primary bank accounts');
assert.ok(erpSource.includes("pbi.status='ready' AND ba.id IS NOT NULL") && erpSource.includes('ba.verified_at IS NOT NULL WHERE pbi.batch_id=?'), 'CSV export must include only ready items linked to a verified bank account');
assert.ok(erpSource.includes('ba.active=1 AND ba.is_primary=1 AND ba.verified_at IS NOT NULL WHERE m.company_id=? AND m.active=1'), 'Payroll readiness must treat unverified bank details as missing');

function mockEnv(runStatus = 'approved', batchInsertChanges = 1) {
  const writes = [];
  const prepared = [];
  const env = { DB: {
    prepare(sql) {
      const statement = { sql, bindings: [], bind(...values) { this.bindings = values; return this; },
        async first() {
          if (sql.includes('FROM payroll_runs')) return { id: 'run-b', companyId: 'company-b', runNo: 'RUN-1', status: runStatus, totalNetKobo: 2500 };
          if (sql.includes('FROM payroll_banks')) return { bankKey: 'BANK-X', name: 'Bank X', adapter: 'csv', directApiAvailable: 0 };
          return null;
        },
        async all() { return { results: [
          { payrollItemId: 'item-1', employeeId: 'employee-1', displayName: 'Employee One', amountKobo: 1500, bankAccountId: 'account-1', beneficiaryBankKey: 'BANK-X', accountName: 'Employee One', last4: '1234' },
          // An unverified primary is absent from the LEFT JOIN projection and must be held like missing details.
          { payrollItemId: 'item-2', employeeId: 'employee-2', displayName: 'Employee Two', amountKobo: 1000, bankAccountId: null, beneficiaryBankKey: null, accountName: null, last4: null },
        ] }; },
      };
      prepared.push(statement);
      return statement;
    },
    async batch(statements) { writes.push(...statements); return [{ meta: { changes: batchInsertChanges } }]; },
  } };
  return { env, writes, prepared };
}

function context({ owner = false, companies = ['company-a', 'company-b'], permissions = { 'payroll.access': 'edit' }, companyPermissions = { 'company-a': { 'payroll.access': 'edit' }, 'company-b': { 'payroll.access': 'none' } } } = {}) {
  return { employee: { id: 'actor-1' }, roles: owner ? [{ code: 'owner' }] : [], companies: companies.map(id => ({ id })), permissions, companyPermissions };
}

async function requestFor(env, user) {
  return routePayrollBankDraft(new Request('https://staff.test/api/payroll/payment-batches', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payrollRunId: 'run-b', fundingBankKey: 'BANK-X' }),
  }), env, user);
}

{
  const { env, writes } = mockEnv();
  const response = await requestFor(env, context());
  assert.equal(response.status, 404, 'Company A Payroll Edit plus Company B Payroll None must be denied neutrally');
  assert.equal(writes.length, 0, 'the unauthorized request must perform zero writes');
}

{
  const { env, writes, prepared } = mockEnv();
  const user = context({ companyPermissions: { 'company-a': { 'payroll.access': 'none' }, 'company-b': { 'payroll.access': 'edit' } } });
  const response = await requestFor(env, user);
  assert.equal(response.status, 201, 'Company B Payroll Edit must create the draft');
  const payload = await response.json();
  assert.equal(payload.batch.status, 'draft');
  assert.equal(payload.batch.heldCount, 1, 'employees without verified bank details remain held');
  assert.ok(prepared.some(statement => statement.sql.includes('ba.verified_at IS NOT NULL')), 'the effective dedicated POST query requires verified primary bank details');
  assert.equal(writes.length, 4, 'the only writes are one batch, two draft items, and one audit entry');
  assert.ok(writes.every(statement => /^\s*INSERT INTO (payroll_payment_batches|payroll_payment_batch_items|audit_logs)\b/i.test(statement.sql)), 'authorized writes must remain limited to draft records and audit evidence');
  assert.equal(writes[0].bindings[2], 'company-b', 'the payment draft is stored in Company B');
  assert.equal(writes.at(-1).bindings[2], 'company-b', 'audit evidence is scoped to Company B');
  assert.match(writes[0].sql, /FROM payroll_runs WHERE id=\? AND company_id=\? AND status IN \('approved','processing'\)/, 'draft creation rechecks payable status inside the write transaction');
  assert.match(writes[0].sql, /NOT EXISTS \(SELECT 1 FROM payroll_payment_batches/, 'draft creation checks for an active duplicate inside the write transaction');
  assert.ok(writes.slice(1).every(statement => /WHERE EXISTS \(SELECT 1 FROM payroll_payment_batches WHERE id=\? AND status='draft'\)/.test(statement.sql)), 'items and audit can only be inserted for the successfully created draft');
  assert.equal(writes[2].bindings[4], null, 'an unverified primary account is not snapshotted onto a held payment line');
  assert.equal(writes[2].bindings[6], null, 'unverified bank identity is withheld from the held payment line');
  assert.equal(writes[2].bindings[7], null, 'unverified account last-four digits are withheld from the held payment line');
  assert.equal(writes[2].bindings[10], 'held', 'unverified bank details cannot produce a ready payout line');
}

{
  const { env, writes } = mockEnv('approved', 0);
  const response = await requestFor(env, context({ companyPermissions: { 'company-b': { 'payroll.access': 'edit' } } }));
  assert.equal(response.status, 409, 'a run finalized or duplicated after preflight cannot create a draft');
  assert.match((await response.json()).error, /changed or already has a current payment draft/i);
  assert.match(writes[0].sql, /status IN \('approved','processing'\)/);
}

{
  const { env, writes } = mockEnv();
  const user = context({ owner: true, companies: ['company-a'], permissions: {}, companyPermissions: {} });
  const response = await requestFor(env, user);
  assert.equal(response.status, 201, 'Owner retains group-wide internal draft authority');
  assert.equal(writes.length, 4);
  assert.equal(writes[0].bindings[2], 'company-b', 'Owner-created internal draft remains scoped to its target company');
}

{
  const { env, writes } = mockEnv('paid');
  const response = await requestFor(env, context({ companyPermissions: { 'company-b': { 'payroll.access': 'edit' } } }));
  assert.equal(response.status, 409, 'finalized paid run cannot create another payment draft');
  assert.match((await response.json()).error, /finalized payroll run/i);
  assert.equal(writes.length, 0, 'paid-run draft denial performs zero writes');
}

{
  const { env, writes } = mockEnv('paid');
  const response = await requestFor(env, context({ owner: true, companies: ['company-a'], permissions: {}, companyPermissions: {} }));
  assert.equal(response.status, 409, 'Owner internal authority cannot create a draft for a finalized paid run');
  assert.equal(writes.length, 0, 'Owner paid-run draft denial performs zero writes');
}
console.log('PASS: dedicated payroll bank draft target-company denial, authorized Company B draft, held line, scoped audit, and Owner authority');
