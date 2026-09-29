import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../worker/smart-search.ts', import.meta.url), 'utf8');
assert.match(source, /scopedCompanyIds\(c,'users\.access'\)/);
assert.match(source, /scopedCompanyIds\(c,'hr\.access'\)/);
assert.match(source, /JOIN employee_company_memberships m ON m\.employee_id=e\.id AND m\.active=1/);
assert.match(source, /scope\(uniquePeopleCompanies,'m\.company_id'\)/);
assert.match(source, /payroll_runs WHERE \$\{scope\(payrollCompanies\)\} AND run_no LIKE/);
assert.match(source, /construction_projects WHERE \$\{scope\(constructionCompanies\)\} AND \(name LIKE/);
assert.match(source, /function scope\(ids:string\[\],column='company_id'\).*'1=0'/);
assert.doesNotMatch(source, /SELECT id,display_name displayName[^\n]*FROM employees WHERE/);
console.log('Smart Search authorized company scope: 8/8 PASS');
