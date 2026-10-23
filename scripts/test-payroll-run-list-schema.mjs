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
  throw new Error('Unexpected payroll dependency: ' + specifier);
};
new Function('require', 'module', 'exports', compiled)(mockRequire, module, module.exports);
const { routePayroll } = module.exports;

const database = new DatabaseSync(':memory:');
try {
  database.exec(`
    CREATE TABLE companies (id TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL);
    CREATE TABLE employees (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, employment_status TEXT NOT NULL);
    CREATE TABLE employee_company_memberships (
      id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, company_id TEXT NOT NULL, active INTEGER NOT NULL
    );
    CREATE TABLE employee_compensation (
      employee_id TEXT NOT NULL, company_id TEXT NOT NULL, base_salary_kobo INTEGER NOT NULL,
      recurring_allowances_kobo INTEGER NOT NULL, recurring_deductions_kobo INTEGER NOT NULL,
      active INTEGER NOT NULL, effective_from TEXT NOT NULL, effective_to TEXT
    );
    CREATE TABLE attendance_days (
      employee_id TEXT NOT NULL, company_id TEXT NOT NULL, work_date TEXT NOT NULL, status TEXT NOT NULL
    );
    CREATE TABLE payroll_adjustments (
      id TEXT PRIMARY KEY, employee_id TEXT NOT NULL, company_id TEXT NOT NULL, period_key TEXT NOT NULL,
      adjustment_type TEXT NOT NULL, description TEXT NOT NULL, amount_kobo INTEGER NOT NULL,
      status TEXT NOT NULL, payroll_run_id TEXT, updated_at TEXT
    );
    CREATE TABLE payroll_runs (
      id TEXT PRIMARY KEY, company_id TEXT NOT NULL, run_no TEXT NOT NULL, period_start TEXT NOT NULL,
      period_end TEXT NOT NULL, pay_date TEXT, status TEXT NOT NULL, currency TEXT NOT NULL,
      notes TEXT, created_by TEXT, gross_total_kobo INTEGER NOT NULL DEFAULT 0,
      deduction_total_kobo INTEGER NOT NULL DEFAULT 0, net_total_kobo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE payroll_items (
      id TEXT PRIMARY KEY, payroll_run_id TEXT NOT NULL, employee_id TEXT NOT NULL,
      base_kobo INTEGER NOT NULL, allowance_kobo INTEGER NOT NULL, overtime_kobo INTEGER NOT NULL,
      bonus_kobo INTEGER NOT NULL, commission_kobo INTEGER NOT NULL, deduction_kobo INTEGER NOT NULL,
      statutory_kobo INTEGER NOT NULL, gross_kobo INTEGER NOT NULL, net_kobo INTEGER NOT NULL,
      attendance_days_counted INTEGER NOT NULL, calculation_json TEXT
    );
    CREATE TABLE payroll_item_breakdown (
      id TEXT PRIMARY KEY, payroll_item_id TEXT NOT NULL, line_type TEXT NOT NULL,
      description TEXT NOT NULL, amount_kobo INTEGER NOT NULL, source_type TEXT NOT NULL
    );
    CREATE TABLE payroll_approval_events (
      id TEXT PRIMARY KEY, payroll_run_id TEXT NOT NULL, from_status TEXT, to_status TEXT NOT NULL,
      actor_employee_id TEXT NOT NULL, note TEXT
    );
    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY, actor_employee_id TEXT NOT NULL, company_id TEXT NOT NULL,
      module TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
      after_json TEXT NOT NULL, source TEXT NOT NULL
    );
    INSERT INTO companies VALUES ('company-a', 'QA-A', 'QA Company A');
    INSERT INTO companies VALUES ('company-b', 'QA-B', 'QA Company B');
    INSERT INTO employees VALUES ('employee-a', 'QA Employee A', 'active');
    INSERT INTO employee_company_memberships VALUES ('membership-a', 'employee-a', 'company-a', 1);
    INSERT INTO employee_compensation VALUES
      ('employee-a', 'company-a', 100000, 10000, 5000, 1, '2026-01-01', NULL);
    INSERT INTO attendance_days VALUES ('employee-a', 'company-a', '2026-10-01', 'present');
    INSERT INTO payroll_runs (
      id, company_id, run_no, period_start, period_end, pay_date, status, currency,
      gross_total_kobo, deduction_total_kobo, net_total_kobo
    ) VALUES (
      'run-b', 'company-b', 'QA-RUN-B', '2026-10-01', '2026-10-31', '2026-11-05',
      'draft', 'NGN', 90000, 10000, 80000
    );
  `);

  const DB = {
    prepare(sql) {
      let parameters = [];
      const statement = {
        bind(...values) { parameters = values; return statement; },
        first() { return Promise.resolve(database.prepare(sql).get(...parameters) || null); },
        all() { return Promise.resolve({ results: database.prepare(sql).all(...parameters) }); },
        run() {
          const result = database.prepare(sql).run(...parameters);
          return Promise.resolve({ success: true, results: [], meta: { changes: Number(result.changes) } });
        },
      };
      return statement;
    },
    async batch(statements) {
      database.exec('BEGIN IMMEDIATE');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        database.exec('COMMIT');
        return results;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  };
  const context = {
    roles: [{ code: 'owner' }],
    companies: [{ id: 'company-a' }, { id: 'company-b' }],
    permissions: { 'payroll.access': 'manage' },
    employee: { id: 'qa-owner' },
  };

  const createResponse = await routePayroll(
    new Request('https://staffportal.test/api/payroll/runs/draft', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        companyId: 'company-a',
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        payDate: '2026-11-05',
        notes: 'Synthetic schema regression fixture',
      }),
    }),
    { DB },
    context,
  );
  assert.equal(createResponse.status, 201, 'draft creation completes against canonical D1 total columns');
  const created = await createResponse.json();
  assert.equal(created.run.employeeCount, 1);
  assert.equal(created.run.totalGrossKobo, 110000);
  assert.equal(created.run.totalDeductionsKobo, 5000);
  assert.equal(created.run.totalNetKobo, 105000);

  const storedTotals = database.prepare(
    'SELECT gross_total_kobo, deduction_total_kobo, net_total_kobo FROM payroll_runs WHERE id=?',
  ).get(created.run.id);
  assert.deepEqual({ ...storedTotals }, {
    gross_total_kobo: 110000,
    deduction_total_kobo: 5000,
    net_total_kobo: 105000,
  }, 'draft totals persist in the canonical D1 columns');
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM payroll_items WHERE payroll_run_id=?')
    .get(created.run.id).count, 1, 'draft item is committed atomically with its run');

  const listResponse = await routePayroll(
    new Request('https://staffportal.test/api/payroll/runs?companyId=company-a'),
    { DB },
    context,
  );
  assert.equal(listResponse.status, 200, 'run list reads canonical D1 total columns');
  const listed = await listResponse.json();
  assert.equal(listed.runs.length, 1, 'run list stays within the requested company');
  assert.equal(listed.runs[0].id, created.run.id);
  assert.equal(listed.runs[0].totalGrossKobo, 110000);
  assert.equal(listed.runs[0].totalDeductionsKobo, 5000);
  assert.equal(listed.runs[0].totalNetKobo, 105000);

  console.log('PASS: Payroll draft creation and run listing use canonical D1 totals with company scoping');
} finally {
  database.close();
}
