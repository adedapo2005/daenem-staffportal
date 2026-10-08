import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const read = (name) => readFileSync(new URL('../src/' + name, import.meta.url), 'utf8');
const compiled = ts.transpileModule(read('canonical-time.ts'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  reportDiagnostics: true,
});
assert.equal((compiled.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0);
const module = { exports: {} };
new Function('module', 'exports', compiled.outputText)(module, module.exports);
const { parsePortalTimestamp, resolveStaffTimeZone, formatPortalTime, formatPortalDateTime, formatOwnerDualTime } = module.exports;
let checks = 0;
const check = (label, callback) => { callback(); checks++; console.log('PASS ' + label); };

check('explicit UTC remains UTC', () => assert.equal(parsePortalTimestamp('2026-10-08T14:00:00Z').toISOString(), '2026-10-08T14:00:00.000Z'));
check('D1 timestamp without suffix is UTC', () => assert.equal(parsePortalTimestamp('2026-10-08 14:00:00').toISOString(), '2026-10-08T14:00:00.000Z'));
check('ISO local-looking timestamp uses UTC convention', () => assert.equal(parsePortalTimestamp('2026-10-08T14:00:00').toISOString(), '2026-10-08T14:00:00.000Z'));
check('explicit signed offset is respected', () => assert.equal(parsePortalTimestamp('2026-10-08T10:00:00-04:00').toISOString(), '2026-10-08T14:00:00.000Z'));
check('malformed timestamp is neutral', () => assert.equal(formatPortalDateTime('internal-invalid-token', 'Africa/Lagos'), ''));
check('impossible calendar date is neutral', () => assert.equal(parsePortalTimestamp('2026-02-30T14:00:00Z'), null));
check('invalid month is neutral', () => assert.equal(parsePortalTimestamp('2026-13-08T14:00:00Z'), null));
check('missing value is neutral', () => assert.equal(formatPortalTime(null, 'Africa/Lagos'), ''));
check('configured employee zone outranks device zone', () => assert.equal(resolveStaffTimeZone('America/New_York', 'Africa/Lagos'), 'America/New_York'));
check('invalid configured zone falls back to device', () => assert.equal(resolveStaffTimeZone('not-a-zone', 'Africa/Lagos'), 'Africa/Lagos'));
check('invalid configured and device zones fall back to UTC', () => assert.equal(resolveStaffTimeZone('bad-zone', 'other-bad-zone'), 'UTC'));
check('Lagos render is 12-hour PM', () => assert.match(formatPortalTime('2026-10-08T14:00:00Z', 'Africa/Lagos'), /3:00 PM/));
check('New York October render observes daylight time', () => assert.match(formatPortalTime('2026-10-08T14:00:00Z', 'America/New_York'), /10:00 AM/));
check('New York January render observes standard time', () => assert.match(formatPortalTime('2026-01-08T14:00:00Z', 'America/New_York'), /9:00 AM/));
check('human-visible full date uses 12-hour AM PM', () => assert.match(formatPortalDateTime('2026-10-08 14:00:00', 'Africa/Lagos'), /Oct.*3:00 PM|3:00 PM.*Oct/));
check('Owner two-zone display uses same UTC source without conflation', () => {
  const result = formatOwnerDualTime('2026-10-08T14:00:00Z');
  assert.match(result.lagos, /3:00 PM/);
  assert.match(result.newYork, /10:00 AM/);
});
check('Communications timestamps use configured viewer zone', () => {
  const source = read('communications-inbox-entry.tsx');
  assert.match(source, /resolveStaffTimeZone\(context\.employee\.timezone\)/);
  assert.match(source, /formatPortalTime\(value,viewerZone\)/);
  assert.match(source, /formatPortalDateTime\(value,viewerZone\)/);
  assert.match(source, /cleanCompanies\(context\)/);
  assert.match(source, /canViewInboxCompany/);
  assert.doesNotMatch(source, /new Intl\.DateTimeFormat\(undefined/);
});
check('mobile Communications controls reflow without hidden actions', () => {
  const css = read('communications-inbox.css');
  assert.match(css, /\.wa-filters\{grid-column:1;grid-row:3;display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /\.wa-thread-actions\{grid-column:1\/-1/);
  assert.match(css, /\.wa-message-scroll\{min-width:0;overflow-x:hidden/);
});
console.log('Canonical StaffPortal time + Communications permission contract: PASS ' + checks + '/' + checks);
