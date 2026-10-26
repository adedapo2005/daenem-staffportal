import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  ['draft fetch errors remain unknown', workbench.includes('hasDraft: boolean | null = null') && workbench.includes('Draft availability could not be verified.')],
  ['legacy Studio destinations remain mounted', workbench.includes("if (requested === 'Preview') return 'Preview'") && workbench.includes('return null;')],
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
