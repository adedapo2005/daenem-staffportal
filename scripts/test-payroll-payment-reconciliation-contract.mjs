import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../worker/payroll-payment-reconciliation-policy.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const policy = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));

let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('PASS', name); };

const base = {
  sourceType: 'provider_webhook', fileSha256: null, direction: 'debit',
  amountMinor: 125000, expectedAmountMinor: 125000, currency: 'NGN',
  companyMatches: true, reconciliationStatus: 'unmatched',
  candidateReference: null, expectedCandidateReference: 'payroll-payment-line:item-1',
};

check('provider webhook is strong evidence', () => assert.equal(policy.strongPaymentEvidence('provider_webhook', null), true));
check('hashed CSV is strong evidence', () => assert.equal(policy.strongPaymentEvidence('csv', 'a'.repeat(64)), true));
check('unhashed CSV is not strong evidence', () => assert.equal(policy.strongPaymentEvidence('csv', null), false));
check('manual evidence cannot set Paid', () => assert.equal(policy.strongPaymentEvidence('manual', 'a'.repeat(64)), false));
check('exact amount debit can reconcile', () => assert.equal(policy.paymentEvidenceAcceptable(base), true));
check('cross-company evidence is denied', () => assert.equal(policy.paymentEvidenceAcceptable({ ...base, companyMatches: false }), false));
check('credit cannot prove payroll payout', () => assert.equal(policy.paymentEvidenceAcceptable({ ...base, direction: 'credit' }), false));
check('amount mismatch cannot reconcile', () => assert.equal(policy.paymentEvidenceAcceptable({ ...base, amountMinor: 124999 }), false));
check('duplicate evidence cannot reconcile', () => assert.equal(policy.paymentEvidenceAcceptable({ ...base, reconciliationStatus: 'duplicate' }), false));
check('exact evidence cannot move to another line', () => assert.equal(policy.paymentEvidenceAcceptable({ ...base, reconciliationStatus: 'exact', candidateReference: 'payroll-payment-line:other' }), false));
check('partial payment does not close run', () => assert.deepEqual(policy.derivePaymentClosure({ total: 4, paid: 3, held: 1, failed: 0 }), { batchStatus: 'partially_paid', runMayClose: false }));
check('all lines paid closes run', () => assert.deepEqual(policy.derivePaymentClosure({ total: 4, paid: 4, held: 0, failed: 0 }), { batchStatus: 'paid', runMayClose: true }));
check('manual run Paid transition is forbidden', () => assert.equal(policy.manualRunPaidAllowed(), false));

console.log(`PAYROLL PAYMENT RECONCILIATION POLICY: ${passed}/13 PASS`);
