import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const main = read('../src/main.tsx');
const auth = read('../src/auth.tsx');
const signin = read('../src/signin-experience.tsx');
const signinCss = read('../src/signin-experience.css');
const signinReference = read('../src/approved-signin-v180/reference-v180.html');
const signinCompiledCss = read('../public/approved-signin-v180.css');
const postLogin = read('../src/approved-postlogin-v115.tsx');
const postLoginCss = read('../src/approved-postlogin-v115.css');

const failures = [];
const requireText = (source, expected, message) => { if (!source.includes(expected)) failures.push(message); };
const rejectText = (source, rejected, message) => { if (source.includes(rejected)) failures.push(message); };
const requireSha256 = (path, expected) => {
  const actual = createHash('sha256').update(readFileSync(new URL(path, import.meta.url))).digest('hex');
  if (actual !== expected) failures.push(`Approved source snapshot changed: ${path}`);
};

requireText(main, '<ApprovedPostLoginV115 context={auth.context} onLogout={auth.logout} />', 'Authenticated Root is not wired directly to approved QA Review V115.');
rejectText(main, '<PostLoginRemoved', 'Rejected PostLoginRemoved shell is still rendered.');
rejectText(main, '<ZipDashboard', 'Rejected ZipDashboard shell is still rendered.');
requireText(auth, "from './signin-experience'", 'Authentication no longer uses the controlled Sign-In adapter.');

requireText(signin, "import approvedSignInMarkup from './approved-signin-v180/reference-v180.html?raw'", 'Exact V180 rendered source is not mounted.');
requireText(signin, '<link rel="stylesheet" href="/approved-signin-v180.css" />', 'Exact V180 compiled stylesheet is not mounted.');
requireText(signin, "#staffportal-auth-mount", 'Real authentication is not mounted into the approved V180 access position.');
requireText(signin, '523474f7b839919c258da85be6fcf53edd38810d', 'Approved Sign-In source commit is missing.');
requireText(signinReference, 'data-approved-signin="sites-v180"', 'Approved Sites V180 Sign-In marker is missing.');
requireText(signinReference, 'data-approved-project="appgprj_6abbab3d45848191b6344993cc010bd7"', 'Approved Sign-In project lock is missing.');
requireText(signinReference, 'sp-layout sp-reference-layout', 'Approved V180 Sign-In structure is missing.');
requireText(signinReference, 'sp-lower-right-rail sp-lower-right-rail-v86', 'Approved V180 lower access/weather placement is missing.');
requireText(signinReference, 'sp-hero-statement-v173', 'Approved V180 hero typography contract is missing.');
requireText(signinReference, 'data-city-id="beijing"', 'Approved V180 six-city operations set is missing Beijing.');
requireText(signinCompiledCss, '.sp-reference-layout', 'Approved V180 compiled stylesheet content is missing.');
rejectText(signin, 'Frontend sign-in preview complete', 'Preview-only fake sign-in behavior is present.');
rejectText(signin, 'No credentials were sent', 'Preview-only credential message is present.');
rejectText(signin, 'sp-adapter-', 'Hand-recreated Sign-In adapter classes remain.');
rejectText(signinCss, 'sp-adapter-', 'Hand-recreated Sign-In adapter styles remain.');

requireText(postLogin, 'data-approved-postlogin="qa-review-v115"', 'Approved QA Review V115 marker is missing.');
requireText(postLogin, '09bd2051d118242bce095be012a3a763cc1f8a33', 'Approved QA Review source commit is missing.');
requireText(postLogin, 'p-app premium-shell-reset theme-daylight', 'Approved V115 shell contract is missing.');
requireText(postLogin, 'v3-workspace-scene scene-layout-0', 'Approved V115 workspace scene is missing.');
requireText(postLogin, 'v14-executive', 'Approved V115 executive operating canvas is missing.');
requireText(postLogin, 'Cash clarity, with controlled authority.', 'Approved V115 Banking Operations Center is missing.');
requireText(postLogin, 'v14-finance-command', 'Approved V115 banking command surface is missing.');
requireText(postLoginCss, "@import './qa-review-v115/premium-shell-reset-v1.css'", 'Exact V115 final shell stylesheet snapshot is not imported.');
requireText(postLoginCss, "@import './qa-review-v115/enterprise-operations.css'", 'Exact V115 enterprise operations stylesheet is not imported.');
rejectText(postLogin, 'qa115-', 'Hand-recreated qa115 shell classes remain in the approved post-login adapter.');
rejectText(postLogin, 'p-adapter-', 'Hand-recreated post-login adapter classes remain.');
rejectText(postLogin, 'eo-product-icon', 'Hand-recreated banking product icon remains.');
rejectText(postLogin, 'eo-truth-strip', 'Hand-recreated banking truth strip remains.');

