import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const must = (condition, message) => { if (!condition) throw new Error('Approved StaffPortal experience lock failed: ' + message); };
const gitBlobSha = (content) => crypto.createHash('sha1').update('blob ' + Buffer.byteLength(content) + '\0' + content).digest('hex');

const main = read('src/main.tsx');
const postLogin = read('src/approved-postlogin-v115.tsx');
const postLoginCss = read('src/approved-postlogin-v115.css');
const signin = read('src/signin-experience.tsx');
const workflow = read('.github/workflows/deploy-staffportal-staging.yml');
const auth = read('src/auth.tsx');
const signinPreferences = read('src/signin-preferences.ts');
const stagingWorker = read('worker/staffportal-staging.ts');
const stagingConfig = read('wrangler.staffportal-staging.jsonc');
const serviceWorker = read('public/sw.js');
const stagingRuntimeTest = read('scripts/test-staffportal-staging-runtime.mjs');

must(gitBlobSha(signin) === '20e0a664e2a8751516ac32b0dbdaaeb8b14d77a0', 'approved Sign-In V180 source changed without an explicit lock update');
must(auth.includes("await api('/api/auth/login'") && auth.includes("await api<{ authenticated: boolean; context?: WorkforceContext }>('/api/auth/me')"), 'Sign-In does not create and verify a real Worker session');
must(!auth.includes('Frontend sign-in preview complete') && !auth.includes('No credentials were sent') && !auth.includes('no session was created'), 'preview-only Sign-In handler is present');
must(signinPreferences.includes('stalePreviewCopy') && signinPreferences.includes('DEFAULT_SIGNIN_LABELS.auth.socialNote'), 'stored preview-era Sign-In copy is not rejected');
must(stagingWorker.includes("import runtimeHandler from './runtime';") && stagingWorker.includes("x-staffportal-auth-runtime','worker-password-auth-v1'"), 'staging is not locked to the Worker authentication runtime');
must(!stagingConfig.includes('premium-lab') && stagingConfig.includes('staffportal-sites-migration-v1') && stagingConfig.includes('staffportal-qa-review'), 'staging origins do not match the approved Sign-In and QA Review references');
must(serviceWorker.includes('daenem-workforce-shell-v12-approved-postlogin-v115'), 'the rejected authenticated shell cache is not invalidated');
must(stagingRuntimeTest.includes('deployed-auth-module') && stagingRuntimeTest.includes('x-staffportal-auth-runtime'), 'deployed authentication module verification is missing');
must(main.includes("import { ApprovedPostLoginV115 } from './approved-postlogin-v115';"), 'approved QA Review V115 post-login component is not imported');
must(main.includes('return <OfflinePlatformProvider context={auth.context}><ApprovedPostLoginV115 context={auth.context} onLogout={auth.logout} /></OfflinePlatformProvider>;'), 'authenticated Root is not mounted directly to the approved QA Review V115 experience');
must(!main.includes('<Workspace context={auth.context}') && !main.includes('<PostLoginRemoved'), 'authenticated Root can still mount a rejected post-login shell');
must(postLogin.includes('data-approved-postlogin="qa-review-v115"'), 'approved QA Review V115 runtime marker is missing');
must(postLogin.includes('data-source-commit="09bd2051d118242bce095be012a3a763cc1f8a33"'), 'approved QA Review source provenance changed');
must(postLoginCss.includes('.qa115-app') && postLoginCss.includes('.qa115-sidebar') && postLoginCss.includes('.qa115-main'), 'approved QA Review V115 shell styling is incomplete');
must(!postLogin.includes('premium-lab') && !postLogin.includes('ZipDashboard') && !postLogin.includes('PostLoginRemoved'), 'rejected post-login source is present in the approved runtime');
must(workflow.includes('ApprovedPostLoginV115') && workflow.includes('Authenticated Root still mounts the rejected Workspace shell'), 'staging deployment gate is not locked to the approved direct post-login mount');

console.log('APPROVED_SIGNIN_V180_LOCK=PASS');
console.log('WORKER_BACKED_SIGNIN_RUNTIME_LOCK=PASS');
console.log('APPROVED_POSTLOGIN_QA_REVIEW_V115_LOCK=PASS');
console.log('REJECTED_POSTLOGIN_RUNTIME_MOUNT=ABSENT');
