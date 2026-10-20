import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  APPROVED_NAVIGATION_OVERLAY as policy,
  readRegularProjectFile,
  recoverApprovedPortalBytes,
  validateNavigationOverlayDescriptor,
  verifyApprovedNavigationOverlay,
  verifyOverlaySourceFiles,
  verifyPinnedExportManifest,
} from './lib/approved-navigation-overlay.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const descriptorTemplate = JSON.parse(readFileSync(resolve(projectRoot, policy.descriptorPath), 'utf8'));
const portalBytes = readFileSync(resolve(projectRoot, policy.snapshotPath, policy.portalPath));
const manifestPath = resolve(projectRoot, policy.snapshotPath, 'EXPORT-MANIFEST.json');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Use the actual Portal and reviewed replacement spans. Source-file fixtures let
// boundary tests run in the partial review checkout without weakening production.
function fixture() {
  const descriptor = structuredClone(descriptorTemplate);
  const sources = new Map(policy.files.map((path) => [path, Buffer.from(`// source fixture: ${path}\n`)]));
  descriptor.files = [...sources].map(([path, bytes]) => ({ path, sha256: sha256(bytes) }));
  return { descriptor, sources };
}

test('the exact authorized navigation reverses to the independently pinned V115 Portal', () => {
  const { descriptor } = fixture();
  const original = recoverApprovedPortalBytes(portalBytes, descriptor);
  assert.equal(sha256(original), '9d35987bfd830b087f69da8d14cbf9b769b8dfda4225f6bb63907081afd01998');
  assert.notDeepEqual(original, portalBytes);
});

test('an unrelated Portal byte fails the current implementation hash', () => {
  const { descriptor } = fixture();
  const changed = Buffer.concat([portalBytes, Buffer.from(' ')]);
  assert.throws(() => recoverApprovedPortalBytes(changed, descriptor), /Patched Portal checksum mismatch/);
});

test('rewriting the patched hash cannot authorize a byte outside the navigation boundary', () => {
  const { descriptor } = fixture();
  const changed = Buffer.concat([portalBytes, Buffer.from('\n// Unauthorized unrelated Portal edit.\n')]);
  descriptor.patchedSha256 = sha256(changed);
  assert.throws(() => recoverApprovedPortalBytes(changed, descriptor), /bytes outside the navigation boundary changed/);
});

test('the descriptor cannot broaden an approved replacement boundary', () => {
  const { descriptor } = fixture();
  descriptor.replacements[0].before += '// Extra application code is not an approved navigation boundary.\n';
  assert.throws(() => recoverApprovedPortalBytes(portalBytes, descriptor), /Unapproved replacement boundary: navigation-import/);
});

test('the descriptor cannot change the original Portal hash or integration commit', () => {
  const { descriptor } = fixture();
  descriptor.baseSha256 = '0'.repeat(64);
  assert.throws(() => validateNavigationOverlayDescriptor(descriptor), /baseline digest changed/);
  descriptor.baseSha256 = policy.baseSha256;
  descriptor.baselineCommit = policy.sourceCommit;
  assert.throws(() => validateNavigationOverlayDescriptor(descriptor), /integration baseline commit/);
});

test('an unmodified Portal cannot be silently accepted as the requested navigation release', () => {
  const { descriptor } = fixture();
  descriptor.patchedSha256 = policy.baseSha256;
  assert.throws(() => validateNavigationOverlayDescriptor(descriptor), /navigation implementation is missing/);
});

test('missing exact replacement content fails closed', () => {
  const { descriptor } = fixture();
  descriptor.replacements[1].after = '  const requestedGlobal = missingReviewedLiteral();\n';
  assert.throws(() => recoverApprovedPortalBytes(portalBytes, descriptor), /Missing exact after span for route-owner/);
});