requireSha256('../src/approved-signin-v180/reference-v180.html', '00984e096a08ffd936780f6cde928912db0ff30678922962d85574dd526395d7');
requireSha256('../public/approved-signin-v180.css', '45d1861fd9e885325f98275e502e0c343ac58788f9eed5b8093bf254c0ecf92d');
requireSha256('../public/assets/global/newyork-dawn-v179-card.webp', '82c592cf44b00e27a1da84f4777626d657840a02b0c6c4021d8726e2caac31fc');
requireSha256('../public/assets/global/newyork-dusk-v179-card.webp', '9d5b19c718c1cbe13d3311a62dd6708d35389cb0b16264c406055dc1fe59cdd7');
requireSha256('../public/assets/global/beijing-night-v109.jpg', 'f0b39460ae2ae69c429c56a9468c779006cf2743425eaa24420b03248286e3b2');
requireSha256('../src/approved-signin-v180/staff-portal.css', '4e2219dbf73b44951dba44413db1e79faadb5da1b999d8f16fd8dd7ec4d4e4a7');
requireSha256('../src/approved-signin-v180/staff-portal-v3.css', '193c4c2dc78e579b88f8c7b18a335a7dd67e32fe31352b35db0268c9a394a455');
for (const [file, hash] of Object.entries({
  'portal.css': '3e4b9914ec8713089b93fcf164e01e64c71e653e2a6fbe137c29f1e2142dc729',
  'enterprise-v3.css': '4aea0c0167757c1baac80809f4fce5a955820d12968a057ed1fb3f308603f25d',
  'enterprise-operations.css': '1fd63ecac452adec55db38947f815efebbd3e56b50c038c0b90d80f7dd5cdcec',
  'auth-v3.css': '2e136973df744fb3ae2315ab00290de95f0ba90e7f138541b32de04f63d0188b',
  'scenery-v3.css': 'd552e3ce894e9bcf9ab9b9df69c441087d52d0f5c20fe06e98df2567122f10da',
  'technology.css': '16de7c57dc7170b3683c35250bac634741425d8f81a4da671d002c7380c4aab1',
  'portal-v13.css': 'd3fa556bbd77c0806f9ff8572fc4f04ef2ee20c2be78437a39effcfcc102ce73',
  'portal-v14.css': '6120564c043b2e1eb5cbd3fe855655eadd4539aa6c59b158398d5591b7324818',
  'portal-v22.css': 'f3f8b4c28839a16aba822cc6200ae5cb1464b00675cca4f33982ca6cfebf464e',
  'navigation-v24.css': 'da94a27b54491a32f7742791435d9834b440e32be8759e52cf9b3444d19abb61',
  'premium-shell-reset-v1.css': 'f29da6c113ba630fbdf4237b22fc47f61d1d953329ec6a6e9964bc18838df4a3',
})) requireSha256(`../src/qa-review-v115/${file}`, hash);

rejectText(main, 'premium-lab', 'Rejected Premium Lab reference is present in the active staging runtime.');
rejectText(signin, 'premium-lab', 'Rejected Premium Lab reference is present in Sign-In.');
rejectText(postLogin, 'premium-lab', 'Rejected Premium Lab reference is present post-login.');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Approved experience lock passed: exact Sites V180 presentation + QA Review V115 shell, real Worker auth retained.');
