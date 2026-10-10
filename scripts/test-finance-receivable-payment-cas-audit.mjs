import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = fs.readFileSync('worker/finance.ts', 'utf8');
const start = source.indexOf('async function receivePayment');
const end = source.indexOf('\nasync function ', start + 1);
assert.ok(start >= 0 && end > start, 'receivable payment route exists');
const handler = source.slice(start, end);

assert.ok(handler.includes("can(context,'finance.receivables','edit',row.companyId)"), 'edit permission is evaluated for the receivable company');
assert.ok(handler.includes('if(!row||!member(context,row.companyId)'), 'record and company authorization precede payment writes');
assert.ok(handler.includes("Payment must be verified through the authorized payment reconciliation process before updating this receivable."), 'payment claims receive a neutral verification-required response');
assert.ok(handler.includes('},409)'), 'unverified payment claims fail closed with a conflict response');
assert.ok(!handler.includes('env.DB.batch(') && !handler.includes('UPDATE finance_receivables'), 'unverified claims cannot update the receivable');
assert.ok(!handler.includes('INSERT INTO finance_receivable_payments') && !handler.includes('INSERT INTO audit_logs'), 'unverified claims cannot create payment or success-audit records');
assert.ok(!handler.includes('b.reference') && !handler.includes('b.paymentMethod') && !handler.includes('b.amountNaira'), 'caller amount, method and reference are never treated as payment evidence');

const executableSource = source
  .replace("import { hasPermission,type AuthEnv,type SessionContext } from './auth';", 'const hasPermission = () => true;');
assert.notEqual(executableSource, source, 'runtime fixture replaces only the authorization dependency');
const { outputText } = ts.transpileModule(executableSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { routeFinance } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

function fixture(companyId = 'company-a') {
  const writes = [];
  const env = { DB: {
    prepare(sql) {
      return {
        bind() { return this; },
        async first() {
          assert.match(sql, /FROM finance_receivables/);
          return { id: 'receivable-a', companyId, balanceKobo: 5000, paidKobo: 0 };
        },
        run() { writes.push(sql); throw new Error('unexpected database write'); },
      };
    },
    batch() { writes.push('batch'); throw new Error('unexpected database batch'); },
  } };
  const context = { employee: { id: 'employee-a' }, roles: [], companies: [{ id: 'company-a' }] };
  return { env, context, writes };
}

for (const paymentMethod of ['bank_transfer', 'pos', 'wallet', 'cheque', 'other', 'cash', 'not-a-method']) {
  const { env, context, writes } = fixture();
  const response = await routeFinance(new Request('https://staffportal.test/api/finance/receivables/payment', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'receivable-a', amountNaira: 50, paymentMethod, reference: 'unverified-ref' }),
  }), env, context);
  assert.equal(response.status, 409, `${paymentMethod} claims require verified evidence`);
  assert.equal((await response.json()).error,
    'Payment must be verified through the authorized payment reconciliation process before updating this receivable.');
  assert.deepEqual(writes, [], `${paymentMethod} claim cannot write payment, receivable or audit records`);
}

const unauthorized = fixture('company-b');
const denied = await routeFinance(new Request('https://staffportal.test/api/finance/receivables/payment', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id: 'receivable-b', amountNaira: 50, paymentMethod: 'bank_transfer', reference: 'secret-reference' }),
}), unauthorized.env, unauthorized.context);
assert.equal(denied.status, 404, 'cross-company denial remains neutral');
assert.deepEqual(unauthorized.writes, [], 'cross-company denial writes nothing');

console.log('PASS: Finance receivable payment evidence-required boundary 8/8; runtime payment-method matrix 8/8');
