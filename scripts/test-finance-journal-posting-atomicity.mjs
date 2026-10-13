import fs from 'node:fs';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const source = fs.readFileSync('worker/finance.ts', 'utf8');
const executableSource = source
  .replace("import { hasPermission,type AuthEnv,type SessionContext } from './auth';", 'const hasPermission = () => true;');
assert.notEqual(executableSource, source, 'runtime fixture replaces only the authorization dependency');
const { outputText } = ts.transpileModule(executableSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { routeFinance } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

function fixture({ periodStatus = 'open', periodCompanyId = 'company-a', companyId = 'company-a', race = false, auditFailure = false, auditIgnored = false, staleAudit = false } = {}) {
  const state = { status: 'draft', periodStatus, updateCount: 0, auditCount: staleAudit ? 1 : 0, currentAuditCount: 0, batchCount: 0 };
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
      assert.match(invariant.sql, /json_extract\(CASE WHEN NOT EXISTS\([\s\S]*journal_entries[\s\S]*status='posted'[\s\S]*approved_by=\?[\s\S]*OR NOT EXISTS\([\s\S]*audit_logs WHERE id=\?[\s\S]*actor_employee_id=\?[\s\S]*company_id=\?[\s\S]*action='post_journal'[\s\S]*entity_id=\?[\s\S]*source='web'[\s\S]*THEN '\{' ELSE '\{\}' END,'\$'\)/);
      assert.equal(invariant.params[3], audit.params[0], 'rollback invariant is bound to this operation audit id');
      assert.equal(invariant.params[4], audit.params[1], 'current audit actor must match the posting actor');
      assert.equal(invariant.params[5], audit.params[2], 'current audit company must match the journal company');
      assert.equal(invariant.params[6], audit.params[3], 'current audit entity must match the posted journal');
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
      state.currentAuditCount += auditChanges;
      if (state.status === 'posted' && state.currentAuditCount !== 1) {
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

const ignoredAuditWithStaleMatch = fixture({ auditIgnored: true, staleAudit: true });
const staleAuditResponse = await routeFinance(ignoredAuditWithStaleMatch.request(), ignoredAuditWithStaleMatch.env, ignoredAuditWithStaleMatch.context);
assert.equal(staleAuditResponse.status, 503, 'a stale matching audit cannot satisfy the current posting audit invariant');
assert.equal(ignoredAuditWithStaleMatch.state.status, 'draft', 'a stale audit cannot let a new posting commit');
assert.equal(ignoredAuditWithStaleMatch.state.updateCount, 0);
assert.equal(ignoredAuditWithStaleMatch.state.auditCount, 1, 'the unrelated preexisting audit remains unchanged');
assert.equal(ignoredAuditWithStaleMatch.state.currentAuditCount, 0, 'the failed posting creates no current success audit');

function sqliteRouteFixture({ auditIgnored = false, staleAudit = false } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE fiscal_periods(id TEXT PRIMARY KEY,company_id TEXT,start_date TEXT,end_date TEXT,status TEXT);
    CREATE TABLE journal_entries(id TEXT PRIMARY KEY,company_id TEXT,fiscal_period_id TEXT,entry_date TEXT,status TEXT,approved_by TEXT,approved_at TEXT,posted_at TEXT,updated_at TEXT);
    CREATE TABLE journal_lines(journal_entry_id TEXT,debit_kobo INTEGER,credit_kobo INTEGER);
    CREATE TABLE audit_logs(id TEXT PRIMARY KEY,actor_employee_id TEXT,company_id TEXT,module TEXT,action TEXT,entity_type TEXT,entity_id TEXT,after_json TEXT,source TEXT);
    INSERT INTO fiscal_periods VALUES('period-a','company-a','2026-10-01','2026-10-31','open');
    INSERT INTO journal_entries(id,company_id,fiscal_period_id,entry_date,status) VALUES('journal-a','company-a','period-a','2026-10-10','draft');
    INSERT INTO journal_lines VALUES('journal-a',10000,10000);
  `);
  if (staleAudit) db.prepare(`INSERT INTO audit_logs VALUES('old-audit','employee-a','company-a','finance','post_journal','journal_entry','journal-a','{}','web')`).run();
  if (auditIgnored) db.exec(`CREATE TRIGGER ignore_post_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(IGNORE); END;`);
  const env = { DB: {
    prepare(sql) {
      const bound = { sql, params: [], bind(...params) { this.params = params; return this; },
        async first() { return db.prepare(sql).get(...bound.params); } };
      return bound;
    },
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const results = statements.map(({ sql, params }) => {
          const result = db.prepare(sql).run(...params);
          return { meta: { changes: Number(result.changes) } };
        });
        db.exec('COMMIT');
        return results;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  } };
  const context = { employee: { id: 'employee-a' }, roles: [], companies: [{ id: 'company-a' }] };
  const request = () => new Request('https://staffportal.test/api/finance/journals/post', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'journal-a' }),
  });
  return { db, env, context, request };
}

const sqliteSuccess = sqliteRouteFixture();
const sqliteSuccessResponse = await routeFinance(sqliteSuccess.request(), sqliteSuccess.env, sqliteSuccess.context);
assert.equal(sqliteSuccessResponse.status, 200, 'actual extracted posting SQL commits with its exact success audit');
assert.equal(sqliteSuccess.db.prepare(`SELECT status FROM journal_entries WHERE id='journal-a'`).get().status, 'posted');
assert.equal(sqliteSuccess.db.prepare(`SELECT COUNT(*) AS count FROM audit_logs WHERE id!='old-audit'`).get().count, 1);
assert.equal((await routeFinance(sqliteSuccess.request(), sqliteSuccess.env, sqliteSuccess.context)).status, 409, 'actual SQLite posting replay is denied');

for (const staleAudit of [false, true]) {
  const sqliteFailure = sqliteRouteFixture({ auditIgnored: true, staleAudit });
  const response = await routeFinance(sqliteFailure.request(), sqliteFailure.env, sqliteFailure.context);
  assert.equal(response.status, 503, `ignored audit rolls back with staleAudit=${staleAudit}`);
  assert.equal(sqliteFailure.db.prepare(`SELECT status FROM journal_entries WHERE id='journal-a'`).get().status, 'draft');
  assert.equal(sqliteFailure.db.prepare(`SELECT COUNT(*) AS count FROM audit_logs`).get().count, staleAudit ? 1 : 0);
}

console.log('PASS: Finance journal posting atomicity: source-derived SQLite success/replay, stale-audit rollback, open period, company scope, and one-winner CAS');
