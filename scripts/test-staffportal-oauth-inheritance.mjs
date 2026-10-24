import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REQUIRED_OAUTH_BINDINGS,
  explicitOAuthOverrides,
  assertSafeOAuthInheritance,
} from './staffportal-oauth-inheritance-contract.mjs';

const existing = [
  { name: 'GOOGLE_CLIENT_ID', type: 'secret_text' },
  { name: 'GOOGLE_CLIENT_SECRET', type: 'secret_text' },
  { name: 'MICROSOFT_CLIENT_ID', type: 'plain_text' },
  { name: 'MICROSOFT_CLIENT_SECRET', type: 'secret_text' },
];
assert.equal(REQUIRED_OAUTH_BINDINGS.length, 3);
assert.deepEqual(explicitOAuthOverrides({}), {});
assert.deepEqual(assertSafeOAuthInheritance(existing, {}), REQUIRED_OAUTH_BINDINGS);
assert.deepEqual(assertSafeOAuthInheritance(existing, {
  GOOGLE_CLIENT_ID: 'known-override-id',
}), ['GOOGLE_CLIENT_SECRET', 'MICROSOFT_CLIENT_ID']);
assert.deepEqual(explicitOAuthOverrides({ GOOGLE_OAUTH_CLIENT_ID: ' valid-id ',
  GOOGLE_CLIENT_SECRET: 'secure-new-key' }), {
  GOOGLE_CLIENT_ID: 'valid-id',
  GOOGLE_CLIENT_SECRET: 'secure-new-key',
});
assert.deepEqual(explicitOAuthOverrides({ GOOGLE_CLIENT_ID: 'redacted' }), {});
assert.throws(() => assertSafeOAuthInheritance(undefined, {}), /metadata is unavailable/);
assert.throws(() => assertSafeOAuthInheritance([], {}), /missing: GOOGLE_CLIENT_ID/);
assert.throws(() => assertSafeOAuthInheritance(existing.filter((item) => item.name !== 'GOOGLE_CLIENT_SECRET'), {}),
  /GOOGLE_CLIENT_SECRET/);
assert.throws(() => assertSafeOAuthInheritance(existing.map((item) => item.name === 'GOOGLE_CLIENT_SECRET'
  ? { ...item, type: 'plain_text' } : item), {}), /invalid secret binding type/);
assert.throws(() => assertSafeOAuthInheritance(existing.map((item) => item.name === 'MICROSOFT_CLIENT_ID'
  ? { ...item, type: 'kv_namespace' } : item), {}), /invalid secret binding type/);
const script = readFileSync(new URL('./prepare-staffportal-staging-oauth.mjs', import.meta.url), 'utf8');
const deploy = readFileSync(new URL('../.github/workflows/deploy-staffportal-staging.yml', import.meta.url), 'utf8');
assert.ok(script.includes('/settings'), 'Must fetch binding metadata, not encrypted values');
assert.ok(!script.includes('versions?page='), 'Do not extract past deployment secret values');
assert.ok(script.includes('writeFileSync(outputPath, JSON.stringify(overrides)'),
  'Upload explicitly supplied overrides only');
assert.ok(deploy.includes('--keep-vars') && deploy.includes('--secrets-file'),
  'Preserve existing bindings and use validated overrides');
console.log('Pre-Production OAuth secret-inheritance contract passed (15 cases).');
