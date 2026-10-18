import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const approvedSignIn = readFileSync(join(root, 'src/approved-signin-v180/reference-v180.html'), 'utf8');
const studio = readFileSync(join(root, 'src/theme-studio-entry.ts'), 'utf8');
const main = readFileSync(join(root, 'src/main.tsx'), 'utf8');
const preferences = readFileSync(join(root, 'src/signin-preferences.ts'), 'utf8');
const themeApi = readFileSync(join(root, 'worker/theme-preferences.ts'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(!approvedSignIn.includes('Owner Studio'), 'Public approved Sign-In still contains the Owner Studio label.');
assert(!approvedSignIn.includes('sp-owner-studio-trigger'), 'Public approved Sign-In still contains the Owner Studio launcher class.');
assert(!approvedSignIn.includes('data-owner-studio-launcher'), 'Public approved Sign-In still contains the Owner Studio launcher hook.');
assert(studio.includes('Sites Migration · V180'), 'Owner Studio is missing the approved Sign-In V180 surface.');
assert(studio.includes('QA Review · V115 / runtime R116'), 'Owner Studio is missing the approved post-sign-in QA Review surface.');
assert(studio.includes('Legacy shells, Premium Lab, and rejected variants are excluded.'), 'Owner Studio source lock does not exclude legacy variants.');
assert(studio.includes('data-review-surface'), 'Owner Studio review surface selector is missing.');
assert(studio.includes('data-review-preset'), 'Owner Studio responsive viewport presets are missing.');
assert(studio.includes('3840, height: 2160'), 'Owner Studio 4K review preset is missing.');
assert(studio.includes('data-signin-publish'), 'Owner Studio explicit Sign-In publish control is missing.');
assert(studio.includes('data-signin-duplicate'), 'Owner Studio duplicate-as-draft control is missing.');
assert(studio.includes('/workspace/?studioReview=postlogin-v115'), 'Owner Studio post-sign-in review route is missing.');
assert(main.includes("studioReview === 'signin-v180'"), 'Isolated Sign-In review route is missing.');
assert(preferences.includes("sessionStorage : localStorage"), 'Sign-In review draft storage is not isolated from live preferences.');
assert(studio.includes('section.hidden = !canManage'), 'Owner Studio UI is not hidden for unauthorized users.');
assert(themeApi.includes("if (!canManage) return json({ error: 'Manage Settings permission is required.' }, 403);"), 'Theme API publish route is missing the server-side authorization guard.');
console.log('Owner Studio contract passed.');
