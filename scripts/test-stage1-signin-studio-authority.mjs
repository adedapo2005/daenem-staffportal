import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const root = process.cwd();
const workbench = readFileSync(root + '/src/stage1-signin-studio-authority.tsx', 'utf8');
const reviewSource = readFileSync(root + '/src/stage1-signin-studio-review.ts', 'utf8');
const styles = readFileSync(root + '/src/stage1-signin-studio-authority.css', 'utf8');
const runtime = readFileSync(root + '/src/qa-review-v115-runtime.tsx', 'utf8');
const approved = readFileSync(root + '/src/signin-experience.tsx', 'utf8');
const legacy = readFileSync(root + '/source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/signin-studio-v20.tsx','utf8');
const worker = readFileSync(root + '/worker/index.ts', 'utf8');
const stagingWorker = readFileSync(root + '/worker/staffportal-staging.ts', 'utf8');
const checks = [
  ['approved runtime source remains the only official preview', workbench.includes("'/staff-portal-signin?studioReview=signin-v180'")],
  ['auth runtime includes immutable V180 approved source', approved.includes("approved-signin-v180/reference-v180.html?raw")],
  ['historic Webflow Home not described as authoritative', workbench.includes('Webflow Home is not the current public Sign-In')],
  ['read-only Worker settings used', workbench.includes('readStudioReviewWithoutSideEffects(controller.signal)')],
  ['only existing Worker draft read used', reviewSource.includes("'/api/theme/signin/draft'")],
  ['no permission-less settings request', workbench.includes("if (!localGrant) {") && workbench.indexOf("if (!localGrant) {") < workbench.indexOf('readStudioReviewWithoutSideEffects(controller.signal)')],
  ['owner and admin roles require explicit settings grant', workbench.includes("'group_admin'") && workbench.includes("'settings.access', 'manage'")],
  ['Worker permission denial fails closed before draft read', reviewSource.indexOf("'/api/theme/signin'") < reviewSource.indexOf("'/api/theme/signin/draft'") && reviewSource.includes('if (payload.canManage !== true)')],
  ['async permission scope cancellation', workbench.includes('if (cancelled || controller.signal.aborted) return') && workbench.includes('context.sessionId, localGrant, authRefresh')],
  ['draft unavailable cannot be misreported as absent', reviewSource.includes("if (!Object.prototype.hasOwnProperty.call(draft, 'draft'))") && workbench.includes("'denied' : 'unavailable'")],
  ['legacy Studio destinations cannot expose old editors', workbench.includes("if (requested === 'Themes') return 'Themes'") && workbench.includes('data-studio-access="legacy-hold"')],
  ['authoritative Themes route replaces Webflow default', workbench.includes("section === 'Themes'") && workbench.includes('HISTORICAL REFERENCE · NOT ACTIVE')],
  ['draft comparison uses Worker settings and never publishes', workbench.includes("section === 'Draft'") && workbench.includes('studioDraftDifferences(published, draft)') && !workbench.includes('saveSignInPreferences')],
  ['settings retrieval never mutates client storage', !/localStorage|sessionStorage|storeSignInPreferences|storeWorldClockPreferences/.test(reviewSource) && reviewSource.includes("credentials: 'include'") && reviewSource.includes("cache: 'no-store'")],
  ['stored Worker settings distinguished from source locked V180', workbench.includes('not proof that the source-locked V180') && workbench.includes('not proof of editable controls')],
  ['draft recheck denies revoked grant after second Worker read', reviewSource.includes("const draft = await trustedGet('/api/theme/signin/draft', signal)") && reviewSource.includes('if (payload.canManage !== true)')],
  ['failed draft recheck blocks presentation', workbench.includes("error instanceof StudioPermissionDenied ? 'denied' : 'unavailable'")],

  ['preview opens in separate tab with no opener', workbench.includes('target="_blank" rel="noopener noreferrer"')],
  ['preview markup has keyboard focus style', styles.includes('.stage1-studio-authority a:focus-visible')],
  ['no write/publish API calls in workbench', !/saveSignInPreferences|saveSignInDraft|method:\s*['"]POST['"]|\/api\/theme\/signin\/publish/.test(workbench)],
  ['standalone workbench mounted without legacy demo Studio', runtime.includes('<Stage1SignInStudioAuthority context={context} standalone />') && runtime.includes('isSignInStudioRoutePathname(pathname)')],
  ['responsive visual review presets include 4K', workbench.includes('3840, height: 2160')],
  ['cross-origin iframe not used', !workbench.includes('<iframe')],
  ['CSP frame-ancestor policy verified in canonical Worker', worker.includes("frame-ancestors 'none'")],
  ['Worker framing-deny headers verified in both variants', worker.includes("headers.set('x-frame-options', 'DENY')") && stagingWorker.includes("headers.set('x-frame-options','DENY')")],
  ['unsupported Studio section cannot access legacy dataset', workbench.includes("if (standalone || !mount || !active || section === null) return;")],
  ['read-only tab navigation provides focus', styles.includes(':focus-visible')],
  ['legacy source left intact for separate migration', legacy.includes('Webflow Home — Accepted Default')],
  ['Studio route never persists demo Owner projection', runtime.includes("if (!standaloneStudio) sessionStorage.setItem('daenem-demo-session-v3'")],
  ['route switches before legacy Portal mounts', (() => {
    const start = runtime.indexOf('{standaloneStudio ? (');
    const end = runtime.indexOf(') : (', start);
    return start >= 0 && end > start && runtime.slice(start, end).includes('data-studio-authority-route="workforce-permission-v1"')
      && !runtime.slice(start, end).includes('<Portal />')
      && !runtime.slice(start, end).includes('<select')
      && runtime.indexOf('<Portal />', end) > end;
  })()],
  ['Studio route has standalone focus and return controls', styles.includes('.stage1-studio-shell-skip:focus-visible') && styles.includes('.stage1-studio-shell-return:focus-visible')],
  ['visible Studio sections revalidate Worker rights on window focus', workbench.includes("document.addEventListener('visibilitychange', onVisibilityChange)") && workbench.includes('setSnapshot(null)')],

];
checks.forEach(([name, ok]) => { assert.ok(ok, name); console.log('PASS',name); });
console.log('Approved V180 Studio runtime tests: ' + checks.length + '/' + checks.length + ' PASS');

// Exercise the ACTUAL exported TSX grant policy and route parser with a bounded
// isolated transpiled VM. This does not launch React or touch any Worker/session.
const compiled = ts.transpileModule(workbench, {
  fileName: 'stage1-signin-studio-authority.tsx',
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
});
assert.equal(compiled.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error).length || 0, 0);
const sandbox = {
  exports: {},
  URLSearchParams,
  window: { location: { search: '' } },
  require(path) {
    if (path === './auth') {
      return { hasWorkforcePermission: (context, permission, minimum) =>
        minimum === 'manage' && context.permissions?.[permission] === 'manage' };
    }
    return {};
  },
};
runInNewContext(compiled.outputText + '\nexports.__parseSection = sectionFromUrl;', sandbox, { timeout: 5000 });
const { hasStudioManagementGrant, isSignInStudioRoutePathname, __parseSection } = sandbox.exports;
assert.equal(typeof hasStudioManagementGrant, 'function');
assert.equal(typeof __parseSection, 'function');
assert.equal(typeof isSignInStudioRoutePathname, 'function');

const subject = (role, globalPermission = 'none', companyPermission = 'none') => ({
  roles: role ? [{ id: 'role', code: role, name: role, companyId: 'company-a' }] : [],
  permissions: { 'settings.access': globalPermission },
  companyPermissions: { 'company-a': { 'settings.access': companyPermission } },
});
const scenarios = [
  ['owner explicit manage grant', subject('owner', 'manage'), true],
  ['group admin explicit manage grant', subject('group_admin', 'manage'), true],
  ['owner with no manage grant', subject('owner'), false],
  ['group admin with view only', subject('group_admin', 'view'), false],
  ['employee cannot self-declare global manage', subject('employee', 'manage'), false],
  ['unknown administrative role does not bypass Worker rule', subject('super_admin', 'manage'), false],
  ['company grant cannot bypass global Owner Studio grant', subject('owner', 'none', 'manage'), false],
  ['no role cannot inherit global permission', subject(null, 'manage'), false],
];
for (const [name, ctx, expected] of scenarios) {
  assert.equal(hasStudioManagementGrant(ctx), expected, name);
  console.log('PASS runtime:', name);
}
const revoked = subject('owner', 'manage');
assert.equal(hasStudioManagementGrant(revoked), true);
revoked.permissions['settings.access'] = 'none';
assert.equal(hasStudioManagementGrant(revoked), false, 'grant revocation must deny the next check');
console.log('PASS runtime: grant revocation');

const sections = [
  ['', 'Home'],
  ['?studioSection=Home', 'Home'],
  ['?studioSection=Themes', 'Themes'],
  ['?studioSection=Draft', 'Draft'],
  ['?studioSection=Preview', 'Preview'],
  ['?studioSection=Editor', null],
  ['?studioSection=Widgets', null],
  ['?studioSection=Unknown', null],
];
for (const [search, expected] of sections) {
  sandbox.window.location.search = search;
  assert.equal(__parseSection(), expected, 'Studio route: ' + search);
  console.log('PASS runtime: route', search || '(default)');
}
const paths = [
  ['/admin/experience/sign-in-studio', true],
  ['/admin/experience/sign-in-studio/', true],
  ['/admin/experience/sign-in-studio/legacy', false],
  ['/admin/experience/sign-in-studio-not-approved', false],
  ['/admin/experience', false],
  ['/home', false],
  ['/', false],
];
for (const [path, expected] of paths) {
  assert.equal(isSignInStudioRoutePathname(path), expected, 'authoritative route ' + path);
  console.log('PASS runtime: exact route', path);
}
console.log('Executed grant and navigation policy scenarios: ' + (scenarios.length + 1 + sections.length + paths.length) + '/' + (scenarios.length + 1 + sections.length + paths.length) + ' PASS');

// Execute the side-effect-free Worker reader and complete draft-delta projection
// against synthetic payloads. This does not send real requests or touch D1.
const reviewCompiled = ts.transpileModule(reviewSource, {
  fileName: 'stage1-signin-studio-review.ts',
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
assert.equal(reviewCompiled.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error).length || 0, 0);
const requests = [];
const responses = [];
const mockResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
});
const reviewSandbox = {
  exports: {},
  require(path) {
    if (path === './signin-preferences') return { normalizeSignInPreferences: (data) => data };
    return {};
  },
  fetch: async (path, opts) => {
    requests.push({ path, opts });
    if (!responses.length) throw new Error('Unexpected additional request: ' + path);
    return responses.shift();
  },
};
runInNewContext(reviewCompiled.outputText, reviewSandbox, { timeout: 5000 });
const { readStudioReviewWithoutSideEffects, studioDraftDifferences } = reviewSandbox.exports;
const signal = new AbortController().signal;
const published = { themeMode: 'day', backgroundId: 'original', labels: { auth: { signInTitle: 'Approved Sign In' } }, widgetOrder: ['news', 'weather'] };
const draft = { themeMode: 'night', backgroundId: 'original', labels: { auth: { signInTitle: 'Proposed Sign In' } }, widgetOrder: ['weather', 'news'] };
const granted = (config = published) => mockResponse(200, { canManage: true, config });
const grantedDraft = (config = draft) => mockResponse(200, { canManage: true, draft: config });
requests.length = 0;
responses.push(mockResponse(200, { canManage: false, config: published }));
await assert.rejects(readStudioReviewWithoutSideEffects(signal), (err) => err.name === 'StudioPermissionDenied');
assert.equal(requests.length, 1, 'No draft GET after first denial');
console.log('PASS Worker read: initial permission denial and no draft request');

