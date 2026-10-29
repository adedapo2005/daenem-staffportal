import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = new URL('../worker/spend.ts', import.meta.url);
const sourceText = await readFile(source, 'utf8');
const sourceFile = ts.createSourceFile(source.pathname, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
let bootstrapNode;
let routeSpendNode;
const visit = (node) => {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'bootstrap') bootstrapNode = node;
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'routeSpend') routeSpendNode = node;
  ts.forEachChild(node, visit);
};
visit(sourceFile);
assert.ok(bootstrapNode, 'The actual Spend bootstrap implementation must exist');
assert.ok(routeSpendNode, 'The actual Spend route dispatcher must exist');
const compiled = ts.transpileModule(`${bootstrapNode.getText(sourceFile)}\n${routeSpendNode.getText(sourceFile)}\nmodule.exports = { routeSpend };`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const module = { exports: {} };
const sandbox = {
  module, exports: module.exports, URL, Response, Date, JSON, Promise, Map, Set,
  safeText(value, max) { return String(value || '').trim().slice(0, max); },
  companyInScope(context, companyId) { return context.companies.some((company) => company.id === companyId); },
  error(message, status) { return new Response(JSON.stringify({ error: message }), { status, headers: { 'content-type': 'application/json' } }); },
};
vm.runInNewContext(compiled.outputText, sandbox);
const { routeSpend } = module.exports;

const unavailableDb = new Proxy({}, {
  get(_target, property) {
    throw new Error(`Bootstrap accessed D1 before company scope was supplied: ${String(property)}`);
  },
});
const env = { DB: unavailableDb };
const cases = [
  { name: 'single-company Owner', roles: ['owner'], companies: [{ id: 'company-printing', primary: true }] },
  { name: 'multi-company Owner', roles: ['owner'], companies: [{ id: 'company-printing', primary: true }, { id: 'company-bakery' }] },
  { name: 'single-company employee', roles: ['employee'], companies: [{ id: 'company-printing', primary: true }] },
];

for (const testCase of cases) {
  const response = await routeSpend(
    new Request('https://staffportal.invalid/api/spend/bootstrap'),
    env,
    { employee: { id: 'synthetic-employee' }, roles: testCase.roles.map((code) => ({ code })), companies: testCase.companies },
  );
  assert.equal(response?.status, 400, `${testCase.name} must not inherit a default company`);
  assert.deepEqual(await response.json(), { error: 'Company scope is required.' });
}

const foreignResponse = await routeSpend(
  new Request('https://staffportal.invalid/api/spend/bootstrap?companyId=company-bakery'),
  env,
  { employee: { id: 'printing-only-owner' }, roles: [{ code: 'owner' }], companies: [{ id: 'company-printing', primary: true }] },
);
assert.equal(foreignResponse?.status, 403, 'An explicit foreign company remains denied');
assert.deepEqual(await foreignResponse.json(), { error: 'Company access is not assigned.' });
assert.match(sourceText, /const companyId = safeText\(url\.searchParams\.get\('companyId'\), 160\);\s*if \(!companyId\) return error\('Company scope is required\.', 400\);/);

console.log('PASS: 3 actual Worker bootstrap-route requests require explicit company scope; explicit foreign company remains denied; D1 was not consulted on denied requests.');