test('ambiguous repeated replacement content is rejected even with a refreshed file hash', () => {
  const { descriptor } = fixture();
  const changed = Buffer.concat([portalBytes, Buffer.from(descriptor.replacements[1].after)]);
  descriptor.patchedSha256 = sha256(changed);
  assert.throws(() => recoverApprovedPortalBytes(changed, descriptor), /Ambiguous after span for route-owner/);
});

test('overlapping replacement spans are rejected', () => {
  const { descriptor } = fixture();
  descriptor.replacements[1].after = descriptor.replacements[2].after.slice(0, 60);
  assert.throws(() => recoverApprovedPortalBytes(portalBytes, descriptor), /Overlapping replacement spans/);
});

test('replacement identities, order, and count cannot be changed', () => {
  const { descriptor } = fixture();
  descriptor.replacements.reverse();
  assert.throws(() => validateNavigationOverlayDescriptor(descriptor), /Replacement identities or ordering changed/);
  descriptor.replacements.pop();
  assert.throws(() => validateNavigationOverlayDescriptor(descriptor), /Exactly three approved literal replacement boundaries/);
});

test('the source checksum check reads all three fixed allowed paths', () => {
  const { descriptor, sources } = fixture();
  const reads = [];
  verifyOverlaySourceFiles(descriptor, (path) => {
    reads.push(path);
    return sources.get(path);
  });
  assert.deepEqual(reads.sort(), [...policy.files].sort());
});

test('editing one overlay source file fails its declared checksum', () => {
  const { descriptor, sources } = fixture();
  const path = policy.files[0];
  sources.set(path, Buffer.concat([sources.get(path), Buffer.from('// Unreviewed edit.\n')]));
  assert.throws(() => verifyOverlaySourceFiles(descriptor, (file) => sources.get(file)), /Overlay source checksum mismatch/);
});

test('a missing overlay file is not treated as an empty or optional source', () => {
  const { descriptor, sources } = fixture();
  sources.delete(policy.files[0]);
  assert.throws(() => verifyOverlaySourceFiles(descriptor, (file) => sources.get(file)), /Overlay source checksum mismatch/);
});

test('authentication and traversal paths cannot be added to the overlay allowlist', () => {
  for (const path of ['src/auth.tsx', '../src/auth.tsx', '/tmp/source.ts', 'src/../src/enterprise-command-center-model.ts']) {
    const { descriptor } = fixture();
    descriptor.files[0].path = path;
    assert.throws(() => validateNavigationOverlayDescriptor(descriptor), /Unapproved or duplicate overlay source path/);
  }
});

test('duplicate, missing, and extra overlay file entries are rejected', () => {
  const duplicate = fixture().descriptor;
  duplicate.files[1] = structuredClone(duplicate.files[0]);
  assert.throws(() => validateNavigationOverlayDescriptor(duplicate), /Unapproved or duplicate overlay source path/);
  const missing = fixture().descriptor;
  missing.files.pop();
  assert.throws(() => validateNavigationOverlayDescriptor(missing), /Exactly three approved overlay source files/);
  const extra = fixture().descriptor;
  extra.files.push({ path: 'src/auth.tsx', sha256: '0'.repeat(64) });
  assert.throws(() => validateNavigationOverlayDescriptor(extra), /Exactly three approved overlay source files/);
});

test('unknown descriptor options and malformed source hashes fail closed', () => {
  const extra = fixture().descriptor;
  extra.allowUnapproved = true;
  assert.throws(() => validateNavigationOverlayDescriptor(extra), /unexpected or missing fields/);
  const malformed = fixture().descriptor;
  malformed.files[0].sha256 = '*';
  assert.throws(() => validateNavigationOverlayDescriptor(malformed), /lowercase SHA-256 digest/);
});

test('an editable manifest cannot assert a new baseline by preserving expected metadata', () => {
  const unpinned = Buffer.from(JSON.stringify({
    source_commit: policy.sourceCommit,
    files: { [policy.portalPath]: policy.baseSha256 },
  }));
  assert.throws(() => verifyPinnedExportManifest(unpinned), /original export manifest checksum changed/);
});

