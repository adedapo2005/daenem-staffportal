import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = process.cwd();
const workbench = readFileSync(root + '/src/stage1-signin-studio-authority.tsx', 'utf8');
const styles = readFileSync(root + '/src/stage1-signin-studio-authority.css', 'utf8');
const runtime = readFileSync(root + '/src/qa-review-v115-runtime.tsx', 'utf8');
const approved = readFileSync(root + '/src/signin-experience.tsx', 'utf8');
const legacy = readFileSync(root + '/source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/signin-studio-v20.tsx','utf8');
const checks = [
  ['approved runtime source remains the only official preview', workbench.includes("'/staff-portal-signin?studioReview=signin-v180'")],
  ['auth runtime includes immutable V180 approved source', approved.includes("approved-signin-v180/reference-v180.html?raw")],
  ['historic Webflow Home not described as authoritative', workbench.includes('Webflow Home is not the current public Sign-In')],
  ['read-only Worker settings used', workbench.includes('fetchAdminSignInPreferences()')],
  ['only existing Worker draft read used', workbench.includes('fetchAdminSignInDraft()')],
  ['no write/publish API calls in workbench', !/saveSignInPreferences|saveSignInDraft|method:\s*['"]POST['"]|\/api\/theme\/signin\/publish/.test(workbench)],
  ['runtime bridge installed outside protected snapshot', runtime.includes('<Stage1SignInStudioAuthority context={context} />')],
  ['responsive visual review presets include 4K', workbench.includes('3840, height: 2160')],
  ['cross-origin iframe not used', !workbench.includes('<iframe')],
  ['CSP protections explicitly retained', workbench.includes("X-Frame-Options DENY")],
  ['read-only tab navigation provides focus', styles.includes(':focus-visible')],
  ['legacy source left intact for separate migration', legacy.includes('Webflow Home — Accepted Default')],
];
checks.forEach(([name, ok]) => { assert.ok(ok, name); console.log('PASS',name); });
console.log('Approved V180 Studio runtime tests: ' + checks.length + '/' + checks.length + ' PASS');
