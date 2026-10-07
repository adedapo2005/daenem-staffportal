import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const payroll = await readFile(new URL('../src/payroll.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/payroll.css', import.meta.url), 'utf8');
const backend = await readFile(new URL('../worker/payroll.ts', import.meta.url), 'utf8');

const checks = [
  [!payroll.includes('Record as Paid'), 'processing Payroll UI must not offer Record as Paid'],
  [!payroll.includes("move(String(detail.run.id),'paid')"), 'processing Payroll UI must not call paid transition'],
  [payroll.includes("if(toStatus==='paid')"), 'frontend keeps a defensive paid-transition guard'],
  [payroll.includes('Payment confirmation pending'), 'processing state explains pending payment confirmation'],
  [payroll.includes('bank or provider acknowledgement'), 'processing state names authoritative acknowledgement'],
  [payroll.includes('reconciliation evidence'), 'processing state names reconciliation evidence'],
  [payroll.includes('Move to payment preparation'), 'approved state uses truthful payment-preparation wording'],
  [payroll.includes('approve and prepare payment instructions.'), 'Payroll header no longer claims it records payment'],
  [css.includes('.payroll-settlement-truth'), 'truth notice has dedicated styling'],
  [!css.includes('font-size:8px') && !css.includes('font-size:7px'), 'Payroll visible typography has a 9px floor'],
  [backend.includes("if(body.toStatus==='paid')return json({error:'Payroll cannot be marked paid until authoritative payment acknowledgement and reconciliation evidence is available.'},409)"), 'frontend remains aligned to committed backend settlement guard'],
];

let passed = 0;
for (const [ok, message] of checks) {
  assert.ok(ok, message);
  passed += 1;
}
console.log(`PASS ${passed}/${checks.length} Payroll frontend settlement-truth assertions`);
