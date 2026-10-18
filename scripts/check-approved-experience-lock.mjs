import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const main = read('../src/main.tsx');
const auth = read('../src/auth.tsx');
const signin = read('../src/signin-experience.tsx');
const signinCss = read('../src/signin-experience.css');
const signinReference = read('../src/approved-signin-v180/reference-v180.html');
const signinCompiledCss = read('../public/approved-signin-v180.css');
const postLogin = read('../src/qa-review-v115-runtime.tsx');
const approvedPortal = read('../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/Portal.tsx');
const approvedWorkspaces = read('../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/workspaces.tsx');

const failures = [];
const requireText = (source, expected, message) => { if (!source.includes(expected)) failures.push(message); };
const rejectText = (source, rejected, message) => { if (source.includes(rejected)) failures.push(message); };
const requireSha256 = (path, expected) => {
  const actual = createHash('sha256').update(readFileSync(new URL(path, import.meta.url))).digest('hex');
  if (actual !== expected) failures.push(`Approved source snapshot changed: ${path}`);
};
const approvedSourceRoot = fileURLToPath(new URL('../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/', import.meta.url));
const sourceRoots = ['app/experience', 'components/ui', 'hooks', 'lib', 'vendor'];
const sourceFiles = [];
const walk = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (entry.isFile()) sourceFiles.push(relative(approvedSourceRoot, absolute).replaceAll('\\', '/'));
  }
};
for (const directory of sourceRoots) walk(resolve(approvedSourceRoot, directory));
sourceFiles.push('app/globals.css');
sourceFiles.sort();
const sourceFingerprint = createHash('sha256').update(sourceFiles.map((file) => {
  const digest = createHash('sha256').update(readFileSync(resolve(approvedSourceRoot, file))).digest('hex');
  return `${digest}  ${file}\n`;
}).join('')).digest('hex');

requireText(main, "lazy(() => import('./qa-review-v115-runtime'))", 'Authenticated Root is not wired directly to the complete approved QA Review V115 runtime.');
requireText(main, '<ApprovedPostLoginV115 context={auth.context} onLogout={auth.logout} />', 'Authenticated Root does not pass the real Worker session to approved QA Review V115.');
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
requireText(postLogin, "import Portal from '../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/experience/Portal'", 'The complete approved Portal is not mounted.');
requireText(postLogin, "import '../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/app/globals.css'", 'The approved global design system is not mounted.');
requireText(postLogin, "sessionStorage.setItem('daenem-demo-session-v3'", 'Authenticated Worker context is not bridged into the approved Portal session.');
requireText(approvedPortal, 'data-premium-shell-contract="premium-shell-reset-v1"', 'Approved V115 premium shell contract is missing.');
requireText(approvedPortal, 'const Workspace = lazy(() => import("./workspaces"))', 'Approved V115 complete workspace loader is missing.');
requireText(approvedPortal, 'GlobalShellAdmin', 'Approved V115 global shell administration is missing.');
requireText(approvedPortal, 'CloudStorageAdmin', 'Approved V115 cloud storage administration is missing.');
requireText(approvedWorkspaces, 'FinancialOperationsCenter', 'Approved V115 Banking and Financial Operations Center is missing.');
requireText(approvedWorkspaces, 'import Homes from "./homes-v3"', 'Approved V115 workspace implementation set is incomplete.');
rejectText(postLogin, 'qa115-', 'Hand-recreated qa115 shell classes remain in the approved post-login adapter.');
rejectText(postLogin, 'p-adapter-', 'Hand-recreated post-login adapter classes remain.');
rejectText(postLogin, 'eo-product-icon', 'Hand-recreated banking product icon remains.');
rejectText(postLogin, 'eo-truth-strip', 'Hand-recreated banking truth strip remains.');
if (sourceFiles.length !== 183) failures.push(`Approved V115 post-Sign-In source tree is incomplete: expected 183 files, found ${sourceFiles.length}.`);
if (sourceFingerprint !== 'e1b0945b73b03939aab01cbeef39ac4b22aecf6f880813180f2007066c443365') failures.push('Approved V115 post-Sign-In source tree changed from the official 683-file export.');

requireSha256('../src/approved-signin-v180/reference-v180.html', '00984e096a08ffd936780f6cde928912db0ff30678922962d85574dd526395d7');
requireSha256('../public/approved-signin-v180.css', '45d1861fd9e885325f98275e502e0c343ac58788f9eed5b8093bf254c0ecf92d');
requireSha256('../public/assets/global/newyork-dawn-v179-card.webp', '82c592cf44b00e27a1da84f4777626d657840a02b0c6c4021d8726e2caac31fc');
requireSha256('../public/assets/global/newyork-dusk-v179-card.webp', '9d5b19c718c1cbe13d3311a62dd6708d35389cb0b16264c406055dc1fe59cdd7');
requireSha256('../public/assets/global/beijing-night-v109.jpg', 'f0b39460ae2ae69c429c56a9468c779006cf2743425eaa24420b03248286e3b2');
requireSha256('../public/assets/global/toronto-night-v180-card.webp', '1cb748c13ea4cb9846d4db983167b99753434fa1033e5d83063694f3aa3f31f9');
requireSha256('../public/assets/global/london-night-v180-card.webp', 'b987523c8ac643c1f0073eb428658bf6ffe193ebb7e990fdc2ba633b6b32c9df');
requireSha256('../public/assets/global/moscow-night-v180-card.webp', 'a476ce546b86da8f2ee634adaea0bbe01e28a3d30b7f96bc5c3083567140b9c7');
requireSha256('../public/assets/staffportal-weather/ibadan-night-v125.png', 'c62d5fe6147f9407251e7101ef97b323bcbf10651c2c322373e55fb061820450');
requireSha256('../src/approved-signin-v180/staff-portal.css', '4e2219dbf73b44951dba44413db1e79faadb5da1b999d8f16fd8dd7ec4d4e4a7');
requireSha256('../src/approved-signin-v180/staff-portal-v3.css', '193c4c2dc78e579b88f8c7b18a335a7dd67e32fe31352b35db0268c9a394a455');
rejectText(main, 'premium-lab', 'Rejected Premium Lab reference is present in the active staging runtime.');
rejectText(signin, 'premium-lab', 'Rejected Premium Lab reference is present in Sign-In.');
rejectText(postLogin, 'premium-lab', 'Rejected Premium Lab reference is present post-login.');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log(`Approved experience lock passed: exact Sites V180 + official 683-file QA Review V115 export (${sourceFiles.length} locked runtime files), real Worker auth retained.`);
