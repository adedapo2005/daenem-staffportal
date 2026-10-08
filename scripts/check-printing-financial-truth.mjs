import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frontend = await readFile(new URL('../src/printing.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/printing.css', import.meta.url), 'utf8');
const backend = await readFile(new URL('../worker/printing.ts', import.meta.url), 'utf8');

const checks = [
  [frontend.includes("const printingCompanyId = 'company-printing'"), 'printing company scope is explicit'],
  [frontend.includes("hasWorkforcePermission(context, 'printing.access', minimum, printingCompanyId)"), 'printing access is company-scoped'],
  [frontend.includes("hasWorkforcePermission(context, 'finance.access', 'view', printingCompanyId)"), 'finance visibility is company-scoped'],
  [frontend.includes('const showFinancials = canViewFinancials(context);'), 'frontend derives a dedicated financial visibility gate'],
  [frontend.includes('{showFinancials && <article><TrendingUp'), 'commercial dashboard metrics are permission-gated'],
  [frontend.includes('{showFinancials && <b>{money(customer.balanceKobo)}</b>}'), 'customer balance is not rendered without financial authority'],
  [frontend.includes('{showFinancials && <label><span>Quoted amount (₦)</span>'), 'quote input is not rendered without financial authority'],
  [frontend.includes('financial={showFinancials}'), 'job financial columns receive the same visibility gate'],
  [frontend.includes('Month invoiced') && !frontend.includes('Month revenue'), 'invoiced value is not labelled as revenue'],
  [frontend.includes('Quoted / Invoiced Margin'), 'job margin wording states its commercial basis'],
  [frontend.includes('do not confirm customer payment, bank settlement or reconciliation'), 'frontend explicitly separates commercial figures from payment and reconciliation truth'],
  [css.includes('.printing-commercial-truth'), 'commercial truth notice has dedicated styling'],
  [css.includes('.printing-dashboard-grid.single'), 'non-financial dashboard reflows without an empty commercial column'],
  [backend.includes("COALESCE(SUM(invoiced_kobo),0)") && backend.includes('revenueKobo: revenue'), 'backend dashboard amount is sourced from recorded invoices'],
  [backend.includes('const canViewFinancials = canViewPrintFinancials(context);') && backend.includes('...(canViewFinancials ? {'), 'backend already suppresses financial fields without authority'],
];

let passed = 0;
for (const [ok, message] of checks) {
  assert.ok(ok, message);
  passed += 1;
}
console.log(`PASS ${passed}/${checks.length} Printing financial-truth assertions`);
