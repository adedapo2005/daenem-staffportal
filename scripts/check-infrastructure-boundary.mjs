import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const activeConfigFiles = [
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'vite.pages.config.ts',
  'wrangler.jsonc',
  '.github/workflows/ci.yml',
  '.github/workflows/deploy-pages.yml',
  '.github/workflows/deploy-worker.yml',
];

const forbiddenInfrastructure = [
  'portal.farms.daenem.com',
  'farms.daenem.com',
  'daenem-farms-web-production',
  'daenem-farms-public-media',
  'daenem-farms-private-files',
  'printing-admin',
  'compat-gateway-worker',
];

const contents = [];
for (const relativePath of activeConfigFiles) {
  try {
    contents.push([relativePath, await readFile(join(root, relativePath), 'utf8')]);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}
const joined = contents.map(([path, value]) => `${path}\n${value}`).join('\n');
const violations = forbiddenInfrastructure.filter((term) => joined.includes(term));
if (violations.length) {
  console.error('Forbidden cross-site infrastructure in active configuration:', violations.join(', '));
  process.exit(1);
}

const wrangler = contents.find(([path]) => path === 'wrangler.jsonc')?.[1] || '';
const packageJson = JSON.parse(contents.find(([path]) => path === 'package.json')?.[1] || '{}');
const required = [
  ['Worker name', wrangler.includes('"name": "daenem-staffportal-api"')],
  ['API route', wrangler.includes('"pattern": "staffportal.daenem.com/api/*"')],
  ['No Worker assets binding', !/"assets"s*:/.test(wrangler)],
  ['Pages build script', packageJson.scripts?.build === 'vite --config vite.pages.config.ts build'],
  ['Pages output verification contract', packageJson.scripts?.['build:pages'] === 'npm run build'],
];
const missing = required.filter(([, ok]) => !ok).map(([label]) => label);
if (missing.length) {
  console.error('Staff Portal infrastructure boundary is incomplete:', missing.join(', '));
  process.exit(1);
}

console.log('Staff Portal active infrastructure boundary: PASS');
