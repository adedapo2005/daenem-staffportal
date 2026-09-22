import { readFileSync } from 'node:fs';

const printing = readFileSync(new URL('../worker/printing.ts', import.meta.url), 'utf8');
const production = readFileSync(new URL('../worker/printing-production.ts', import.meta.url), 'utf8');
const assertions = [];
function check(name, condition) {
  assertions.push({ name, ok: Boolean(condition) });
  if (!condition) process.exitCode = 1;
}

check('Printing access is evaluated for the Printing company', printing.includes("hasPermission(context, 'printing.access', minimum, companyId)"));
check('Printing finance visibility requires approval or company Finance authority', printing.includes("canPrint(context, 'approve') || hasPermission(context, 'finance.access', 'view', companyId)"));
check('Dashboard finance is omitted for ordinary operational viewers', printing.includes('...(canViewFinancials ? {') && printing.includes('recentJobs: canViewFinancials ?'));
check('Service prices are permission-filtered', printing.includes('services: canViewPrintFinancials(context) ? rows : rows.map(withoutPrintingFinancials)'));
check('Customer balances are permission-filtered', printing.includes('customers: canViewPrintFinancials(context) ? rows : rows.map(withoutPrintingFinancials)'));
check('Job costing fields are permission-filtered', printing.includes('jobs: canViewPrintFinancials(context) ? rows : rows.map(withoutPrintingFinancials)'));
check('Quoted value writes require financial authority', printing.includes('Finance view permission is required to set quoted value'));
check('Print job locations require active Printing company scope', printing.includes("company_locations WHERE id = ? AND company_id = ? AND active = 1"));
check('Designer and operator references require active Printing membership', printing.includes('JOIN employee_company_memberships m ON m.employee_id = e.id') && printing.includes("m.company_id = ? AND m.active = 1 AND e.employment_status = 'active'"));
check('Printing job customer and service joins repeat company scope', printing.includes('LEFT JOIN customers c ON c.id = pj.customer_id AND c.company_id = pj.company_id') && printing.includes('LEFT JOIN printing_services ps ON ps.id = pj.service_id AND ps.company_id = pj.company_id') && production.includes('LEFT JOIN customers c ON c.id=pj.customer_id AND c.company_id=pj.company_id') && production.includes('LEFT JOIN printing_services ps ON ps.id=pj.service_id AND ps.company_id=pj.company_id'));
check('Queue gates repeat Printing service company scope', printing.includes('FROM printing_services WHERE id = ? AND company_id = ?`).bind(job.serviceId, companyId)'));
check('Printing job employee names require active company memberships', printing.includes('designer_membership.company_id = pj.company_id') && printing.includes('operator_membership.company_id = pj.company_id') && production.includes('designer_membership.company_id=pj.company_id') && production.includes('operator_membership.company_id=pj.company_id'));
check('Production material references repeat Printing company scope', production.includes('i.company_id=?') && production.includes('l.company_id=?') && production.includes('.bind(companyId,companyId,jobId)'));
check('Material cost overrides require financial authority', printing.includes('Finance view permission is required to override material cost'));
check('Material locations require company scope', printing.includes('Selected Printing stock location was not found.'));
check('Stock balance lookup repeats Printing company scope', printing.includes('stock_balances WHERE company_id = ? AND location_id = ? AND item_id = ?'));
check('Commercial and terminal transitions require approval', printing.includes("['customer_approved', 'completed', 'cancelled'].includes(body.toStatus)") && production.includes("['customer_approved','completed','cancelled'].includes(to)"));
check('Status transitions cannot rewrite artwork or proof status', !printing.includes('body.artworkStatus') && !printing.includes('body.proofStatus'));
check('Production detail strips finance fields without authority', production.includes('job:finance?job:withoutFinancials(job)') && production.includes('materials:finance?materialRows:materialRows.map(withoutFinancials)'));
check('Production detail hides finance notes without authority', production.includes("noteRows.filter((row)=>String(row.noteType)!=='finance')"));
check('Printing file reads bind keys to an authorized job', production.includes("parts[0]!=='printing'") && production.includes('!await assertJob(env,jobId)'));
check('Printing file metadata must match job and category', production.includes("object.customMetadata?.jobId!==jobId") && production.includes("object.customMetadata?.category!==category"));
check('Artwork approval requires approval authority', production.includes("status==='approved'&&!can(context,'approve')"));
check('Artwork file references bind to the same job', production.includes("validJobFileKey(body.fileKey,jobId,['artwork'])"));
check('Proof file references bind to the same job', production.includes("validJobFileKey(body.fileKey,jobId,['proof'])"));
check('Delivery proof references bind to the same job', production.includes("validJobFileKey(body.proofKey,jobId,['delivery'])"));
check('Finishing costs require financial authority', production.includes('Finance view permission is required to record finishing cost'));
check('Finance notes require financial authority', production.includes("type==='finance'&&!canViewFinancials(context)"));
check('Printing API responses disable caching', printing.includes("'cache-control': 'no-store'") && production.includes("'cache-control':'no-store'"));

for (const result of assertions) console.log(`${result.ok ? '✓' : '✗'} ${result.name}`);
if (process.exitCode) console.error(`\n${assertions.filter((item) => !item.ok).length} Printing boundary assertion(s) failed.`);
else console.log(`\n${assertions.length} Printing boundary assertions passed.`);
