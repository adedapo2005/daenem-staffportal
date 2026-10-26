import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const root = process.cwd();
const workbench = readFileSync(root + '/src/stage1-signin-studio-authority.tsx', 'utf8');
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
  ['read-only Worker settings used', workbench.includes('fetchAdminSignInPreferences()')],
  ['only existing Worker draft read used', workbench.includes('fetchAdminSignInDraft()')],
  ['no permission-less settings request', workbench.includes("if (!localGrant) {") && workbench.indexOf("if (!localGrant) {") < workbench.indexOf('fetchAdminSignInPreferences()')],
  ['owner and admin roles require explicit settings grant', workbench.includes("'group_admin'") && workbench.includes("'settings.access', 'manage'")],
  ['Worker permission denial fails closed before draft read', workbench.indexOf("if (current.canManage !== true)") < workbench.indexOf('fetchAdminSignInDraft()')],
  ['async permission scope cancellation', workbench.includes('if (cancelled) return') && workbench.includes('context.sessionId, localGrant, authRefresh')],
  ['draft unavailable cannot be misreported as absent', workbench.includes('hasDraft: boolean | null = null') && workbench.includes("setLoad('unavailable')")],
  ['legacy nonmigrated Studio destinations remain mounted', workbench.includes("if (requested === 'Themes') return 'Themes'") && workbench.includes('return null;')],
  ['authoritative Themes route replaces Webflow default', workbench.includes("section === 'Themes'") && workbench.includes('HISTORICAL REFERENCE · NOT ACTIVE')],
  ['stored Worker settings distinguished from source locked V180', workbench.includes('not proof that the source-locked V180') && workbench.includes('not proof of editable controls')],
  ['draft recheck denies revoked grant after second Worker read', workbench.includes('if (result.canManage !== true)') && workbench.includes("setLoad('denied');")],
  ['failed draft recheck blocks presentation', workbench.includes("if (!cancelled) setLoad('unavailable');")],

  ['preview opens in separate tab with no opener', workbench.includes('target="_blank" rel="noopener noreferrer"')],
  ['preview markup has keyboard focus style', styles.includes('.stage1-studio-authority a:focus-visible')],
  ['no write/publish API calls in workbench', !/saveSignInPreferences|saveSignInDraft|method:\s*['"]POST['"]|\/api\/theme\/signin\/publish/.test(workbench)],
  ['runtime bridge installed outside protected snapshot', runtime.includes('<Stage1SignInStudioAuthority context={context} />')],
  ['responsive visual review presets include 4K', workbench.includes('3840, height: 2160')],
  ['cross-origin iframe not used', !workbench.includes('<iframe')],
  ['CSP frame-ancestor policy verified in canonical Worker', worker.includes("frame-ancestors 'none'")],
  ['Worker framing-deny headers verified in both variants', worker.includes("headers.set('x-frame-options', 'DENY')") && stagingWorker.includes("headers.set('x-frame-options','DENY')")],
  ['null Studio section cannot write dataset', workbench.includes("if (!mount || !active || section === null) return;")],
  ['read-only tab navigation provides focus', styles.includes(':focus-visible')],
  ['legacy source left intact for separate migration', legacy.includes('Webflow Home — Accepted Default')],
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
const runtime = {
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
runInNewContext(compiled.outputText + '\nexports.__parseSection = sectionFromUrl;', runtime, { timeout: 5000 });
const { hasStudioManagementGrant, __parseSection } = runtime.exports;
assert.equal(typeof hasStudioManagementGrant, 'function');
assert.equal(typeof __parseSection, 'function');

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
  ['?studioSection=Preview', 'Preview'],
  ['?studioSection=Editor', null],
  ['?studioSection=Widgets', null],
  ['?studioSection=Unknown', null],
];
for (const [search, expected] of sections) {
  runtime.window.location.search = search;
  assert.equal(__parseSection(), expected, 'Studio route: ' + search);
  console.log('PASS runtime: route', search || '(default)');
}
console.log('Executed grant and navigation policy scenarios: ' + (scenarios.length + 1 + sections.length) + '/' + (scenarios.length + 1 + sections.length) + ' PASS');
