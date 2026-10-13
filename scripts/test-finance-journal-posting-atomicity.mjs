import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = fs.readFileSync('worker/finance.ts', 'utf8');
const executableSource = source
  .replace("import { hasPermission,type AuthEnv,type SessionContext } from './auth';", 'const hasPermission = () => true;');
assert.notEqual(executableSource, source, 'runtime fixture replaces only the authorization dependency');
const { outputText } = ts.transpileModule(executableSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { routeFinance } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

function fixture({ periodStatus = 'open', periodCompanyId = 'company-a', companyId = 'company-a', race = false, auditFailure = false, auditIgnored = false } = {}) {
  const state = { status: 'draft', periodStatus, updateCount: 0, auditCount: 0, batchCount: 0 };
  const readers = [];
  const env = { DB: {
    prepare(sql) {
      return {
        sql,
        params: [],
        bind(...params) { this.params = params; return this; },
        async first() {
          if (sql.includes('FROM journal_entries e LEFT JOIN fiscal_periods')) {
            const snapshot = {
              id: 'journal-a', companyId, fiscalPeriodId: periodStatus == null ? null : 'period-a',
              entryDate: '2026-10-10', status: state.status, periodCompanyId,
              periodStartDate: '2026-10-01', periodEndDate: '2026-10-31', periodStatus: state.periodStatus,
            };
            if (race && readers.length < 2) await new Promise(resolve => {
              readers.push(resolve);
              if (readers.length === 2) readers.forEach(unblock => unblock());
            });
            return snapshot;
          }
          if (sql.includes('FROM journal_lines')) return { debitKobo: 10000, creditKobo: 10000 };
          throw new Error(`Unexpected SELECT: ${sql}`);
        },
      };
    },
    async batch(statements) {
      state.batchCount++;
      const before = structuredClone(state);
      const [update, audit, invariant] = statements;
      assert.match(update.sql, /company_id=\? AND status='draft' AND fiscal_period_id=\?/);
      assert.match(update.sql, /fiscal_periods WHERE id=\? AND company_id=\? AND status='open'/);
      assert.match(audit.sql, /WHERE changes\(\)=1/);
      assert.match(invariant.sql, /json_extract\(CASE WHEN NOT EXISTS\([\s\S]*journal_entries[\s\S]*status='posted'[\s\S]*OR EXISTS\([\s\S]*audit_logs[\s\S]*action='post_journal'[\s\S]*THEN '\{\}' ELSE '\{' END,'\$'\)/);
      const wasDraft = state.status === 'draft';
      const periodOpen = state.periodStatus === 'open' && periodCompanyId === companyId;
      const updateChanges = wasDraft && periodOpen ? 1 : 0;
      if (updateChanges) { state.status = 'posted'; state.updateCount++; }
      if (auditFailure && updateChanges) {
        Object.assign(state, before);
        throw new Error('forced audit insert failure');
      }
      const auditChanges = auditIgnored ? 0 : updateChanges;
      state.auditCount += auditChanges;
      if (state.status === 'posted' && state.auditCount === 0) {
        Object.assign(state, before);
        throw new Error('required audit invariant failed');
      }
      return [{ meta: { changes: updateChanges } }, { meta: { changes: auditChanges } }];
    },
  } };
  const context = { employee: { id: 'employee-a' }, roles: [], companies: [{ id: 'company-a' }] };
  const request = () => new Request('https://staffportal.test/api/finance/journals/post', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'journal-a' }),
  });
  return { env, context, request, state };
}

const positive = fixture();
const posted = await routeFinance(positive.request(), positive.env, positive.context);
assert.equal(posted.status, 200, 'authorized journal in an existing open period posts');
assert.equal(positive.state.status, 'posted');
assert.equal(positive.state.updateCount, 1);
assert.equal(positive.state.auditCount, 1, 'success audit is written with the winning post');

for (const periodStatus of [null, 'soft_closed', 'closed']) {
  const blocked = fixture({ periodStatus });
  const response = await routeFinance(blocked.request(), blocked.env, blocked.context);
  assert.equal(response.status, 409, `${periodStatus ?? 'missing'} fiscal period fails closed`);
  assert.equal(blocked.state.status, 'draft');
  assert.equal(blocked.state.batchCount, 0, 'invalid period does not reach writes');
}

const wrongCompanyPeriod = fixture({ periodCompanyId: 'company-b' });
const wrongPeriodResponse = await routeFinance(wrongCompanyPeriod.request(), wrongCompanyPeriod.env, wrongCompanyPeriod.context);
assert.equal(wrongPeriodResponse.status, 409, 'a period belonging to another company cannot authorize posting');
assert.equal(wrongCompanyPeriod.state.batchCount, 0);

const racing = fixture({ race: true });
const responses = await Promise.all([
  routeFinance(racing.request(), racing.env, racing.context),
  routeFinance(racing.request(), racing.env, racing.context),
]);
assert.equal(responses.filter(response => response.status === 200).length, 1, 'exactly one competing post succeeds');
assert.equal(responses.filter(response => response.status === 409).length, 1, 'the stale competing post receives conflict');
assert.equal(racing.state.updateCount, 1);
assert.equal(racing.state.auditCount, 1, 'only the winner creates success audit evidence');

const replay = await routeFinance(racing.request(), racing.env, racing.context);
assert.equal(replay.status, 409, 'replay cannot post an already-posted journal');
assert.equal(racing.state.auditCount, 1, 'replay cannot duplicate success audit evidence');

const crossCompany = fixture({ companyId: 'company-b' });
const denied = await routeFinance(crossCompany.request(), crossCompany.env, crossCompany.context);
assert.equal(denied.status, 404, 'cross-company denial remains neutral');
assert.equal(crossCompany.state.batchCount, 0, 'cross-company denial performs no writes');

const auditFailure = fixture({ auditFailure: true });
assert.equal((await routeFinance(auditFailure.request(), auditFailure.env, auditFailure.context)).status, 503);
assert.equal(auditFailure.state.status, 'draft', 'required audit failure rolls back the journal state');
assert.equal(auditFailure.state.updateCount, 0);
assert.equal(auditFailure.state.auditCount, 0);

const ignoredAudit = fixture({ auditIgnored: true });
const ignoredAuditResponse = await routeFinance(ignoredAudit.request(), ignoredAudit.env, ignoredAudit.context);
assert.equal(ignoredAuditResponse.status, 503, 'a silently ignored required audit fails closed');
assert.equal(ignoredAudit.state.status, 'draft', 'the batch invariant rolls back the successful status update');
assert.equal(ignoredAudit.state.updateCount, 0);
assert.equal(ignoredAudit.state.auditCount, 0);

console.log('PASS: Finance journal posting atomicity: open period, company scope, one-winner CAS, replay, and audit rollback');
