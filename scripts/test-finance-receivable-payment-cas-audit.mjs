import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync('worker/finance.ts', 'utf8');
const start = source.indexOf('async function receivePayment');
const end = source.indexOf('\nasync function ', start + 1);
assert.ok(start >= 0 && end > start, 'receivable payment route exists');
const handler = source.slice(start, end);

assert.ok(handler.includes("can(context,'finance.receivables','edit',row.companyId)"), 'edit permission is evaluated for the receivable company');
assert.ok(handler.includes('if(!row||!member(context,row.companyId)'), 'record and company authorization precede payment writes');
assert.ok(handler.includes('!Number.isSafeInteger(amount)||amount<=0'), 'non-numeric and unsafe amounts fail before writes');
assert.ok(handler.includes('AND paid_kobo=? AND balance_kobo=? AND status NOT IN'), 'balance update compares the previously-read payment and balance state');
assert.ok(handler.includes('const [updated]=await env.DB.batch(['), 'payment mutation and audit use one D1 batch');
assert.ok(handler.indexOf('UPDATE finance_receivables') < handler.indexOf('INSERT INTO finance_receivable_payments'), 'compare-and-set occurs before the payment record');
assert.ok(handler.includes('INSERT INTO finance_receivable_payments(id,receivable_id,amount_kobo,payment_method,reference,recorded_by) SELECT ?,?,?,?,?,? WHERE changes()=1'), 'a stale or losing concurrent request cannot insert a payment');
assert.ok(handler.includes("'receive_receivable_payment','finance_receivable_payment'") && handler.includes('before_json,after_json,source,request_id'), 'formal audit records the receivable payment with before/after state and correlation');
assert.ok(handler.includes('amountKobo:amount') && handler.includes('paymentId'), 'audit evidence identifies the payment amount and generated payment record');
assert.ok(handler.includes("WHERE changes()=1`)\n   .bind(uid('audit')"), 'audit evidence is written only when the payment insert succeeds');
const auditWrite = handler.slice(handler.indexOf("'receive_receivable_payment'"));
assert.ok(!auditWrite.includes('b.reference') && auditWrite.includes('paymentMethod:method'), 'audit excludes free-form payment references and records only the method');
assert.ok(handler.includes("if(Number(updated.meta?.changes||0)!==1)return json({error:'Receivable changed; refresh before recording another payment.'},409)"), 'losing concurrent updates fail without reporting a payment');
assert.ok(source.includes('replace(/[\\u0000-\\u001f\\u007f]/g,\'\').slice(0,128)'), 'request correlation is control-character filtered and bounded');

console.log('PASS: Finance receivable payment CAS/audit contract 13/13');
