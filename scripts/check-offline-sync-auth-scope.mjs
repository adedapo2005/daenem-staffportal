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
check('current render quarantines revoked Forms without hiding authorized Expense or crossing identity', () => {
  // Execute the actual visibleOperations render callback and current grant predicate.
  const parsed = ts.createSourceFile('offline-sync.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let renderCallback;
  const findRender = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'visibleOperations'
      && node.initializer && ts.isCallExpression(node.initializer)) {
      renderCallback = node.initializer.arguments[0];
    }
    ts.forEachChild(node, findRender);
  };
  findRender(parsed);
  assert.ok(renderCallback && ts.isArrowFunction(renderCallback), 'visibleOperations render callback must exist');
  const grantStart = source.indexOf('function permitsOfflineKind(');
  const grantEnd = source.indexOf('function formatTime(', grantStart);
  assert.ok(grantStart >= 0 && grantEnd > grantStart, 'current company grant predicate must exist');
  const runnable = ts.transpileModule(
    source.slice(grantStart, grantEnd) + '\nconst project = ' + renderCallback.getText(parsed) + ';',
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  ).outputText;
  const project = new Function('identities', 'operations', 'previousScope', 'scopeKey', 'context',
    runnable + '\nreturn project();');
  const revoked = {
    employee, companies,
    roles: [{ id: 'staff-a', code: 'staff', companyId: 'company-a' }],
    companyPermissions: { 'company-a': { 'forms.access': 'none', 'expense.requests': 'create' } },
  };
  const queue = [
    { id: 'revoked-form', employeeId: 'employee-a', companyId: 'company-a', kind: 'forms.submit' },
    { id: 'authorized-expense', employeeId: 'employee-a', companyId: 'company-a', kind: 'expense.request.submit' },
    { id: 'cross-company', employeeId: 'employee-a', companyId: 'company-hidden', kind: 'forms.submit' },
    { id: 'cross-employee', employeeId: 'employee-hidden', companyId: 'company-a', kind: 'expense.request.submit' },
  ];
  const identities = identitiesFor(revoked);
  const visible = (scope, current, auth) => project(identities, queue, { current: scope }, current, auth).map((item) => item.id);
  assert.deepEqual(visible('session-a', 'session-a', revoked), ['authorized-expense'],
    'revoked Forms, other company, and other employee must not render');
  assert.deepEqual(visible('session-old', 'session-new', revoked), [],
    'previous session activity must disappear synchronously');
  const restored = { ...revoked, companyPermissions: { 'company-a': { 'forms.access': 'view', 'expense.requests': 'create' } } };
  assert.deepEqual(visible('session-b', 'session-b', restored), ['revoked-form', 'authorized-expense'],
    'restoring the grant must reveal legitimate encrypted work without duplicating it');
});
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
// Execute the current auth-scope key and grant predicate against same-company revocation.
const keyExpression = source.match(/const scopeKey = ([^;\r\n]+);/)?.[1];
assert.ok(keyExpression, 'current authorization scope key is locatable');
const scopeFor = new Function('identities', 'context', 'return (' + keyExpression + ');');
const grantStart = source.indexOf('function permitsOfflineKind(');
const grantEnd = source.indexOf('function formatTime(', grantStart);
assert.ok(grantStart >= 0 && grantEnd > grantStart, 'current offline grant predicate is locatable');
const grantCode = ts.transpileModule(source.slice(grantStart, grantEnd), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const permitsOfflineKind = new Function(grantCode + '\nreturn permitsOfflineKind;')();
const allowed = {
  sessionId: 'session-1', employee, companies,
  roles: [{ id: 'role-1', code: 'staff', companyId: 'company-a' }],
  permissions: { 'forms.access': 'view', 'expense.requests': 'create' },
  companyPermissions: { 'company-a': { 'forms.access': 'view', 'expense.requests': 'create' } },
};
const snapshot = structuredClone(allowed);
check('unchanged session and grants preserve the offline scope', () => assert.equal(scopeFor(identitiesFor(allowed), allowed), scopeFor(identitiesFor(snapshot), snapshot)));
snapshot.sessionId = 'session-2';
check('same-company session rotation invalidates the offline scope', () => assert.notEqual(scopeFor(identitiesFor(allowed), allowed), scopeFor(identitiesFor(snapshot), snapshot)));
snapshot.sessionId = allowed.sessionId;
snapshot.roles[0].code = 'restricted';
check('same-company role revocation invalidates the offline scope', () => assert.notEqual(scopeFor(identitiesFor(allowed), allowed), scopeFor(identitiesFor(snapshot), snapshot)));
snapshot.roles = structuredClone(allowed.roles);
snapshot.companyPermissions['company-a']['forms.access'] = 'none';
check('same-company Forms action revocation invalidates offline scope', () => assert.notEqual(scopeFor(identitiesFor(allowed), allowed), scopeFor(identitiesFor(snapshot), snapshot)));
check('revoked Forms activity fails closed but authorized expenses remain', () => {
  assert.equal(permitsOfflineKind(snapshot, 'company-a', 'forms.submit'), false);
  assert.equal(permitsOfflineKind(snapshot, 'company-a', 'expense.request.submit'), true);
});
check('restored Forms grant preserves legitimate encrypted work', () => {
  snapshot.companyPermissions['company-a']['forms.access'] = 'view';
  assert.equal(scopeFor(identitiesFor(allowed), allowed), scopeFor(identitiesFor(snapshot), snapshot));
  assert.equal(permitsOfflineKind(snapshot, 'company-a', 'forms.submit'), true);
});
check('another company cannot inherit available offline authority', () => assert.equal(permitsOfflineKind(allowed, 'company-b', 'forms.submit'), false));
check('revoked operation kind is filtered before replay by current policy', () => {
  const platform = readFileSync('src/offline-platform.ts', 'utf8');
  assert.match(source, /allowedKinds = bootstrap\.policy\.allowedOperations\.filter/);
  assert.match(platform, /options\.allowedKinds && !options\.allowedKinds\.includes\(operation\.kind\)/);
  assert.match(platform, /options\.stillAuthorized && !options\.stillAuthorized\(\)/);
});
console.log('OFFLINE_SCOPE_SECURITY_CHECKS=' + checks + '/' + checks + ' PASS');
