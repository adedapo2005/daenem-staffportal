// StaffPortal release-blocker gate (machine-readable).
//
// Development builds stay green on the behaviours that are provable today.
// This check is the separate STAGING-PROMOTION gate: it detects, from source,
// each Owner-recorded release blocker and exits 1 while any is present.
// It never exits 0 with warnings. A blocker clears only when its probe no
// longer finds the blocking condition in source.
//
// Usage: node scripts/check-staffportal-release-blockers.mjs
// Output: one JSON document on stdout (schema staffportal-release-blockers/v1).
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => (existsSync(new URL(path, root)) ? readFileSync(new URL(path, root), 'utf8') : '');

const signinCss = read('src/signin-experience.css');
const approvedSigninCss = read('public/approved-signin-v180.css');
const signinRuntime = read('src/signin-experience.tsx');
const auth = read('src/auth.tsx');
const postloginRuntime = read('src/qa-review-v115-runtime.tsx');

// Every `selector { body }` rule with its enclosing @media conditions, so a
// probe can tell desktop rules from max-width (mobile-only) rules.
function rules(css) {
  const out = [];
  const stack = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < css.length) {
    const ch = css[i];
    if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end < 0 ? css.length : end + 2;
      start = i;
      continue;
    }
    if (ch === '{') {
      const head = css.slice(start, i).trim();
      if (head.startsWith('@')) {
        stack.push({ head, depth });
        depth += 1;
        i += 1;
        start = i;
        continue;
      }
      const close = css.indexOf('}', i);
      out.push({ selector: head, body: css.slice(i + 1, close < 0 ? css.length : close), media: stack.map((entry) => entry.head) });
      i = close < 0 ? css.length : close + 1;
      start = i;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (stack.length && stack[stack.length - 1].depth === depth) stack.pop();
      start = i + 1;
    }
    i += 1;
  }
  return out;
}

const desktopScrollRules = rules(signinCss).filter((rule) =>
  /#staffportal-auth-mount[^,]*\.usp-auth-panel/.test(rule.selector)
  && /overflow(?:-y)?\s*:\s*(?:auto|scroll)/.test(rule.body)
  && !rule.media.some((media) => /max-width/.test(media)));

const weatherFetch = /fetch\(\s*[`'"][^`'"]*weather/i.test(signinRuntime) || /api<[^>]*>\(\s*[`'"][^`'"]*weather/i.test(auth);
const weatherRetainsReading = /previous[^\n]{0,80}ready|lastGood|retain(?:ed)?Reading|cachedReading/i.test(signinRuntime + auth);

const passwordStateStyles = (css) => {
  const selectors = rules(css).map((rule) => rule.selector).join('\n');
  return /usp-password-requirements[^\n{]*\.pass\b/.test(selectors) && /usp-password-requirements[^\n{]*\.fail\b/.test(selectors);
};
const passwordStatesStyled = passwordStateStyles(signinCss) || passwordStateStyles(approvedSigninCss);

const demoRoleMapping = /sessionForProfile\(/.test(postloginRuntime) || /\/owner\|super\.\?admin\//.test(postloginRuntime);
const realGrantMapping = /context\.(?:permissions|companyPermissions)\b/.test(postloginRuntime);

const blockers = [
  {
    id: 'SIGNIN-DESKTOP-INTERNAL-SCROLL',
    title: 'Desktop Sign-In auth panel is an internal scroll container',
    requirement: 'Desktop Sign-In does not introduce an internal scrollbar.',
    present: desktopScrollRules.length > 0,
    evidence: desktopScrollRules.map((rule) => `src/signin-experience.css: ${rule.selector.replace(/\s+/g, ' ')} { ${rule.body.replace(/\s+/g, ' ').trim()} }`),
    decision: 'Owner (Issue #5): not production-ready; frozen Sign-In not to be altered; remains a release blocker.',
  },
  {
    id: 'SIGNIN-WEATHER-NOT-LIVE',
    title: 'Sign-In shows no live weather and cannot retain a last good reading',
    requirement: 'Weather retains truthful cached data when refresh fails.',
    present: !(weatherFetch && weatherRetainsReading),
    evidence: [
      `weather fetch in src/signin-experience.tsx or src/auth.tsx: ${weatherFetch ? 'found' : 'none'}`,
      `last-good-reading retention: ${weatherRetainsReading ? 'found' : 'none'}`,
    ],
    decision: 'Owner (Issue #5): no public weather endpoint approved; pending; remains a release blocker.',
  },
  {
    id: 'SIGNIN-PASSWORD-STATES-UNSTYLED',
    title: 'Password requirement success/failure states are not visually distinguished',
    requirement: 'Password requirements expose neutral, success, and failure states.',
    present: !passwordStatesStyled,
    evidence: [
      `DOM states in src/auth.tsx: ${auth.includes("'neutral' : check.ok ? 'pass' : 'fail'") ? 'neutral/pass/fail present' : 'not found'}`,
      `.usp-password-requirements .pass/.fail styles in Sign-In CSS: ${passwordStatesStyled ? 'found' : 'none'}`,
    ],
    decision: 'Owner (Issue #5): no Sign-In CSS change authorised; incomplete; remains a release blocker.',
  },
  {
    id: 'POSTLOGIN-NAVIGATION-NOT-PERMISSION-DERIVED',
    title: 'Post-login module visibility comes from demo role profiles, not real grants',
    requirement: 'Navigation shows only modules the signed-in user is permitted to see.',
    present: demoRoleMapping && !realGrantMapping,
    evidence: [
      `src/qa-review-v115-runtime.tsx sessionForProfile()/role-name regex: ${demoRoleMapping ? 'used' : 'not used'}`,
      `context.permissions / context.companyPermissions used for the session: ${realGrantMapping ? 'yes' : 'no'}`,
    ],
    decision: 'New finding (Claude, Oct 18) awaiting Owner review; server APIs still enforce data access.',
  },
];

const present = blockers.filter((blocker) => blocker.present);
console.log(JSON.stringify({
  schema: 'staffportal-release-blockers/v1',
  status: present.length ? 'BLOCKED' : 'CLEAR',
  blockerCount: present.length,
  blockers,
}, null, 2));
if (present.length) {
  console.error(`STAFFPORTAL RELEASE BLOCKED: ${present.length} unresolved release blocker(s): ${present.map((blocker) => blocker.id).join(', ')}`);
  process.exitCode = 1;
}
