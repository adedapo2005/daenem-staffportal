import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../worker/bakery-accountability.ts', import.meta.url), 'utf8');
const executable = source.replace(
  "import { hasPermission, type AuthEnv, type SessionContext } from './auth';",
  "const hasPermission=(context,code,minimum='view',companyId)=>{const levels=['none','view','create','edit','approve','manage'];const level=companyId?(context.companyPermissions?.[companyId]?.[code]||'none'):(context.permissions?.[code]||'none');return levels.indexOf(level)>=levels.indexOf(minimum)};"
);
const compiled = ts.transpileModule(executable, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { routeBakeryAccountability } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const prepared = [];
const env = {
  DB: {
    prepare(sql) {
      return {
        sql,
        args: [],
        bind(...args) { this.args = args; prepared.push(this); return this; },
        first: async () => ({ id: 'exception-a', status: 'investigating', resolvedBy: null }),
        run: async () => ({ success: true })
      };
    },
    batch: async statements => { env.batchStatements = statements; return []; }
  }
};
const context = {
  employee: { id: 'employee-a' },
  companies: [{ id: 'company-bakery' }],
  companyPermissions: { 'company-bakery': { 'bakery.investigation': 'edit' } },
  roles: []
};
const response = await routeBakeryAccountability(new Request('https://staffportal.test/api/bakery/accountability/investigations', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-request-id': 'investigation-request-42' },
  body: JSON.stringify({ exceptionId: 'exception-a', action: 'resolve', note: 'Reviewed the dispatch evidence.' })
}), env, context);

assert.equal(response.status, 200, 'authorized investigation action succeeds');
const audit = env.batchStatements.at(-1);
assert.match(audit.sql, /after_json,source,request_id/);
assert.equal(audit.args.at(-1), 'investigation-request-42', 'formal investigation audit preserves inbound request correlation');
assert.equal(audit.args[3], 'investigation_resolve', 'audit identifies the investigation action');
assert.equal(audit.args[4], 'exception-a', 'audit remains bound to the exception');
assert.equal(audit.args[2], 'company-bakery', 'audit remains company-scoped');
console.log('Bakery investigation request correlation: 5/5 assertions PASS');
