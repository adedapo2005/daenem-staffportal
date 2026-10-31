import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// These are the approved export and the four reviewed navigation boundaries.
// Verification never writes hashes, updates a manifest, or accepts an override.
export const APPROVED_NAVIGATION_OVERLAY = Object.freeze({
  id: 'enterprise-command-center-v1',
  baselineCommit: '2a9b93a5f89a624c7ae10983fbfbe8b33ec55810',
  sourceCommit: '09bd2051d118242bce095be012a3a763cc1f8a33',
  snapshotPath: 'source-snapshots/DAENEM-StaffPortal-Post-SignIn-v115',
  descriptorPath: 'source-overlays/enterprise-command-center-v1.json',
  manifestSha256: 'b03d80b1791ab45e7d1daaa34a66c54b95d2843dfd09191633cf615409d3c1d4',
  portalPath: 'app/experience/Portal.tsx',
  baseSha256: '9d35987bfd830b087f69da8d14cbf9b769b8dfda4225f6bb63907081afd01998',
  replacements: Object.freeze([
    Object.freeze({ id: 'navigation-import', beforeSha256: '02b658d1b2478e458427c7cd3d29091eb72af11b0f58984cd618641977f2337e' }),
    Object.freeze({ id: 'route-owner', beforeSha256: 'c09114569ad54edd862a703c73ca792873400b1910240ec4a21b632ccd7e2f89' }),
    Object.freeze({ id: 'owner-workspace-shell', beforeSha256: 'dddd70735cceb9c53d33e5b57a8c62c1e0ffeb33f6191396a111903f2a1583b0' }),
    Object.freeze({ id: 'navigation-body', beforeSha256: '5c4e399540d1521afd6fc0b6c642b84854a071b0d021265d9ac7faf1b784423c' }),
  ]),
  files: Object.freeze([
    'src/enterprise-command-center-model.ts',
    'src/enterprise-command-center-navigation.tsx',
    'src/enterprise-command-center-navigation.css',
  ]),
});

const fail = (message) => { throw new Error(`Approved navigation overlay: ${message}`); };
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function exactKeys(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...keys].sort())) fail(`${label} has unexpected or missing fields.`);
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(`${label} must be a lowercase SHA-256 digest.`);
}

