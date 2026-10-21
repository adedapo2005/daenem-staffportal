import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/smart-search.ts', import.meta.url), 'utf8');

assert.match(source, /scopedCompanyIds\(context,\s*'users\.access'\)/);
assert.match(source, /scopedCompanyIds\(context,\s*'hr\.access'\)/);
assert.match(source, /JOIN employee_company_memberships m ON m\.employee_id=e\.id AND m\.active=1/);
assert.match(source, /placeholders\(peopleCompanies,\s*'m\.company_id'\)/);
assert.match(source, /SELECT id,company_id AS companyId,period_start AS periodStart/);
assert.match(source, /payroll_runs[\s\S]*WHERE \$\{placeholders\(payrollCompanies\)\}/);
assert.match(source, /SELECT id,company_id AS companyId,project_no AS projectNo,name,status/);
assert.match(source, /construction_projects[\s\S]*WHERE \$\{placeholders\(constructionCompanies\)\}/);
assert.match(source, /const placeholders = \(ids: readonly string\[\], column = 'company_id'\) =>[\s\S]*'1=0'/);
assert.doesNotMatch(source, /FROM employees e\s+WHERE/);
console.log('Smart Search authorized company scope: 10/10 PASS');
