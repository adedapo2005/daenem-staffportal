import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frontend = await readFile(new URL('../src/bakery-v2.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/bakery.css', import.meta.url), 'utf8');
const backend = await readFile(new URL('../worker/bakery.ts', import.meta.url), 'utf8');

const checks = [
  [frontend.includes("const bakeryCompanyId='company-bakery'"), 'Bakery company scope is explicit'],
  [frontend.includes("hasWorkforcePermission(c,p,m,bakeryCompanyId)"), 'active Bakery permissions are company-scoped'],
  [frontend.includes("showCommercial={salesCan(context)}"), 'commercial visibility follows sales authority'],
  [frontend.includes("salesCan(context)?api<Dashboard>('/api/bakery/dashboard'):Promise.resolve(null)"), 'operations-only users do not request the commercial dashboard'],
  [frontend.includes("Today's order value") && !frontend.includes("Today's sales"), 'order value is not labelled as settled sales'],
  [frontend.includes('do not confirm bank/POS settlement or reconciliation'), 'dashboard separates order value from settlement truth'],
  [frontend.includes("amountPaidNaira:payment==='cash'&&cashConfirmed?Number(amount||0):0"), 'provider-selected methods cannot submit a confirmed paid amount'],
  [frontend.includes("fulfillNow:orderType==='walk_in'&&payment==='cash'&&cashConfirmed&&Number(amount||0)>=total/100"), 'automatic fulfillment is limited to confirmed fully-paid cash walk-ins'],
  [frontend.includes('Confirm cash received'), 'cash receipt requires explicit cashier confirmation'],
  [frontend.includes('This payment stays outstanding until StaffPortal receives verified payment confirmation.'), 'non-cash provider methods stay visibly outstanding'],
  [frontend.includes('Credit does not mean Paid.'), 'credit is not presented as paid'],
  [!frontend.includes('<span>Reference</span>'), 'active checkout does not treat a typed reference as payment confirmation'],
  [frontend.includes(">Create order</button>"), 'checkout action uses truthful order wording'],
  [frontend.includes("setPayment(e.target.value);setAmount('');setCashConfirmed(false)"), 'changing payment method clears stale cash-confirmation state'],
  [css.includes('.bakery-commercial-truth') && css.includes('.bakery-payment-truth'), 'truth notices have dedicated styling'],
  [backend.includes("'confirmed')") && backend.includes("method==='pos_terminal'?'pos_received'"), 'committed backend provider-confirmation dependency remains surfaced rather than fabricated'],
];

let passed=0;
for(const [ok,message] of checks){assert.ok(ok,message);passed++;}
console.log(`PASS ${passed}/${checks.length} active Bakery payment-truth assertions`);
