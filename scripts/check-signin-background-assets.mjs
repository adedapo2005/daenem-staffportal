import { readFileSync, statSync } from 'node:fs';

const catalogueSource = readFileSync(new URL('../src/signin-preferences.ts', import.meta.url), 'utf8');
const catalogueStart = catalogueSource.indexOf('export const SIGNIN_BACKGROUND_OPTIONS');
const catalogueEnd = catalogueSource.indexOf('\n];', catalogueStart);
if (catalogueStart < 0 || catalogueEnd < 0) {
  throw new Error('SIGNIN_BACKGROUND_OPTIONS catalogue could not be located');
}

const catalogue = catalogueSource.slice(catalogueStart, catalogueEnd + 3);
const entries = [...catalogue.matchAll(
  /\{\s*id:\s*'([^']+)'[^}]*?\bsrc:\s*'([^']+)'[^}]*?\bpreviewSrc:\s*'([^']+)'[^}]*\}/g,
)].map((match) => ({
  id: match[1],
  src: match[2],
  previewSrc: match[3],
}));

const fullOnlyEntries = [...catalogue.matchAll(
  /\{\s*id:\s*'([^']+)'[^}]*?\bsrc:\s*'([^']+)'[^}]*\}/g,
)].map((match) => ({
  id: match[1],
  src: match[2],
}));

const activeEntries = fullOnlyEntries.map((entry) => ({
  ...entry,
  previewSrc: entries.find((candidate) => candidate.id === entry.id)?.previewSrc,
}));

function fileForPublicUrl(publicUrl) {
  return new URL('../public/' + publicUrl.replace(/^\/+/, ''), import.meta.url);
}

function inspectWebp(publicUrl) {
  const file = fileForPublicUrl(publicUrl);
  let bytes;
  try {
    bytes = readFileSync(file);
  } catch (error) {
    throw new Error(publicUrl + ': file missing (' + error.message + ')');
  }
  if (bytes.length === 0) throw new Error(publicUrl + ': file is empty');
  if (bytes.length < 20) throw new Error(publicUrl + ': file is too short for a WebP RIFF container');
  if (bytes.toString('ascii', 0, 4) !== 'RIFF') throw new Error(publicUrl + ': missing RIFF signature');
  if (bytes.toString('ascii', 8, 12) !== 'WEBP') throw new Error(publicUrl + ': missing WEBP signature');

  const declaredFileLength = bytes.readUInt32LE(4) + 8;
  if (declaredFileLength !== bytes.length) {
    throw new Error(publicUrl + ': RIFF declares ' + declaredFileLength + ' bytes but file has ' + bytes.length);
  }

  let offset = 12;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new Error(publicUrl + ': truncated chunk header at byte ' + offset);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const chunkEnd = offset + 8 + chunkSize + (chunkSize & 1);
    if (chunkEnd > bytes.length) {
      throw new Error(publicUrl + ': chunk exceeds physical file at byte ' + offset);
    }
    offset = chunkEnd;
  }
  if (offset !== bytes.length) throw new Error(publicUrl + ': malformed chunk boundary');
  return { bytes: bytes.length, declaredFileLength };
}

const failures = [];
const checked = [];
if (activeEntries.length !== 7) failures.push('expected 7 active full-size entries, found ' + activeEntries.length);
if (!activeEntries.some((entry) => entry.id === 'unified-daylight')) failures.push('unified-daylight is not in the active catalogue');
if (catalogue.includes('international-operations-atrium')) failures.push('international-operations-atrium remains in the active catalogue');

for (const entry of activeEntries) {
  for (const [kind, publicUrl] of [['full', entry.src], ['thumbnail', entry.previewSrc]]) {
    if (!publicUrl) {
      if (kind === 'thumbnail') continue;
      failures.push(entry.id + ': missing full-size source path');
      continue;
    }
    if (!publicUrl.toLowerCase().endsWith('.webp')) {
      failures.push(entry.id + ': ' + kind + ' is not a WebP path');
      continue;
    }
    try {
      const result = inspectWebp(publicUrl);
      checked.push({ id: entry.id, kind, path: publicUrl, ...result });
    } catch (error) {
      failures.push(error.message);
    }
  }
}

if (failures.length) {
  console.error('SIGN-IN BACKGROUND SOURCE INTEGRITY: FAIL');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}

console.log('SIGN-IN BACKGROUND SOURCE INTEGRITY: PASS');
console.log('ACTIVE_FULL_BACKGROUNDS=' + activeEntries.length);
console.log('CONFIGURED_THUMBNAILS=' + checked.filter((item) => item.kind === 'thumbnail').length);
for (const item of checked) {
  console.log(item.kind.toUpperCase() + ' ' + item.id + ' ' + item.path + ' bytes=' + item.bytes + ' riffLength=' + item.declaredFileLength);
}
