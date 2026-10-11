import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync('src/offline-sync.tsx', 'utf8');
const start = source.indexOf('function identityFor(');
const end = source.indexOf('async function requestJson', start);
assert.ok(start >= 0 && end > start, 'Offline scope helpers must exist');
const helpers = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const { identityFor, identitiesFor } = new Function(helpers + '\nreturn { identityFor, identitiesFor };')();
const employee = { id: 'employee-a' };
const companies = [
  { id: 'company-a', primary: true },
  { id: 'company-b', primary: false },
];
const account = { employee, companies };
let checks = 0;
function check(label, test) { test(); checks++; console.log('PASS ' + label); }
check('defaults to the authorized primary company', () => assert.deepEqual(identityFor(account), { employeeId: 'employee-a', companyId: 'company-a' }));
check('explicit assigned company preserves its scope', () => assert.equal(identityFor(account, 'company-b').companyId, 'company-b'));
check('unassigned company cannot silently fall back to primary', () => assert.throws(() => identityFor(account, 'company-hidden'), /not available/));
check('empty company membership fails closed', () => assert.throws(() => identityFor({ employee, companies: [] }), /not available/));
check('empty membership produces no synthetic group bootstrap identity', () => assert.deepEqual(identitiesFor({ employee, companies: [] }), []));
check('all offline read identities remain employee and company scoped', () => assert.deepEqual(identitiesFor(account), [
  { employeeId: 'employee-a', companyId: 'company-a' },
  { employeeId: 'employee-a', companyId: 'company-b' },
]));
check('scope key captures employee and each assigned company', () => assert.match(source, /const scopeKey = identities\.map\(\(identity\) => identity\.employeeId \+ ':' \+ identity\.companyId\)/));
check('scope changes invalidate outstanding IndexedDB refreshes', () => assert.match(source, /previousScope\.current = scopeKey;\s*refreshGeneration\.current \+= 1/));
check('scope changes purge previous operation state and sync receipts', () => assert.match(source, /operationsRef\.current = \[\];[\s\S]*?setOperations\(\[\]\);\s*setLastSuccessfulSync\(null\)/));
check('current render filters operations by employee and authorized company', () => assert.match(source, /return operations\.filter\(\(item\) => permitted\.has\(item\.employeeId \+ ':' \+ item\.companyId\)\)/));
check('merged durable read excludes stale prior-company operations', () => assert.match(source, /operationsRef\.current\s*\.filter\(\(item\) => authorizedNamespaces\.has\(item\.employeeId \+ ':' \+ item\.companyId\)\)/));
check('stale context telemetry fails closed', () => assert.match(source, /previousScope\.current !== scopeKey \|\| !onlineRef\.current/));
check('old-scope sync refuses to continue after async bootstrap', () => assert.match(source, /const sameScope = \(\) => mounted\.current && previousScope\.current === scopeKey;[\s\S]*?await requestJson<OfflineBootstrap>[\s\S]*?if \(!sameScope\(\)\) return;[\s\S]*?bootstrapByCompany\.current\.set/));
check('old-scope sync refuses to replay queue after revocation', () => assert.match(source, /await registerOfflineBackgroundSync\(\);\s*if \(!sameScope\(\)\) return;[\s\S]*?await syncQueuedOperations\(identity,[\s\S]*?if \(!sameScope\(\)\) return/));
check('follow-up sync uses latest authenticated closure', () => assert.match(source, /if \(followUp\) window\.setTimeout\(\(\) => void latestSyncNow\.current\(followUpIgnoreBackoff\), 0\)/));
check('late sync completion cannot rewrite revoked-scope status', () => assert.match(source, /const next = await refreshOperations\(\);\s*if \(!sameScope\(\)\) return;[\s\S]*?if \(authenticationRequired\) setStatus/));
// Execute the actual current sync callback through transpilation, not a reimplementation.
const file = ts.createSourceFile('offline-sync.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let syncArrow;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'syncNow' && node.initializer && ts.isCallExpression(node.initializer)) syncArrow = node.initializer.arguments[0];
  ts.forEachChild(node, visit);
}
visit(file);
assert.ok(syncArrow && ts.isArrowFunction(syncArrow), 'current sync callback must be locatable');
const executableSync = ts.transpileModule('const run = ' + syncArrow.getText(file) + ';', {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const sideEffects = [];
let finishBootstrap;
const runtime = {
  mounted: { current: true }, previousScope: { current: 'employee-a:company-a' }, scopeKey: 'employee-a:company-a',
  syncInFlight: { current: false }, syncRequested: { current: false }, syncRequestedIgnoreBackoff: { current: false },
  navigator: { onLine: true }, setOnline: () => {}, setStatus: (value) => sideEffects.push('status:' + value),
  identities: [{ employeeId: 'employee-a', companyId: 'company-a' }],
  requestJson: () => new Promise((resolve) => { finishBootstrap = resolve; }),
  bootstrapByCompany: { current: new Map() }, context: {},
  saveCachedAuthContext: async () => { sideEffects.push('cache'); },
  registerOfflineBackgroundSync: async () => { sideEffects.push('register'); },
  syncQueuedOperations: async () => { sideEffects.push('replay'); return { synced: 1, authRequired: 0 }; },
  refreshOperations: async () => [], isPending: () => false, isNeedsAttention: () => false,
  setLastSuccessfulSync: () => {}, sendTelemetry: async () => { sideEffects.push('telemetry'); },
  latestSyncNow: { current: async () => {} }, window: { setTimeout: () => {} },
};
const run = new Function(...Object.keys(runtime), executableSync + '\nreturn run;')(...Object.values(runtime));
const pendingSync = run();
assert.equal(typeof finishBootstrap, 'function', 'bootstrap fixture must be in flight');
runtime.previousScope.current = 'employee-b:company-b';
finishBootstrap({ policy: { maxQueueCount: 10 } });
await pendingSync;
check('revocation during pending bootstrap performs no cached auth or queue replay', () => {
  assert.deepEqual(sideEffects, ['status:syncing']);
  assert.equal(runtime.syncInFlight.current, false);
  assert.equal(runtime.bootstrapByCompany.current.size, 0);
});
console.log('OFFLINE_SCOPE_SECURITY_CHECKS=' + checks + '/' + checks + ' PASS');
