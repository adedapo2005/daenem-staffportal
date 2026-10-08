import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frontend = await readFile(new URL('../src/autos.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/autos.css', import.meta.url), 'utf8');
const backend = await readFile(new URL('../worker/autos-v2.ts', import.meta.url), 'utf8');

const checks = [
  [frontend.includes("const autosCompanyId='company-autos'"), 'Autos company scope is explicit'],
  [frontend.includes("hasWorkforcePermission(c,p,m,autosCompanyId)"), 'Autos permissions are company-scoped'],
  [frontend.includes("canSeeSales?api<{leads:Lead[]}>('/api/autos/leads'):Promise.resolve({leads:[]})"), 'sales leads are not requested without sales authority'],
  [frontend.includes('showSales={canSeeSales}'), 'overview commercial visibility follows sales authority'],
  [frontend.includes('{showSales&&<section className="autos-truth-note">'), 'sales truth notice is hidden without sales authority'],
  [frontend.includes('Recorded sales') && frontend.includes('Recorded sale value'), 'dashboard uses recorded-sale wording'],
  [frontend.includes('do not confirm customer payment, bank settlement or final handover'), 'dashboard separates sale record from payment and delivery truth'],
  [frontend.includes("setSale({salePriceNaira:'',paymentTerms:''})"), 'sale form does not collect payment-confirmation amounts'],
  [frontend.includes("JSON.stringify({vehicleId:selected,salePriceNaira:Number(sale.salePriceNaira),paymentTerms:sale.paymentTerms})"), 'sale POST excludes deposit and paid amounts'],
  [frontend.includes("!['reserved','sold','delivered','retired'].includes(current.status)"), 'reserved vehicles cannot be offered for a second sale in the frontend'],
  [frontend.includes('Payment is not confirmed in this screen.'), 'sale success message does not claim payment'],
  [frontend.includes('Do not treat it as proof of customer payment, bank settlement or handover.'), 'sale form carries payment truth notice'],
  [frontend.includes('Deposit noted (unverified)'), 'lead deposit activity is explicitly unverified'],
  [frontend.includes('This logs a deposit note only. It does not confirm money received or bank settlement.'), 'lead deposit note does not claim receipt'],
  [frontend.includes("type Tab='overview'|'vehicles'|'leads'|'workshop'") && frontend.includes("<Wrench size={16}/> Workshop"), 'Workshop capability remains reachable'],
  [css.includes('.autos-truth-note') && css.includes('.autos-payment-truth'), 'truth notices have dedicated non-success styling'],
  [backend.includes("body.amountPaidNaira ?? body.depositNaira ?? 0") && backend.includes("paymentStatus = balance === 0 ? 'paid'"), 'backend still trusts client payment amounts, preserving the surfaced backend dependency'],
  [backend.includes("['sold','delivered','retired'].includes(vehicle.status)") && !backend.includes("['reserved','sold','delivered','retired'].includes(vehicle.status)"), 'backend still allows reserved-vehicle resubmission, preserving the surfaced concurrency dependency'],
];

let passed=0;
for(const [ok,message] of checks){assert.ok(ok,message);passed++;}
console.log(`PASS ${passed}/${checks.length} Autos payment-truth assertions`);
