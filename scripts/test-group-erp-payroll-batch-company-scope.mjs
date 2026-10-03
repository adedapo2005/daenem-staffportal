import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../worker/group-erp.ts', import.meta.url), 'utf8');
const check = (name, condition) => {
  if (!condition) throw new Error(`FAIL ${name}`);
  console.log(`PASS ${name}`);
};

const executable = source.replace(
  "import { hasPermission, type AuthEnv, type SessionContext } from './auth';",
  "const hasPermission=(context,code,minimum='view',companyId)=>{const levels=['none','view','create','edit','approve','manage'];const level=companyId?(context.companyPermissions?.[companyId]?.[code]||'none'):(context.permissions?.[code]||'none');return levels.indexOf(level)>=levels.indexOf(minimum)};"
).replace(
  "import { previewAuditRetention } from './audit-retention';",
  "const previewAuditRetention=async()=>new Response('{}');"
);
const compiled = ts.transpileModule(executable, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { routeGroupErp } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function fixture({ owner = false, companyAPayroll = 'none', companyBPayroll = 'none', failRequiredAudit = false, payrollRunStatus = 'approved' } = {}) {
  const calls = [], writes = [], auditAttempts = [];
  const context = {
    roles: owner ? [{ code: 'owner' }] : [{ code: 'employee' }],
    companies: [{ id: 'company-a' }, { id: 'company-b' }],
    companyPermissions: {
      'company-a': { 'payroll.access': companyAPayroll },
      'company-b': { 'payroll.access': companyBPayroll }
    },
    permissions: { 'payroll.access': 'manage' },
    employee: { id: 'actor' },
    sessionId: 'session'
  };
  const visible = (sql, args, companyId, offset = 1) => !sql.includes('pb.company_id IN') || args.slice(offset).includes(companyId);
  const DB = {
    prepare(sql) {
      return {
        bind(...args) {
          calls.push({ sql, args });
          return {
            first: async () => sql.includes('FROM payroll_payment_batches pb') && visible(sql, args, 'company-b')
              ? { id: 'batch-b', company_id: 'company-b', batch_no: 'BATCH-B', adapter: 'manual' }
              : sql.includes('FROM payroll_runs') ? { id: 'run-b', companyId: 'company-b', runNo: 'RUN-1', status: payrollRunStatus, totalNetKobo: 2500 }
              : sql.includes('FROM payroll_banks') ? { bankKey: 'BANK-X', name: 'Bank X', adapter: 'csv', directApiAvailable: 0 }
              : null,
            all: async () => sql.includes('FROM payroll_payment_batches pb')
              ? { results: ['company-a', 'company-b'].filter(id => visible(sql, args, id, 2)).map(id => ({ id: `batch-${id.slice(-1)}`, companyId: id })) }
              : { results: [] },
            run: async () => {
              if (sql.includes('INSERT INTO audit_logs')) {
                auditAttempts.push({ sql, args });
                if (failRequiredAudit) throw new Error('forced audit insert failure');
              }
              writes.push({ sql, args });
              return { success: true };
            }
          };
        }
      };
    },
    async batch(statements) { writes.push(...statements.map(statement => ({ sql: statement.sql, args: statement.args }))); }
  };
  return { context, env: { DB, AUTH_PEPPER: 'test-only-fixture-key' }, calls, writes, auditAttempts };
}

const paidRunDraft = fixture({ companyBPayroll: 'edit', payrollRunStatus: 'paid' });
const paidRunDraftResponse = await routeGroupErp(new Request('https://staffportal.test/api/payroll/payment-batches', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ payrollRunId: 'run-b', fundingBankKey: 'BANK-X' })
}), paidRunDraft.env, paidRunDraft.context);
check('duplicate Group ERP path rejects a paid run before draft writes', paidRunDraftResponse.status === 409 && paidRunDraft.writes.length === 0);
const noPayroll = fixture();
const noPayrollResponse = await routeGroupErp(new Request('https://staffportal.test/api/payroll/payment-batches'), noPayroll.env, noPayroll.context);
check('payment-batch list with no company Payroll permission returns an empty neutral result', noPayrollResponse.status === 200 && (await noPayrollResponse.json()).batches.length === 0);
check('payment-batch list with no company Payroll permission performs no query', noPayroll.calls.length === 0);

