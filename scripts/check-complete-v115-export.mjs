import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115/', import.meta.url));
const manifestPath = resolve(root, 'EXPORT-MANIFEST.json');
const failures = [];

if (!existsSync(manifestPath)) {
  console.error('Complete V115 export manifest is missing.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const expected = new Map(Object.entries(manifest.files || {}));
const files = [];
const walk = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (entry.isFile()) files.push(relative(root, absolute).replaceAll('\\', '/'));
  }
};
walk(root);
files.sort();

if (manifest.site_project_id !== 'appgprj_6ab43337da788191886fa3d18457bc30') failures.push('Unexpected Sites project.');
if (manifest.site_version !== 115) failures.push('Unexpected Sites version.');
if (manifest.source_commit !== '09bd2051d118242bce095be012a3a763cc1f8a33') failures.push('Unexpected source commit.');
if (manifest.local_import_check !== 'PASS') failures.push('Export local-import verification did not pass.');
if (files.length !== 683) failures.push(`Expected 683 exported files, found ${files.length}.`);
if (expected.size !== 682) failures.push(`Expected 682 manifest checksum entries, found ${expected.size}.`);

const actualManifestFiles = files.filter((file) => file !== 'EXPORT-MANIFEST.json');
const unlisted = actualManifestFiles.filter((file) => !expected.has(file));
const missing = [...expected.keys()].filter((file) => !actualManifestFiles.includes(file));
if (unlisted.length) failures.push(`Unlisted exported files: ${unlisted.join(', ')}`);
if (missing.length) failures.push(`Missing exported files: ${missing.join(', ')}`);

for (const [file, digest] of expected) {
  const absolute = resolve(root, file);
  if (!existsSync(absolute)) continue;
  const actual = createHash('sha256').update(readFileSync(absolute)).digest('hex');
  if (actual !== digest) failures.push(`Checksum mismatch: ${file}`);
}

for (const excluded of manifest.excluded_files || []) {
  if (existsSync(resolve(root, excluded))) failures.push(`Excluded public Sign-In file is present: ${excluded}`);
}

const modified = [...(manifest.modified_application_files || [])].sort();
const expectedModified = [
  'app/experience/Portal.tsx',
  'app/experience/enterprise-v3.tsx',
  'app/experience/homes-v3.tsx',
  'app/experience/scenery-v3.tsx',
].sort();
if (JSON.stringify(modified) !== JSON.stringify(expectedModified)) failures.push('Unexpected post-Sign-In export integration boundary.');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log('Complete QA Review V115 export passed: 683 files, 682 manifest checksums, public Sign-In excluded, Owner Studio retained.');
