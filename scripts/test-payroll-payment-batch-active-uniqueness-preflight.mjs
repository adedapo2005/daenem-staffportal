import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { inspectActiveBatchDuplicates } from './preflight-payroll-payment-batch-active-uniqueness.mjs';

const database = new DatabaseSync(':memory:');
try {
  database.exec(`
    CREATE TABLE payroll_payment_batches (
      id TEXT PRIMARY KEY,
      payroll_run_id TEXT NOT NULL,
      funding_bank_key TEXT NOT NULL,
      status TEXT NOT NULL
    );
    INSERT INTO payroll_payment_batches VALUES
      ('active-1', 'run-duplicate', 'bank-a', 'draft'),
      ('active-2', 'run-duplicate', 'bank-a', 'processing'),
      ('cancelled-1', 'run-retry', 'bank-a', 'cancelled'),
      ('cancelled-2', 'run-retry', 'bank-a', 'cancelled'),
      ('failed-1', 'run-retry', 'bank-b', 'failed'),
      ('failed-2', 'run-retry', 'bank-b', 'failed'),
      ('active-3', 'run-retry', 'bank-c', 'draft');
  `);

  const before = database.prepare('SELECT id, payroll_run_id, funding_bank_key, status FROM payroll_payment_batches ORDER BY id').all();
  const result = inspectActiveBatchDuplicates(database);
  const after = database.prepare('SELECT id, payroll_run_id, funding_bank_key, status FROM payroll_payment_batches ORDER BY id').all();

  assert.equal(result.ready, false, 'an existing active run-and-bank duplicate blocks index readiness');
  assert.deepEqual(result.duplicateGroups, [{ payrollRunId: 'run-duplicate', fundingBankKey: 'bank-a', activeBatchCount: 2 }]);
  assert.deepEqual(after, before, 'preflight is read-only and preserves every row');

  database.exec(`DELETE FROM payroll_payment_batches WHERE id IN ('active-1', 'active-2')`);
  const clearResult = inspectActiveBatchDuplicates(database);
  assert.deepEqual(clearResult, { ready: true, duplicateGroups: [] }, 'cancelled and failed retries do not block the approved partial unique index');
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM payroll_payment_batches').get().count, 5, 'review setup changes are limited to the isolated in-memory fixture');
} finally {
  database.close();
}

console.log('PASS: payroll payment-batch migration 0096 read-only preflight detects active duplicates and ignores cancelled/failed retries');
