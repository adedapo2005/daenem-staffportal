// OWNER-LOCKED DAENEM StaffPortal Sign-In — October 24, 2026.
// Runs in preproduction PR CI and before every protected Cloudflare staging deploy.
// No bypass token, time-based expiration, environment override, or automatic unlock.
// Other workstreams and all non-Sign-In paths remain free to evolve.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifestPath = path.join(root, 'delivery/owner-lock/staffportal-signin-2026-10-24.manifest.json');
const expectedManifestDigest = '92be22f7b5b45d68aa72b91851841c50991b8cbfc7fe5d9b3e82ac4a1c6fa04b';
const expectedTag = 'staffportal-signin-locked-2026-10-24';
const expectedCommit = 'd7907f0102e7bcf79f90a60bdc5fdc542975dd04';
const expectedCount = 128;
const digest = content => crypto.createHash('sha256').update(content).digest('hex');
const fail = why => {
  console.error('SIGNIN_OWNER_LOCK=BLOCKED: ' + why);
  console.error('Owner authorization is required before altering approved StaffPortal Sign-In. See private GitHub release: https://github.com/adedapo2005/daenem-staffportal/releases/tag/' + expectedTag);
  process.exit(1);
};
if (!fs.existsSync(manifestPath)) fail('Approved frozen-source manifest missing');
const raw = fs.readFileSync(manifestPath);
if (digest(raw) !== expectedManifestDigest) fail('Approved Owner-lock manifest was changed or replaced');
let manifest;
try { manifest = JSON.parse(raw.toString('utf8')); }
catch { fail('Approved Owner-lock manifest is not valid JSON'); }
if (manifest.tag !== expectedTag || manifest.approvedCommit !== expectedCommit ||
    !Array.isArray(manifest.files) || manifest.files.length !== expectedCount) {
  fail('Baseline tag, commit or protected file count changed without explicit Owner approval');
}
const frozenPath = file =>
  file.startsWith('src/approved-signin-v180/') ||
  file.startsWith('src/signin-') ||
  file === 'src/auth.tsx' ||
  file === 'public/approved-signin-v180.css' ||
  file === 'public/signin-credits.html' ||
  file.startsWith('public/reference-images/signin/') ||
  file.startsWith('public/assets/') ||
  file.startsWith('worker/v180-public-') ||
  file.startsWith('worker/v180-curated-');
const expected = new Map();
for (const file of manifest.files) {
  if (typeof file.path !== 'string' || file.path.includes('..') ||
      !frozenPath(file.path) || !/^[0-9a-f]{64}$/.test(file.sha256) ||
      expected.has(file.path)) fail('Invalid or duplicated path/hash in lock manifest');
  expected.set(file.path, file.sha256);
}
let tracked;
try {
  tracked = execFileSync('git', ['ls-files', '-z'], {cwd:root, maxBuffer:25_000_000})
    .toString('utf8').split('\0').filter(Boolean).map(p=>p.replaceAll('\\', '/'));
} catch { fail('Could not list tracked project files to enforce frozen Sign-In'); }
const current = tracked.filter(frozenPath);
const newFiles = current.filter(p=>!expected.has(p));
const removedFiles = [...expected.keys()].filter(p=>!current.includes(p));
if (newFiles.length || removedFiles.length) {
  fail('Frozen Sign-In file list changed. Added: ' + newFiles.join(', ') + '; removed: ' + removedFiles.join(', '));
}
const changed = [];
for (const [relative,approved] of expected) {
  const source = path.join(root, relative);
  try {
    if (digest(fs.readFileSync(source)) !== approved) changed.push(relative);
  } catch { changed.push(relative + ' (missing/unreadable)'); }
}
if (changed.length) fail('Frozen Sign-In code/assets differ from approved SHA-256 baseline: ' + changed.join(', '));
console.log('SIGNIN_OWNER_LOCK=PASS');
console.log('OWNER_APPROVED_TAG=' + expectedTag);
console.log('OWNER_APPROVED_COMMIT=' + expectedCommit);
console.log('SIGNIN_LOCKED_FILES=' + expectedCount);
console.log('Only explicit Owner authorization may establish a new Sign-In baseline.');