requests.length = 0;
responses.push(granted(), mockResponse(403, { error: 'revoked' }));
await assert.rejects(readStudioReviewWithoutSideEffects(signal), (err) => err.name === 'StudioPermissionDenied');
assert.equal(requests.length, 2, 'Draft endpoint must independently enforce grant');
console.log('PASS Worker read: grant revoked before draft GET');

requests.length = 0;
responses.push(granted(), grantedDraft());
const reviewResult = await readStudioReviewWithoutSideEffects(signal);
assert.equal(requests.length, 2);
assert.deepEqual(requests.map(x => x.path), ['/api/theme/signin', '/api/theme/signin/draft']);
for (const call of requests) {
  assert.equal(call.opts.method, 'GET');
  assert.equal(call.opts.cache, 'no-store');
  assert.equal(call.opts.credentials, 'include');
  assert.equal(call.opts.signal, signal);
}
assert.equal(reviewResult.published.labels.auth.signInTitle, 'Approved Sign In');
assert.equal(reviewResult.draft.labels.auth.signInTitle, 'Proposed Sign In');
const changes = studioDraftDifferences(reviewResult.published, reviewResult.draft);
assert.equal(changes.length, 3, 'Theme, auth copy and widget order should be distinct changes');
assert.ok(changes.some(x => x.path === 'labels.auth.signInTitle' && x.section === 'Authentication copy'));
assert.ok(changes.some(x => x.path === 'widgetOrder' && x.section === 'Widgets and layout'));
assert.ok(changes.some(x => x.path === 'themeMode' && x.section === 'Appearance'));
console.log('PASS Worker read: complete published-versus-draft comparison with no writes');

requests.length = 0;
responses.push(granted(), grantedDraft(null));
const absent = await readStudioReviewWithoutSideEffects(signal);
assert.equal(absent.draft, null);
assert.equal(studioDraftDifferences(absent.published, absent.draft).length, 0);
console.log('PASS Worker read: absence of draft is not fabricated');

requests.length = 0;
responses.push(granted(), mockResponse(200, { canManage: true }));
await assert.rejects(readStudioReviewWithoutSideEffects(signal), /Studio draft state was not returned/);
assert.equal(requests.length, 2);
console.log('PASS Worker read: malformed draft response fails closed');

requests.length = 0;
responses.push(mockResponse(401, { error: 'expired' }));
await assert.rejects(readStudioReviewWithoutSideEffects(signal), (err) => err.name === 'StudioPermissionDenied');
assert.equal(requests.length, 1);
console.log('PASS Worker read: expired authentication denies without draft access');
console.log('Executed Worker read and draft projection cases: 6/6 PASS');
