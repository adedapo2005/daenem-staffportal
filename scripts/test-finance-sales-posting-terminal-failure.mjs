import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const db = new DatabaseSync(':memory:');
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE companies(id TEXT PRIMARY KEY);
  CREATE TABLE journal_entries(id TEXT PRIMARY KEY);
  CREATE TABLE finance_receivables(id TEXT PRIMARY KEY);
  CREATE TABLE sales_orders(id TEXT PRIMARY KEY, company_id TEXT NOT NULL, total_kobo INTEGER NOT NULL);
  INSERT INTO companies(id) VALUES ('company-a');
  INSERT INTO sales_orders(id, company_id, total_kobo) VALUES ('sale-a', 'company-a', 12500);
`);
db.exec(fs.readFileSync('migrations/0029_finance_sales_autopost.sql', 'utf8'));

const source = fs.readFileSync('worker/finance-sales-autopost.ts', 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { recordFailure } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const env = {
  DB: {
    prepare(sql) {
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        first() { return db.prepare(sql).get(...params) ?? null; },
        run() {
          const result = db.prepare(sql).run(...params);
          return { meta: { changes: Number(result.changes) } };
        },
      };
    },
  },
};

await recordFailure(env, 'sale-a', 'initial transient error');
const failure = db.prepare(`SELECT status,error_text FROM finance_source_postings WHERE source_id='sale-a'`).get();
assert.equal(failure.status, 'failed');
assert.equal(failure.error_text, 'initial transient error');

db.prepare(`UPDATE finance_source_postings SET status='posted',error_text=NULL,posted_amount_kobo=12500 WHERE source_id='sale-a'`).run();
await recordFailure(env, 'sale-a', 'late stale failure');
const posted = db.prepare(`SELECT status,error_text,posted_amount_kobo FROM finance_source_postings WHERE source_id='sale-a'`).get();
assert.equal(posted.status, 'posted');
assert.equal(posted.error_text, null);
assert.equal(posted.posted_amount_kobo, 12500);

console.log('PASS: initial failures persist and a late stale failure cannot downgrade a posted receipt');
db.close();
