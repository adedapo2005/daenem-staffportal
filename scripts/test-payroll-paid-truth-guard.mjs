import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const payroll = await readFile(new URL('../worker/payroll.ts', import.meta.url), 'utf8');
const ui = await readFile(new URL('../src/payroll.tsx', import.meta.url), 'utf8');

assert.equal(/processing:\s*\[\s*['"]paid['"]\s*\]/.test(payroll), false,
  'Payroll run must not allow a manual processing -> paid transition.');
assert.equal(payroll.includes('PAYMENT_RECONCILIATION_REQUIRED'), true,
  'Payroll status API must explicitly require reconciliation evidence for Paid.');
assert.equal(ui.includes('Record as Paid'), false,
  'Payroll UI must not expose a manual Record as Paid action.');

console.log('PAYROLL PAID TRUTH GUARD: PASS');
