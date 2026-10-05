import assert from 'node:assert/strict';
import { inspectActiveBatchDuplicates } from './preflight-payroll-payment-batch-active-uniqueness.mjs';

function database(rows) {
  return {
    prepare(sql) {
      assert.match(sql, /status NOT IN \('cancelled', 'failed'\)/);
      return { all: () => rows };
    },
  };
}

const ready = inspectActiveBatchDuplicates(database([]));
assert.deepEqual(ready, { ready: true, duplicateGroups: [] }, 'clean database is migration-ready');

const blocked = inspectActiveBatchDuplicates(database([
  { payrollRunId: 'run-b', fundingBankKey: 'bank-1', activeBatchCount: 2 },
]));
assert.deepEqual(blocked, {
  ready: false,
  duplicateGroups: [{ payrollRunId: 'run-b', fundingBankKey: 'bank-1', activeBatchCount: 2 }],
}, 'pre-existing active duplicates block readiness without mutation');

console.log('PASS 2 payroll payment-batch preflight assertions');
