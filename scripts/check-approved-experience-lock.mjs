import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const must = (condition, message) => { if (!condition) throw new Error('Approved StaffPortal experience lock failed: ' + message); };
const gitBlobSha = (content) => crypto.createHash('sha1').update('blob ' + Buffer.byteLength(content) + '\\0' + content).digest('hex');

const main = read('src/main.tsx');
const dashboard = read('src/zip-dashboard.tsx');
const qaCss = read('src/qa-review-postauth.css');
const signin = read('src/signin-experience.tsx');
const workflow = read('.github/workflows/deploy-staffportal-staging.yml');

must(gitBlobSha(signin) === '20e0a664e2a8751516ac32b0dbdaaeb8b14d77a0', 'approved Sign-In V180 source changed without an explicit lock update');
must(main.includes('return <OfflinePlatformProvider context={auth.context}><Workspace context={auth.context} onLogout={auth.logout} /></OfflinePlatformProvider>;'), 'authenticated Root is not rendering the real Worker-backed workspace');
must(!main.includes('PostLoginRemoved') && !main.includes('premium-lab'), 'temporary or rejected post-login path is present');
must(dashboard.includes("import './qa-review-postauth.css';"), 'QA Review V115 stylesheet is not loaded');
must(dashboard.includes('data-qa-reference="staffportal-qa-review-v115"'), 'QA Review V115 source marker is missing');
must(dashboard.includes('data-layout-renderer="QaReviewV115Shell"'), 'QA Review V115 shell renderer is missing');
must(dashboard.includes('data-postauth-renderer="qa-review-v115"'), 'QA Review V115 post-login marker is missing');
must(qaCss.includes('.qa-v115-shell') && qaCss.includes('.qa-v115-home'), 'QA Review V115 shell styling is incomplete');
must(workflow.includes('data-qa-reference="staffportal-qa-review-v115"'), 'staging deployment gate is not locked to QA Review V115');

console.log('APPROVED_SIGNIN_V180_LOCK=PASS');
console.log('APPROVED_POSTLOGIN_QA_REVIEW_V115_LOCK=PASS');