const companyAOnly = fixture({ companyAPayroll: 'view' });
const companyAListResponse = await routeGroupErp(new Request('https://staffportal.test/api/payroll/payment-batches'), companyAOnly.env, companyAOnly.context);
const companyAList = await companyAListResponse.json();
check('payment-batch list scopes SQL to companies with target-company Payroll view', companyAListResponse.status === 200 && companyAOnly.calls.length === 1 && companyAOnly.calls[0].sql.includes('pb.company_id IN (?)') && companyAOnly.calls[0].args.includes('company-a'));
check('payment-batch list does not return Company B when only Company A view is granted', companyAList.batches.every(batch => batch.companyId === 'company-a'));

const unauthorizedExport = fixture({ companyAPayroll: 'edit' });
const unauthorizedExportResponse = await routeGroupErp(new Request('https://staffportal.test/api/payroll/payment-batches/export?id=batch-b'), unauthorizedExport.env, unauthorizedExport.context);
check('cross-company batch export is neutrally denied', unauthorizedExportResponse.status === 404 && (await unauthorizedExportResponse.json()).error === 'Payment batch not found.');
check('cross-company export lookup is SQL-scoped and reads no batch items or audit data', unauthorizedExport.calls.length === 1 && unauthorizedExport.calls[0].sql.includes('pb.company_id IN (?)') && unauthorizedExport.calls[0].args.includes('company-a') && unauthorizedExport.writes.length === 0);

const authorizedExport = fixture({ companyBPayroll: 'edit' });
const authorizedExportResponse = await routeGroupErp(new Request('https://staffportal.test/api/payroll/payment-batches/export?id=batch-b'), authorizedExport.env, authorizedExport.context);
const authorizedCsv = await authorizedExportResponse.text();
check('Company B Payroll editor can export Company B draft', authorizedExportResponse.status === 200 && authorizedCsv.includes('Employee,Bank,Account Name'));
check('authorized export binds Company B at batch lookup and persists formal audit before CSV response', authorizedExport.calls[0].args.includes('company-b') && authorizedExport.auditAttempts.length === 1 && authorizedExport.writes.length >= 1 && authorizedExport.writes.at(-1).sql.includes('INSERT INTO audit_logs'));

const auditFailureExport = fixture({ companyBPayroll: 'edit', failRequiredAudit: true });
const auditFailureResponse = await routeGroupErp(new Request('https://staffportal.test/api/payroll/payment-batches/export?id=batch-b'), auditFailureExport.env, auditFailureExport.context);
const auditFailureBody = await auditFailureResponse.text();
check('required export-audit failure returns bounded 503', auditFailureResponse.status === 503 && auditFailureBody.includes('temporarily unavailable'));
check('required export-audit failure discloses no CSV content and performs no provider or money movement', !auditFailureBody.includes('Employee,Bank,Account Name') && auditFailureExport.auditAttempts.length === 1 && auditFailureExport.writes.length === 0);

const ownerList = fixture({ owner: true });
const ownerListResponse = await routeGroupErp(new Request('https://staffportal.test/api/payroll/payment-batches'), ownerList.env, ownerList.context);
check('Owner retains group-wide payment-batch list authority', ownerListResponse.status === 200 && ownerList.calls.length === 1 && !ownerList.calls[0].sql.includes('pb.company_id IN'));

const ownerExport = fixture({ owner: true });
const ownerExportResponse = await routeGroupErp(new Request('https://staffportal.test/api/payroll/payment-batches/export?id=batch-b'), ownerExport.env, ownerExport.context);
check('Owner retains group-wide payment-batch export authority', ownerExportResponse.status === 200 && !ownerExport.calls[0].sql.includes('pb.company_id IN'));