test('a byte edit to the actual original manifest fails even when its JSON meaning is unchanged', {
  skip: !existsSync(manifestPath) && 'The partial review checkout omits the complete export manifest; run this case in the full project.',
}, () => {
  const original = readFileSync(manifestPath);
  assert.equal(verifyPinnedExportManifest(original).source_commit, policy.sourceCommit);
  const edited = Buffer.concat([original, Buffer.from('\n')]);
  assert.deepEqual(JSON.parse(edited.toString('utf8')), JSON.parse(original.toString('utf8')));
  assert.throws(() => verifyPinnedExportManifest(edited), /original export manifest checksum changed/);
});

test('project file reads accept regular files and always reject traversal', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'staffportal-nav-overlay-'));
  try {
    mkdirSync(resolve(directory, 'src'));
    writeFileSync(resolve(directory, 'src/navigation.ts'), '// fixture\n');
    assert.equal(readRegularProjectFile(directory, 'src/navigation.ts').toString(), '// fixture\n');
    assert.throws(() => readRegularProjectFile(directory, 'src/../src/navigation.ts'), /Noncanonical project-relative file path/);
    assert.throws(() => readRegularProjectFile(directory, '../navigation.ts'), /Noncanonical project-relative file path/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('project file reads reject a file-symlink fixture', (t) => {
  const directory = mkdtempSync(resolve(tmpdir(), 'staffportal-nav-overlay-'));
  try {
    mkdirSync(resolve(directory, 'src'));
    writeFileSync(resolve(directory, 'src/navigation.ts'), '// fixture\n');
    const link = resolve(directory, 'src/link.ts');
    try {
      symlinkSync(resolve(directory, 'src/navigation.ts'), link, 'file');
    } catch (error) {
      if (process.platform === 'win32' && ['EPERM', 'ENOTSUP'].includes(error.code)) {
        t.skip(`Windows could not create the file-symlink fixture (${error.code}); the verifier still rejects symlinks, and traversal checks run independently.`);
        return;
      }
      throw error;
    }
    assert.equal(lstatSync(link).isSymbolicLink(), true);
    assert.throws(() => readRegularProjectFile(directory, 'src/link.ts'), /Symlinks are not permitted/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('project file reads reject a linked directory, using a junction on Windows', (t) => {
  const directory = mkdtempSync(resolve(tmpdir(), 'staffportal-nav-overlay-'));
  try {
    mkdirSync(resolve(directory, 'src'));
    writeFileSync(resolve(directory, 'src/navigation.ts'), '// fixture\n');
    const link = resolve(directory, 'linked-src');
    try {
      symlinkSync(resolve(directory, 'src'), link, process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if (process.platform === 'win32' && ['EPERM', 'ENOTSUP'].includes(error.code)) {
        t.skip(`Windows could not create the directory-junction fixture (${error.code}); production link rejection is unchanged.`);
        return;
      }
      throw error;
    }
    assert.equal(lstatSync(link).isSymbolicLink(), true);
    assert.throws(() => readRegularProjectFile(directory, 'linked-src/navigation.ts'), /Symlinks are not permitted/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the production verifier normalizes only the verified Portal and detects a changed later read', {
  skip: !existsSync(manifestPath) && 'The production verifier requires the complete export; no test-mode bypass is provided.',
}, () => {
  const verified = verifyApprovedNavigationOverlay({ projectRoot });
  assert.equal(verified.digestForExportFile(policy.portalPath, portalBytes), policy.baseSha256);
  const unrelated = Buffer.from('unrelated source bytes');
  assert.equal(verified.digestForExportFile('app/experience/workspaces.tsx', unrelated), sha256(unrelated));
  assert.throws(() => verified.digestForExportFile(policy.portalPath, Buffer.concat([portalBytes, Buffer.from(' ')])), /Portal changed after navigation overlay verification/);
});
