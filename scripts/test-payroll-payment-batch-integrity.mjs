import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const source = await readFile(new URL('../worker/payroll-bank-draft.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function('module', 'exports', 'require', compiled)(loaded, loaded.exports, name => {
  assert.equal(name, './auth');
  return { hasPermission: () => true };
});
const { routePayrollBankDraft } = loaded.exports;
const context = {
  employee: { id: 'payroll-maker' }, roles: [{ code: 'payroll-manager' }],
  companies: [{ id: 'company-a' }], companyPermissions: { 'company-a': { 'payroll.access': 'create' } },
};
const itemRows = [
  { payrollItemId: 'item-1', employeeId: 'employee-1', displayName: 'Ada', amountKobo: 120000, bankAccountId: 'bank-a', beneficiaryBankKey: 'bank-one', accountName: 'Ada', last4: '1234' },
  { payrollItemId: 'item-2', employeeId: 'employee-2', displayName: 'Bola', amountKobo: 80000, bankAccountId: null, beneficiaryBankKey: null, accountName: null, last4: null },
];
function fixture({ runTotal = 200000, rows = itemRows, rejectBatchInsert = false, batchError = null } = {}) {
  const batches = [];
  const env = { DB: {
    prepare(sql) {
      return { sql, args: [], bind(...args) { this.args = args; return this; },
        async first() {
          if (sql.includes('FROM payroll_runs')) return { id: 'run-a', companyId: 'company-a', runNo: 'PAY-A-202610', status: 'approved', totalNetKobo: runTotal };
          if (sql.includes('FROM payroll_banks')) return { bankKey: 'bank-one', name: 'Bank One', adapter: 'file', directApiAvailable: 0 };
          return null;
        },
        async all() { return { results: rows }; },
      };
    },
    async batch(statements) {
      batches.push(statements);
      if (batchError) throw batchError;
      return statements.map((_, index) => ({ meta: { changes: index === 0 && !rejectBatchInsert ? 1 : 0 }, results: [] }));
    },
  } };
  return { env, batches };
}
const request = () => new Request('https://staffportal.test/api/payroll/payment-batches', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ payrollRunId: 'run-a', fundingBankKey: 'bank-one' }),
});

const valid = fixture();
const validResponse = await routePayrollBankDraft(request(), valid.env, context);
assert.equal(validResponse.status, 201);
assert.equal(valid.batches.length, 1);
const batchInsert = valid.batches[0][0];
assert.match(batchInsert.sql, /SELECT COUNT\(\*\) FROM payroll_items WHERE payroll_run_id=\?\)=\?/);
assert.match(batchInsert.sql, /SELECT COALESCE\(SUM\(net_kobo\),0\) FROM payroll_items WHERE payroll_run_id=\?\)=\?/);
assert.match(batchInsert.sql, /EXISTS \(SELECT 1 FROM payroll_banks WHERE bank_key=\? AND active=1\)/, 'the funding bank must still be active inside the atomic insert');
assert.deepEqual(batchInsert.args.slice(-4), ['run-a', 2, 'run-a', 200000]);
assert.deepEqual(batchInsert.args.slice(12, 19), ['run-a', 'bank-one', 'bank-one', 'run-a', 2, 'run-a', 200000]);

