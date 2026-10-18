import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/jobs-recruitment-workspace.tsx', import.meta.url), 'utf8');
const cases = [
  ['revalidate on window focus', /window\.addEventListener\('focus',onReturn\)/],
  ['revalidate on visibility return', /document\.addEventListener\('visibilitychange',onReturn\)/],
  ['clear privileged views during revalidation', /setLoading\(true\);setCompanies\(\[\]\);setError\(''\)/],
  ['ignore superseded authorization response', /if\(version===refreshVersion\.current\)\{setCompanies/],
  ['invalidate refresh on unmount', /return \(\)=>\{refreshVersion\.current\+\+/],
  ['preserve scope selection during refresh', /if\(!loading && !companies\.some/],
  ['guard selected candidate identity', /detail\?\.candidate\.id===selectedId/],
  ['clear spinner when selecting no record', /if\(!id\)\{setDetail\(null\);setRecordLoading\(false\);return;\}/],
  ['fail closed after candidate list read denial', /if\(version===listVersion\.current\)\{\s*if\(err instanceof Error && err\.message===apiError\(404\)\)\{invalidateAccess\(\);return;\}/],
  ['fail closed after candidate detail read denial', /if\(version===recordVersion\.current\)\{\s*if\(err instanceof Error && err\.message===apiError\(404\)\)\{invalidateAccess\(\);return;\}/],
  ['denied mutation calls centralized access invalidation', /if\(err instanceof Error&&err\.message===apiError\(404\)\)invalidateAccess\(\)/],
  ['denial retires in-flight record responses', /listVersion\.current\+\+;recordVersion\.current\+\+/],
  ['denial retires privileged request keys', /pendingRequestKeys\.current\.clear\(\)/],
  ['denial clears protected records', /setAccessInvalid\(true\);setRows\(\[\]\);setDetail\(null\);setSelectedId\(''\)/],
  ['stop rendering records after denial', /if\(accessInvalid\)return <div className="jobs-erp-status error" role="alert">/]
];
for (const [name, pattern] of cases) {
  assert.match(source, pattern, name);
  process.stdout.write('PASS: ' + name + '\n');
}
process.stdout.write('PASS: ' + cases.length + '/' + cases.length + ' source-level safety assertions (not browser/runtime QA)\n');
