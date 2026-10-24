import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../worker/payroll.ts', import.meta.url), 'utf8');
const canonicalMigration = await readFile(new URL('../migrations/0001_core.sql', import.meta.url), 'utf8');
const payrollRunsSql = canonicalMigration.match(/CREATE TABLE IF NOT EXISTS payroll_runs \([\s\S]*?\);/)?.[0];
const payrollItemsSql = canonicalMigration.match(/CREATE TABLE IF NOT EXISTS payroll_items \([\s\S]*?\);/)?.[0];
assert.ok(payrollRunsSql && payrollItemsSql, 'read exact Payroll schema from canonical D1 migration');
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
database.exec('PRAGMA foreign_keys=ON');
try {
  database.exec(`
    CREATE TABLE companies (id TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL);
    CREATE TABLE employees (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, employment_status TEXT NOT NULL, employee_no TEXT, job_title TEXT);
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
    -- Actual authoritative schema is extracted from migrations/0001_core.sql,
    -- not re-created from an assumed set of payroll column names.
    ${payrollRunsSql}
    ${payrollItemsSql}
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
    INSERT INTO employees VALUES ('employee-a', 'QA Employee A', 'active', 'QA-001', 'QA Role');
    INSERT INTO employees VALUES ('qa-owner', 'QA Owner', 'active', 'OWNER-001', 'Owner');
    INSERT INTO employee_company_memberships VALUES ('membership-a', 'employee-a', 'company-a', 1);
    INSERT INTO employee_compensation VALUES
      ('employee-a', 'company-a', 100000, 10000, 5000, 1, '2026-01-01', NULL);
    INSERT INTO attendance_days VALUES ('employee-a', 'company-a', '2026-10-01', 'present');
    INSERT INTO payroll_runs (
      id, company_id, period_start, period_end, pay_date, status, currency,
      gross_total_kobo, deduction_total_kobo, net_total_kobo, prepared_by
    ) VALUES (
      'run-b', 'company-b', '2026-10-01', '2026-10-31', '2026-11-05',
      'draft', 'NGN', 90000, 10000, 80000, 'qa-owner'
    );
  `);

  const liveRunColumns = database.prepare('PRAGMA table_info(payroll_runs)').all().map((row) => row.name);
  assert.equal(liveRunColumns.includes('run_no'), false, 'real staging D1 has no run_no column');
  assert.equal(liveRunColumns.includes('notes'), false, 'real staging D1 has no notes column');
  assert.equal(liveRunColumns.includes('created_by'), false, 'real staging D1 has no created_by column');
  assert.equal(liveRunColumns.includes('prepared_by'), true, 'real staging D1 requires prepared_by');

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
  assert.match(created.run.runNo, /^PAY-202610-[A-Z0-9]{16}$/);
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
  assert.equal(database.prepare('SELECT prepared_by FROM payroll_runs WHERE id=?').get(created.run.id).prepared_by,
    'qa-owner', 'staging-required payroll preparer is persisted');
  assert.match(database.prepare('SELECT note FROM payroll_approval_events WHERE payroll_run_id=?')
    .get(created.run.id).note, /Synthetic schema regression fixture/, 'optional draft notes are retained in approval history');

  const listResponse = await routePayroll(
    new Request('https://staffportal.test/api/payroll/runs?companyId=company-a'),
    { DB },
    context,
  );
  assert.equal(listResponse.status, 200, 'run list reads canonical D1 total columns');
  const listed = await listResponse.json();
  assert.equal(listed.runs.length, 1, 'run list stays within the requested company');
  assert.equal(listed.runs[0].id, created.run.id);
  assert.equal(listed.runs[0].runNo, created.run.runNo, 'run reference is stable across creation and retrieval');
  assert.equal(listed.runs[0].totalGrossKobo, 110000);
  assert.equal(listed.runs[0].totalDeductionsKobo, 5000);
  assert.equal(listed.runs[0].totalNetKobo, 105000);

  const ownerCompanyB = await routePayroll(
    new Request('https://staffportal.test/api/payroll/runs?companyId=company-b'),
    { DB }, context,
  );
  assert.equal(ownerCompanyB.status, 200);
  const otherCompany = await ownerCompanyB.json();
  assert.deepEqual(otherCompany.runs.map((run) => run.id), ['run-b']);
  assert.ok(otherCompany.runs[0].runNo.startsWith('PAY-202610-'));

  const employeeContext = {
    ...context, roles: [{ code: 'employee' }], companies: [{ id: 'company-a' }],
    permissions: { 'payroll.access': 'view' }, employee: { id: 'qa-staff' },
  };
  const deniedRead = await routePayroll(
    new Request('https://staffportal.test/api/payroll/runs?companyId=company-b'),
    { DB }, employeeContext,
  );
  assert.equal(deniedRead.status, 403, 'foreign-company payroll list is denied');
  const deniedDraft = await routePayroll(
    new Request('https://staffportal.test/api/payroll/runs/draft', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ companyId: 'company-b', periodStart: '2026-11-01', periodEnd: '2026-11-30', payDate: '2026-12-05' }),
    }),
    { DB }, employeeContext,
  );
  assert.equal(deniedDraft.status, 403, 'foreign-company payroll draft is denied');
  const duplicateDraft = await routePayroll(
    new Request('https://staffportal.test/api/payroll/runs/draft', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ companyId: 'company-a', periodStart: '2026-10-01', periodEnd: '2026-10-31', payDate: '2026-11-05' }),
    }),
    { DB }, context,
  );
  assert.equal(duplicateDraft.status, 409, 'duplicate active company/period is rejected');

  const detailResponse = await routePayroll(
    new Request('https://staffportal.test/api/payroll/run?id=' + encodeURIComponent(created.run.id)),
    { DB }, context,
  );
  assert.equal(detailResponse.status, 200);
  const detail = await detailResponse.json();
  assert.equal(detail.run.run_no, created.run.runNo, 'detail preserves readable display reference');

  database.exec("CREATE TRIGGER payroll_test_abort BEFORE INSERT ON payroll_items BEGIN SELECT RAISE(ABORT,'synthetic item failure'); END;");
  try {
    await assert.rejects(
      () => routePayroll(new Request('https://staffportal.test/api/payroll/runs/draft', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          companyId: 'company-a', periodStart: '2026-11-01', periodEnd: '2026-11-30',
          payDate: '2026-12-05',
        }),
      }), { DB }, context),
      /synthetic item failure/,
      'payroll item failure must not commit a partial run',
    );
  } finally {
    database.exec('DROP TRIGGER payroll_test_abort');
  }
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM payroll_runs WHERE company_id='company-a' AND period_start='2026-11-01'").get().count, 0, 'failed draft fully rolls back');
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM payroll_approval_events').get().count, 1, 'failed draft adds no approval history');
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM audit_logs').get().count, 1, 'failed draft adds no audit event');

  console.log('PASS: Payroll D1 schema, stable references, notes, company isolation, duplicate denial, and atomic rollback');
} finally {
  database.close();
}