function executeParentGuard({ bankActive }) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE payroll_runs(id TEXT,company_id TEXT,status TEXT);
    CREATE TABLE payroll_banks(bank_key TEXT,active INTEGER);
    CREATE TABLE payroll_items(payroll_run_id TEXT,net_kobo INTEGER);
    CREATE TABLE payroll_payment_batches(id TEXT,payroll_run_id TEXT,company_id TEXT,funding_bank_key TEXT,batch_no TEXT,adapter TEXT,status TEXT,item_count INTEGER,total_kobo INTEGER,narration TEXT,prepared_by TEXT);
    INSERT INTO payroll_runs VALUES('run-a','company-a','approved');
    INSERT INTO payroll_items VALUES('run-a',120000),('run-a',80000);`);
  db.prepare('INSERT INTO payroll_banks VALUES(?,?)').run('bank-one', bankActive);
  try {
    const result = db.prepare(batchInsert.sql).run(...batchInsert.args);
    return Number(result.changes);
  } finally {
    db.close();
  }
}
assert.equal(executeParentGuard({ bankActive: 1 }), 1, 'an active funding bank permits the parent draft insert');
assert.equal(executeParentGuard({ bankActive: 0 }), 0, 'deactivating the funding bank after preflight prevents the parent draft insert');

const firstLineInsert = valid.batches[0][1];
assert.match(firstLineInsert.sql, /FROM payroll_items pi LEFT JOIN employee_bank_accounts ba/);
assert.match(firstLineInsert.sql, /pi\.id=\? AND pi\.payroll_run_id=\? AND pi\.employee_id=\? AND pi\.net_kobo=\?/);
assert.match(firstLineInsert.sql, /ba\.id IS \? AND ba\.bank_key IS \? AND ba\.account_name IS \? AND ba\.account_number_last4 IS \?/);
assert.match(valid.batches[0][2].sql, /SELECT CASE WHEN changes\(\)=1 THEN 1 ELSE json_extract\('payroll item changed during payment draft creation', '\$'\) END AS payment_line_required/);
assert.match(valid.batches[0][4].sql, /SELECT CASE WHEN changes\(\)=1 THEN 1 ELSE json_extract\('payroll item changed during payment draft creation', '\$'\) END AS payment_line_required/);
assert.equal(valid.batches[0][2].sql.includes('payment_line_required'), true, 'every line insert is immediately guarded inside the D1 transaction');

function executeLineSnapshot({ mutateItem }) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE payroll_payment_batches(id TEXT PRIMARY KEY,status TEXT);
    CREATE TABLE payroll_items(id TEXT PRIMARY KEY,payroll_run_id TEXT,employee_id TEXT,net_kobo INTEGER);
    CREATE TABLE employee_bank_accounts(id TEXT,employee_id TEXT,active INTEGER,is_primary INTEGER,verified_at TEXT,bank_key TEXT,account_name TEXT,account_number_last4 TEXT);
    CREATE TABLE payroll_payment_batch_items(id TEXT,batch_id TEXT,payroll_item_id TEXT,employee_id TEXT,bank_account_id TEXT,beneficiary_name TEXT,beneficiary_bank_key TEXT,beneficiary_account_last4 TEXT,amount_kobo INTEGER,narration TEXT,status TEXT);
    INSERT INTO payroll_items VALUES('item-1','run-a','employee-1',120000),('item-2','run-a','employee-2',80000);
    INSERT INTO employee_bank_accounts VALUES('bank-a','employee-1',1,1,'verified','bank-one','Ada','1234');`);
  if (mutateItem) db.exec("UPDATE payroll_items SET employee_id='employee-2' WHERE id='item-1'");
  try {
    db.exec('BEGIN');
    db.prepare('INSERT INTO payroll_payment_batches VALUES(?,?)').run(firstLineInsert.args[11], 'draft');
    const result = db.prepare(firstLineInsert.sql).run(...firstLineInsert.args);
    let guardError;
    try { db.prepare(valid.batches[0][2].sql).get(); } catch (error) { guardError = error; }
    if (guardError) db.exec('ROLLBACK');
    else db.exec('COMMIT');
    return {
      changes: Number(result.changes), guardError,
      drafts: Number(db.prepare('SELECT COUNT(*) AS count FROM payroll_payment_batches').get().count),
      lines: Number(db.prepare('SELECT COUNT(*) AS count FROM payroll_payment_batch_items').get().count),
    };
  } finally {
    db.close();
  }
}
const unchangedLine = executeLineSnapshot({ mutateItem: false });
assert.equal(unchangedLine.changes, 1, 'an unchanged payroll item and verified bank snapshot inserts successfully');
assert.equal(unchangedLine.guardError, undefined);
assert.equal(unchangedLine.drafts, 1);
assert.equal(unchangedLine.lines, 1);
const reassignedLine = executeLineSnapshot({ mutateItem: true });
assert.equal(reassignedLine.changes, 0, 'a changed employee assignment is rejected even when payroll item count and total remain unchanged');
assert.match(String(reassignedLine.guardError), /malformed JSON/i, 'the D1 in-batch assertion aborts when a beneficiary line no longer matches its source snapshot');
assert.equal(reassignedLine.drafts, 0, 'the draft parent rolls back when a source item changed after preflight');
assert.equal(reassignedLine.lines, 0);

for (const [label, options] of [
  ['run total mismatch', { runTotal: 199999 }],
  ['negative item amount', { rows: [{ ...itemRows[0], amountKobo: -1 }, itemRows[1]], runTotal: 79999 }],
  ['unsafe integer item amount', { rows: [{ ...itemRows[0], amountKobo: Number.MAX_SAFE_INTEGER + 1 }], runTotal: Number.MAX_SAFE_INTEGER + 1 }],
  ['empty payroll run', { rows: [], runTotal: 0 }],
]) {
  const test = fixture(options);
  const response = await routePayrollBankDraft(request(), test.env, context);
  assert.equal(response.status, 409, label);
  assert.equal(test.batches.length, 0, `${label} must not create a batch or audit`);
}

const raced = fixture({ rejectBatchInsert: true });
// Model the authoritative SQL count/total guard losing a race after preflight.
const racedResponse = await routePayrollBankDraft(request(), raced.env, context);
assert.equal(racedResponse.status, 409);
assert.equal(raced.batches[0][0].args.at(-1), 200000);

const bankDeactivatedDuringBatch = fixture({ batchError: new Error('malformed JSON') });
const bankDeactivatedResponse = await routePayrollBankDraft(request(), bankDeactivatedDuringBatch.env, context);
assert.equal(bankDeactivatedResponse.status, 409, 'a D1 in-batch guard failure caused by a funding-bank state change is reported as a conflict');
assert.match(await bankDeactivatedResponse.text(), /changed during payment draft creation/);

console.log('PASS payroll payment batch integrity: totals, item snapshots, active funding bank, and atomic conflict handling');