function literalBytes(value, label) {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a nonempty literal string.`);
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.toString('utf8') !== value) fail(`${label} is not lossless UTF-8.`);
  return bytes;
}

export function validateNavigationOverlayDescriptor(descriptor) {
  const policy = APPROVED_NAVIGATION_OVERLAY;
  exactKeys(descriptor, ['schemaVersion', 'id', 'baselineCommit', 'path', 'baseSha256', 'patchedSha256', 'replacements', 'files'], 'Descriptor');
  if (descriptor.schemaVersion !== 1 || descriptor.id !== policy.id) fail('Unexpected descriptor identity or schema version.');
  if (descriptor.baselineCommit !== policy.baselineCommit) fail('Unexpected integration baseline commit.');
  if (descriptor.path !== policy.portalPath) fail('Only the approved Portal path may be replaced.');
  if (descriptor.baseSha256 !== policy.baseSha256) fail('The approved Portal baseline digest changed.');
  requireDigest(descriptor.patchedSha256, 'Patched Portal digest');
  if (descriptor.patchedSha256 === policy.baseSha256) fail('The authorized navigation implementation is missing.');

  if (!Array.isArray(descriptor.replacements) || descriptor.replacements.length !== policy.replacements.length) {
    fail('Exactly four approved literal replacement boundaries are required.');
  }
  descriptor.replacements.forEach((replacement, index) => {
    exactKeys(replacement, ['id', 'before', 'after'], 'Replacement');
    const expected = policy.replacements[index];
    if (replacement.id !== expected.id) fail('Replacement identities or ordering changed.');
    const before = literalBytes(replacement.before, `${replacement.id}.before`);
    const after = literalBytes(replacement.after, `${replacement.id}.after`);
    if (sha256(before) !== expected.beforeSha256) fail(`Unapproved replacement boundary: ${replacement.id}.`);
    if (before.equals(after)) fail(`Replacement ${replacement.id} does not change the navigation.`);
  });

  if (!Array.isArray(descriptor.files) || descriptor.files.length !== policy.files.length) fail('Exactly three approved overlay source files are required.');
  const seen = new Set();
  for (const file of descriptor.files) {
    exactKeys(file, ['path', 'sha256'], 'Overlay source file');
    if (!policy.files.includes(file.path) || seen.has(file.path)) fail(`Unapproved or duplicate overlay source path: ${file.path}.`);
    seen.add(file.path);
    requireDigest(file.sha256, `Overlay source digest for ${file.path}`);
  }
  return descriptor;
}

// Work on byte buffers: no newline, whitespace, formatting, or Unicode normalization.
// Find every span before replacing anything, so one replacement cannot swallow another.
function replaceUniqueLiterals(bytes, replacements, from, to) {
  const spans = replacements.map((replacement) => {
    const needle = literalBytes(replacement[from], `${replacement.id}.${from}`);
    const start = bytes.indexOf(needle);
    if (start === -1) fail(`Missing exact ${from} span for ${replacement.id}.`);
    if (bytes.indexOf(needle, start + 1) !== -1) fail(`Ambiguous ${from} span for ${replacement.id}.`);
    return { start, end: start + needle.length, bytes: literalBytes(replacement[to], `${replacement.id}.${to}`), id: replacement.id };
  }).sort((a, b) => a.start - b.start);

  const parts = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) fail(`Overlapping replacement spans at ${span.id}.`);
    parts.push(bytes.subarray(cursor, span.start), span.bytes);
    cursor = span.end;
  }
  parts.push(bytes.subarray(cursor));
  return Buffer.concat(parts);
}

export function recoverApprovedPortalBytes(portalBytes, descriptor) {
  validateNavigationOverlayDescriptor(descriptor);
  if (!Buffer.isBuffer(portalBytes)) fail('Portal must be verified as a byte buffer.');
  if (sha256(portalBytes) !== descriptor.patchedSha256) fail('Patched Portal checksum mismatch.');
  const original = replaceUniqueLiterals(portalBytes, descriptor.replacements, 'after', 'before');
  if (sha256(original) !== APPROVED_NAVIGATION_OVERLAY.baseSha256) {
    fail('Recovered Portal does not match the approved baseline; bytes outside the navigation boundary changed.');
  }
  const reproduced = replaceUniqueLiterals(original, descriptor.replacements, 'before', 'after');
  if (!reproduced.equals(portalBytes)) fail('The navigation replacements do not reproduce the exact current Portal.');
  return original;
}

export function verifyPinnedExportManifest(manifestBytes) {
  const policy = APPROVED_NAVIGATION_OVERLAY;
  if (!Buffer.isBuffer(manifestBytes) || sha256(manifestBytes) !== policy.manifestSha256) {
    fail('The original export manifest checksum changed.');
  }
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.source_commit !== policy.sourceCommit || manifest.files?.[policy.portalPath] !== policy.baseSha256) {
    fail('The export manifest does not identify the approved Portal source baseline.');
  }
  return manifest;
}

export function verifyOverlaySourceFiles(descriptor, readSourceFile) {
  validateNavigationOverlayDescriptor(descriptor);
  for (const file of descriptor.files) {
    const bytes = readSourceFile(file.path);
    if (!Buffer.isBuffer(bytes) || sha256(bytes) !== file.sha256) fail(`Overlay source checksum mismatch: ${file.path}.`);
  }
}

export function readRegularProjectFile(projectRoot, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.includes('\\') || relativePath.includes('\0')) fail('Invalid project-relative file path.');
  const segments = relativePath.split('/');
  if (segments.some((part) => !part || part === '.' || part === '..' || part.includes(':'))) fail('Noncanonical project-relative file path.');
  let absolute = resolve(projectRoot);
  if (!lstatSync(absolute).isDirectory()) fail('Project root must be a real directory.');
  for (let index = 0; index < segments.length; index += 1) {
    absolute = resolve(absolute, segments[index]);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) fail(`Symlinks are not permitted in the overlay: ${relativePath}.`);
    if (index < segments.length - 1 ? !stat.isDirectory() : !stat.isFile()) fail(`Expected a regular project file: ${relativePath}.`);
  }
  return readFileSync(absolute);
}

export function verifyApprovedNavigationOverlay({ projectRoot }) {
  const policy = APPROVED_NAVIGATION_OVERLAY;
  const read = (path) => readRegularProjectFile(projectRoot, path);
  const manifest = verifyPinnedExportManifest(read(`${policy.snapshotPath}/EXPORT-MANIFEST.json`));
  const descriptor = validateNavigationOverlayDescriptor(JSON.parse(read(policy.descriptorPath).toString('utf8')));
  const portalBytes = read(`${policy.snapshotPath}/${policy.portalPath}`);
  const originalPortalBytes = recoverApprovedPortalBytes(portalBytes, descriptor);
  verifyOverlaySourceFiles(descriptor, read);
  const patchedSha256 = descriptor.patchedSha256;

  return Object.freeze({
    id: policy.id,
    manifest,
    portalPath: policy.portalPath,
    originalPortalBytes,
    baseSha256: policy.baseSha256,
    patchedSha256,
    // Preserve the original export fingerprint only for an already verified Portal.
    // Recheck its active bytes here, so a later read cannot silently normalize a change.
    digestForExportFile(file, bytes) {
      const digest = sha256(bytes);
      if (file !== policy.portalPath) return digest;
      if (digest !== patchedSha256) fail('Portal changed after navigation overlay verification.');
      return policy.baseSha256;
    },
  });
}
