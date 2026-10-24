import { chmodSync, writeFileSync } from 'node:fs';
import {
  REQUIRED_OAUTH_BINDINGS,
  explicitOAuthOverrides,
  assertSafeOAuthInheritance,
} from './staffportal-oauth-inheritance-contract.mjs';

const outputPath = process.argv[2];
if (!outputPath) {
  throw new Error('Usage: node scripts/prepare-staffportal-staging-oauth.mjs <output-json>');
}

const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const apiToken = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
const workerName = 'daenem-staffportal-api-staging';

if (!accountId || !apiToken) {
  throw new Error('Cloudflare Pre-Production deployment credentials are required.');
}

const overrides = explicitOAuthOverrides(process.env);
const inheritedNames = REQUIRED_OAUTH_BINDINGS.filter((name) => !overrides[name]);

if (inheritedNames.length) {
  // Use *metadata only*: secret values are not recoverable from Cloudflare,
  // and the deployment must never attempt to extract or log them.
  const endpoint = 'https://api.cloudflare.com/client/v4/accounts/'
    + encodeURIComponent(accountId)
    + '/workers/scripts/' + encodeURIComponent(workerName) + '/settings';

  let metadata;
  try {
    const response = await fetch(endpoint, {
      headers: { authorization: 'Bearer ' + apiToken, accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      throw new Error('Cloudflare binding metadata request returned HTTP ' + response.status);
    }
    const payload = await response.json();
    if (payload?.success === false) {
      throw new Error('Cloudflare binding metadata was rejected.');
    }
    metadata = payload?.result?.bindings;
  } catch (error) {
    console.error('::error::Could not verify existing Pre-Production OAuth binding names. '
      + (error instanceof Error ? error.message : 'Metadata unavailable.'));
    process.exit(1);
  }

  try {
    const inherited = assertSafeOAuthInheritance(metadata, overrides);
    console.log('Validated existing Pre-Production OAuth binding types for inheritance: '
      + inherited.join(', '));
  } catch (error) {
    console.error('::error::' + (error instanceof Error ? error.message : 'OAuth binding check failed.'));
    process.exit(1);
  }
}

// Cloudflare Wrangler deploy --keep-vars preserves previously deployed secrets,
// including keys omitted from --secrets-file. Only *new explicit GitHub values*
// are uploaded. An empty JSON object is intentional when all values are safely
// inherited; no secret is copied back into GitHub or CI.
for (const value of Object.values(overrides)) console.log('::add-mask::' + value);
writeFileSync(outputPath, JSON.stringify(overrides), { mode: 0o600 });
chmodSync(outputPath, 0o600);
console.log(Object.keys(overrides).length
  ? 'Prepared encrypted GitHub OAuth overrides; unchanged bindings remain inherited.'
  : 'Preserving verified existing Cloudflare OAuth secrets (no secret re-upload).');
console.log('Pre-Production OAuth binding preflight passed without exposing secret values.');
