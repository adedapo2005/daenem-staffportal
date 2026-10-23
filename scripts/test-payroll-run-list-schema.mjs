import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../worker/payroll.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;

const module = { exports: {} };
const mockRequire = (specifier) => {
  if (specifier === './auth') return { hasPermission: () => true };
  throw new Error(`Unexpected payroll dependency: ${specifier}`);
};
new Function('require', 'module', 'exports', compiled)(mockRequire, module, module.exports);
const { routePayroll } = module.exports;

const database = new DatabaseSync(':memory:');
try {
  database.exec(`
    CREATE TABLE payroll_runs (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      run_no TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      pay_date TEXT,
      status TEXT NOT NULL,
      gross_total_kobo INTEGER NOT NULL DEFAULT 0,
      deduction_total_kobo INTEGER NOT NULL DEFAULT 0,
      net_total_kobo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    INSERT INTO payroll_runs VALUES
      ('run-a', 'company-a', 'QA-RUN-A', '2026-10-01', '2026-10-31', '2026-11-05',
       'draft', 12345, 2345, 10000, '2026-10-23T06:00:00.000Z'),
      ('run-b', 'company-b', 'QA-RUN-B', '2026-10-01', '2026-10-31', '2026-11-05',
       'draft', 90000, 10000, 80000, '2026-10-23T06:00:00.000Z');
  `);

  const DB = {
    prepare(sql) {
      let parameters = [];
      const statement = {
        bind(...values) { parameters = values; return statement; },
        all() { return Promise.resolve({ results: database.prepare(sql).all(...parameters) }); },
      };
      return statement;
    },
  };
  const context = {
    roles: [{ code: 'owner' }],
    companies: [{ id: 'company-a' }, { id: 'company-b' }],
    permissions: { 'payroll.access': 'manage' },
    employee: { id: 'qa-owner' },
  };

  const response = await routePayroll(
    new Request('https://staffportal.test/api/payroll/runs?companyId=company-a'),
    { DB },
    context,
  );
  assert.equal(response.status, 200, 'run list succeeds against canonical D1 payroll column names');
  const payload = await response.json();
  assert.deepEqual(payload.runs, [{
    id: 'run-a',
    runNo: 'QA-RUN-A',
    periodStart: '2026-10-01',
    periodEnd: '2026-10-31',
    payDate: '2026-11-05',
    status: 'draft',
    totalGrossKobo: 12345,
    totalDeductionsKobo: 2345,
    totalNetKobo: 10000,
    createdAt: '2026-10-23T06:00:00.000Z',
  }], 'response maps canonical D1 totals and stays within the requested company');

  console.log('PASS: Payroll run list uses canonical D1 totals and enforces company scope');
} finally {
  database.close();
}
