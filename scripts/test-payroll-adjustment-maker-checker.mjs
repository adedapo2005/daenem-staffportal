import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../worker/payroll.ts', import.meta.url), 'utf8');
const executable = source.replace(
  "import { hasPermission, type AuthEnv, type SessionContext } from './auth';",
  "const hasPermission=(context,code,minimum='view',companyId)=>{const levels=['none','view','create','edit','approve','manage'];const level=companyId?(context.companyPermissions?.[companyId]?.[code]||'none'):(context.permissions?.[code]||'none');return levels.indexOf(level)>=levels.indexOf(minimum)};"
);
const compiled = ts.transpileModule(executable, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { routePayroll } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function fixture({ owner = false, permissions = {}, actorId, adjustmentStatus = 'pending', submittedBy = 'employee-1' } = {}) {
  const prepared = [];
  const batches = [];
  const context = {
    roles: owner ? [{ code: 'owner' }] : [{ code: 'employee' }],
    companies: owner ? [] : [{ id: 'company-b' }],
    companyPermissions: permissions,
    permissions: {},
    employee: { id: actorId || (owner ? 'owner-1' : 'employee-1') }
  };
  const DB = {
    prepare(sql) {
      const statement = {
        sql,
        args: [],
        bind(...args) { this.args = args; prepared.push(this); return this; },
        first: async () => sql.includes('FROM payroll_adjustments')
          ? { id: 'adjustment-1', companyId: 'company-b', submittedBy, status: adjustmentStatus }
          : { id: 'active-membership' },
        run: async () => ({ success: true })
      };
      return statement;
    },
    async batch(statements) { batches.push(statements); return statements.map(() => ({ success: true, meta: { changes: 1 } })); }
  };
  return { context, env: { DB }, prepared, batches };
}

function check(name, condition) {
  if (!condition) throw new Error(`FAIL ${name}`);
  console.log(`PASS ${name}`);
}

function request(correlationId = 'payroll-adjustment-test-001') {
  return new Request('https://staffportal.test/api/payroll/adjustments', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': correlationId },
    body: JSON.stringify({
      companyId: 'company-b', employeeId: 'payee-1', periodKey: '2026-10',
      adjustmentType: 'allowance', description: 'Approved shift allowance', amountNaira: 1500, taxable: true
    })
  });
}

function approvalRequest(correlationId = 'payroll-adjustment-approval-001') {
  return new Request('https://staffportal.test/api/payroll/adjustments/approve', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-request-id': correlationId },
    body: JSON.stringify({ adjustmentId: 'adjustment-1' })
  });
}

const wrongCompany = fixture({ permissions: { 'company-a': { 'payroll.access': 'manage' } } });
const wrongCompanyResponse = await routePayroll(request(), wrongCompany.env, wrongCompany.context);
check('authority from Company A cannot create a Company B adjustment', wrongCompanyResponse.status === 403);
check('cross-company denial performs no database calls or writes', wrongCompany.prepared.length === 0 && wrongCompany.batches.length === 0);

const makerChecker = fixture({ permissions: { 'company-b': { 'payroll.access': 'approve' } } });
const makerCheckerResponse = await routePayroll(request('correlation-maker-checker'), makerChecker.env, makerChecker.context);
const makerCheckerBody = await makerCheckerResponse.json();
const [adjustmentInsert, auditInsert] = makerChecker.batches[0] || [];
check('Company B creator with approve permission still submits a pending adjustment', makerCheckerResponse.status === 201 && makerCheckerBody.status === 'pending');
check('non-Owner pending adjustment has no self-approval attribution', adjustmentInsert?.args[8] === 'pending' && adjustmentInsert?.args[10] === null && adjustmentInsert?.args[11] === null);
check('submission and audit evidence commit in one target-company batch', makerChecker.batches.length === 1 && makerChecker.batches[0].length === 2 && adjustmentInsert?.args[2] === 'company-b' && auditInsert?.args[2] === 'company-b');
check('formal audit records maker, submitted status and stable request correlation', auditInsert?.args[3] === 'submit_adjustment' && JSON.parse(auditInsert.args[5]).toStatus === 'pending' && auditInsert.args[6] === 'correlation-maker-checker');

const owner = fixture({ owner: true });
const ownerResponse = await routePayroll(request('correlation-owner'), owner.env, owner.context);
const ownerBody = await ownerResponse.json();
const [ownerAdjustment, ownerAudit] = owner.batches[0] || [];
const ownerAuditAfter = ownerAudit ? JSON.parse(ownerAudit.args[5]) : {};
check('Owner retains group-wide self-approval without company membership', ownerResponse.status === 201 && ownerBody.status === 'approved');
check('Owner self-approval is attributed and explicitly labelled in formal audit', ownerAdjustment?.args[8] === 'approved' && ownerAdjustment.args[10] === 'owner-1' && ownerAudit?.args[3] === 'owner_self_approval' && ownerAuditAfter.reason && ownerAudit.args[6] === 'correlation-owner');

const wrongCompanyApprover = fixture({ permissions: { 'company-a': { 'payroll.access': 'approve' } }, actorId: 'checker-a' });
const wrongCompanyApproval = await routePayroll(approvalRequest(), wrongCompanyApprover.env, wrongCompanyApprover.context);
check('Company A Payroll approver cannot review a Company B adjustment', wrongCompanyApproval.status === 404 && wrongCompanyApprover.batches.length === 0);

const makerCannotCheck = fixture({ permissions: { 'company-b': { 'payroll.access': 'approve' } } });
const makerApproval = await routePayroll(approvalRequest(), makerCannotCheck.env, makerCannotCheck.context);
check('non-Owner maker cannot approve their own pending adjustment', makerApproval.status === 409 && makerCannotCheck.batches.length === 0);

const checker = fixture({ permissions: { 'company-b': { 'payroll.access': 'approve' } }, actorId: 'checker-b' });
const checkerApproval = await routePayroll(approvalRequest('correlation-checker'), checker.env, checker.context);
const [checkerUpdate, checkerAudit] = checker.batches[0] || [];
check('authorized different-company-scope checker can approve pending adjustment', checkerApproval.status === 200 && (await checkerApproval.json()).status === 'approved');
check('checker update and formal audit are atomic and compare-and-set pending state', checker.batches.length === 1 && checkerUpdate?.sql.includes("status='pending'") && checkerUpdate.args[2] === 'adjustment-1' && checkerAudit?.sql.includes('WHERE changes()=1') && checkerAudit.args[2] === 'company-b');
check('checker audit records actor, transition and correlation', checkerAudit?.args[1] === 'checker-b' && checkerAudit.args[3] === 'approve_adjustment' && JSON.parse(checkerAudit.args[5]).fromStatus === 'pending' && JSON.parse(checkerAudit.args[6]).toStatus === 'approved' && checkerAudit.args[7] === 'correlation-checker');

const terminalAdjustment = fixture({ permissions: { 'company-b': { 'payroll.access': 'approve' } }, actorId: 'checker-b', adjustmentStatus: 'approved' });
const terminalApproval = await routePayroll(approvalRequest(), terminalAdjustment.env, terminalAdjustment.context);
check('already-approved adjustment cannot be approved again', terminalApproval.status === 409 && terminalAdjustment.batches.length === 0);

console.log('Payroll adjustment maker/checker runtime assertions passed.');
