import { execFileSync } from 'node:child_process';
import { chmodSync, writeFileSync } from 'node:fs';

const outputPath = process.argv[2];
if (!outputPath) {
  throw new Error('Usage: node scripts/prepare-staffportal-staging-oauth.mjs <output-json>');
}

const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
const apiToken = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
const workerName = 'daenem-staffportal-api-staging';
const configPath = 'wrangler.staffportal-staging.jsonc';

if (!accountId || !apiToken) {
  throw new Error('Cloudflare deployment credentials are required.');
}

const aliases = {
  GOOGLE_CLIENT_ID: ['GOOGLE_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_ID'],
  GOOGLE_CLIENT_SECRET: ['GOOGLE_CLIENT_SECRET', 'GOOGLE_OAUTH_CLIENT_SECRET'],
  MICROSOFT_CLIENT_ID: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_OAUTH_CLIENT_ID'],
  MICROSOFT_CLIENT_SECRET: ['MICROSOFT_CLIENT_SECRET', 'MICROSOFT_OAUTH_CLIENT_SECRET'],
};

const values = Object.fromEntries(
  Object.entries(aliases).map(([canonical, names]) => [
    canonical,
    names.map((name) => (process.env[name] || '').trim()).find(Boolean) || '',
  ]),
);
const sources = Object.fromEntries(
  Object.entries(values)
    .filter(([, value]) => value)
    .map(([name]) => [name, 'GitHub environment']),
);
const requiredNames = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'MICROSOFT_CLIENT_ID',
];
const hasRequired = () => requiredNames.every((name) => Boolean(values[name]));

function isUsable(value) {
  return typeof value === 'string'
    && value.trim().length > 0
    && !/^(?:\*+|redacted|hidden|null|undefined)$/i.test(value.trim());
}

function inspectBindings(node, sourceLabel) {
  if (!node || typeof node !== 'object') return;

  if (!Array.isArray(node) && typeof node.name === 'string') {
    for (const [canonical, names] of Object.entries(aliases)) {
      if (values[canonical] || !names.includes(node.name)) continue;
      const candidates = [node.text, node.value, node.json];
      const recovered = candidates.find(isUsable);
      if (recovered) {
        values[canonical] = recovered.trim();
        sources[canonical] = sourceLabel;
      }
    }
  }

  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') inspectBindings(value, sourceLabel);
  }
}

function collectVersionIds(node, ids = []) {
  if (!node || typeof node !== 'object') return ids;
  if (!Array.isArray(node)) {
    for (const key of ['id', 'version_id', 'versionId']) {
      const value = node[key];
      if (typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(value)) {
        if (!ids.includes(value)) ids.push(value);
      }
    }
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') collectVersionIds(value, ids);
  }
  return ids;
}

async function cloudflare(path) {
  const response = await fetch('https://api.cloudflare.com/client/v4' + path, {
    headers: {
      authorization: 'Bearer ' + apiToken,
      'content-type': 'application/json',
    },
  });
  if (!response.ok) throw new Error('Cloudflare API returned HTTP ' + response.status);
  const body = await response.json();
  if (body.success === false) throw new Error('Cloudflare API request was unsuccessful.');
  return body;
}

async function recoverThroughApi() {
  const versions = [];
  for (let page = 1; page <= 10; page += 1) {
    const body = await cloudflare(
      '/accounts/' + encodeURIComponent(accountId)
      + '/workers/scripts/' + encodeURIComponent(workerName)
      + '/versions?page=' + page + '&per_page=100',
    );
    const pageVersions = Array.isArray(body.result) ? body.result : [];
    versions.push(...pageVersions);
    inspectBindings(pageVersions, 'Cloudflare version list');
    if (hasRequired()) return;
    const totalPages = Number(body.result_info?.total_pages || 1);
    if (page >= totalPages || pageVersions.length === 0) break;
  }

  const ids = collectVersionIds(versions);
  for (const id of ids) {
    const body = await cloudflare(
      '/accounts/' + encodeURIComponent(accountId)
      + '/workers/scripts/' + encodeURIComponent(workerName)
      + '/versions/' + encodeURIComponent(id),
    );
    inspectBindings(body.result, 'Cloudflare version ' + id);
    if (hasRequired()) return;
  }
}

function recoverThroughWrangler() {
  const run = (args) => JSON.parse(execFileSync(
    'npx',
    ['wrangler', ...args, '--config', configPath],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ));

  const list = run(['versions', 'list', '--json']);
  inspectBindings(list, 'Wrangler version list');
  for (const id of collectVersionIds(list)) {
    const details = run(['versions', 'view', id, '--json']);
    inspectBindings(details, 'Wrangler version ' + id);
    if (hasRequired()) return;
  }
}

if (!hasRequired()) {
  try {
    await recoverThroughApi();
  } catch {
    // Wrangler below uses the same authenticated Cloudflare connection.
  }
}

if (!hasRequired()) {
  try {
    recoverThroughWrangler();
  } catch {
    // The final validation reports exactly which binding names remain unavailable.
  }
}

const missing = requiredNames.filter((name) => !values[name]);

if (missing.length) {
  console.error('::error::Unable to recover required Pre-Production OAuth bindings: ' + missing.join(', '));
  process.exit(1);
}

for (const value of Object.values(values).filter(Boolean)) {
  console.log('::add-mask::' + value);
}

const deployValues = Object.fromEntries(
  Object.entries(values).filter(([, value]) => Boolean(value)),
);
writeFileSync(outputPath, JSON.stringify(deployValues), { mode: 0o600 });
chmodSync(outputPath, 0o600);

const recovered = Object.entries(sources)
  .filter(([, source]) => source.startsWith('Cloudflare'))
  .map(([name]) => name);
console.log(
  recovered.length
    ? 'Recovered existing Pre-Production OAuth bindings from Cloudflare version history: ' + recovered.join(', ')
    : 'Using encrypted GitHub environment OAuth bindings.',
);
console.log('Prepared required OAuth provider bindings without exposing values.');
