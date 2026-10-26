import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';

const root = process.cwd();
const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync(path.join(root, 'worker/v180-media-publication-admin.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
});
const database = new DatabaseSync(':memory:');
database.exec(`CREATE TABLE permissions (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, module TEXT NOT NULL, action TEXT NOT NULL, description TEXT, sensitive INTEGER NOT NULL);`);
database.exec(fs.readFileSync(path.join(root, 'migrations/0102_staffportal_v180_media_publication.sql'), 'utf8'));
database.exec(`
  CREATE TABLE roles(id TEXT PRIMARY KEY, code TEXT NOT NULL, active INTEGER NOT NULL);
  CREATE TABLE employee_roles(employee_id TEXT NOT NULL, role_id TEXT NOT NULL);
  INSERT INTO roles VALUES ('role-owner','owner',1),('role-staff','staff',1);
  INSERT INTO employee_roles VALUES ('emp-owner','role-owner'),('emp-staff','role-staff');
`);

const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p7sAAAAASUVORK5CYII=', 'base64');
const sha = crypto.createHash('sha256').update(image).digest('hex');
const key = `staffportal/approved-v180/sha256/${sha.slice(0, 2)}/${sha}.png`;
database.prepare(`INSERT INTO staffportal_v180_media_publication
  (asset_key,id,category,purpose,qa_status,display_enabled,has_default_image,sort_order,image_r2_key,image_sha256,image_bytes,image_mime,publication_version,changed_by)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  .run('global.test.image','global-test','global','Owner test media','revoked',0,0,1,key,sha,image.length,'image/png',1,'bootstrap');

const objects = new Map([[key, { bytes: image, mime: 'image/png' }]]);
const env = {
  DB: {
    prepare(sql) {
      return {
        all: async () => ({ results: database.prepare(sql).all() }),
        bind(...values) {
          const statement = database.prepare(sql);
          return {
            first: async () => statement.get(...values) || null,
            all: async () => ({ results: statement.all(...values) }),
            run: async () => {
              const result = statement.run(...values);
              return { success: true, meta: { changes: Number(result.changes) } };
            },
          };
        },
      };
    },
  },
  FILES: {
    get: async objectKey => {
      const value = objects.get(objectKey);
      if (revokeGrantDuringRead) { revokeGrantDuringRead = false; identity = ownerWithoutGrant; }
      if (!value) return null;
      return { size: value.bytes.length, httpMetadata: { contentType: value.mime },
        arrayBuffer: async () => value.bytes.buffer.slice(value.bytes.byteOffset, value.bytes.byteOffset + value.bytes.byteLength) };
    },
  },
};

let identity = null;
let revokeGrantDuringRead = false;
const exportsBox = {};
const moduleBox = { exports: exportsBox };
new Function('exports', 'module', 'require', compiled.outputText)(exportsBox, moduleBox,
  name => {
    if (name === './auth') return {
      getSessionContext: async () => identity,
      hasPermission: (context, code, level) => context.permissions?.[code] === level,
    };
    if (name === './v180-owner-publication-review') {
      const publicationSource = fs.readFileSync(path.join(root, 'worker/v180-owner-publication-review.ts'), 'utf8');
      const publicationCompiled = ts.transpileModule(publicationSource, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
      });
      const publicationBox = { exports: {} };
      new Function('exports', 'module', 'require', publicationCompiled.outputText)(publicationBox.exports, publicationBox,
        specifier => specifier === './auth' ? { hasPermission: (context, code, level) => context.permissions?.[code] === level } : require(specifier));
      return publicationBox.exports;
    }
    return require(name);
  });
const route = moduleBox.exports.routeOwnerStudioV180Media;
const request = body => new Request(`https://staffportal.invalid/api/owner/studio/media/global.test.image`, {
  method: 'PUT', headers: { origin: 'https://staffportal.invalid', 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const row = () => database.prepare(`SELECT qa_status,display_enabled,publication_version,changed_by FROM staffportal_v180_media_publication WHERE asset_key=?`).get('global.test.image');
const auditCount = () => database.prepare(`SELECT COUNT(*) AS n FROM staffportal_v180_media_publication_audit`).get().n;
const owner = { employee: { id: 'emp-owner', status: 'active' }, sessionId: 'session-owner', roles: [{ code: 'owner' }], permissions: { 'staffportal.media.publish': 'manage' } };
const ownerWithoutGrant = { ...owner, sessionId: 'session-no-grant', permissions: {} };
const staff = { employee: { id: 'emp-staff', status: 'active' }, sessionId: 'session-staff', roles: [{ code: 'staff' }], permissions: {} };

identity = staff;
let response = await route(request({ expectedVersion: 1, qaStatus: 'approved', displayEnabled: true, role: 'owner' }), env);
assert.equal(response.status, 403, 'body cannot grant Owner access');
assert.equal(row().qa_status, 'revoked');
assert.equal(auditCount(), 0);

identity = ownerWithoutGrant;
response = await route(new Request('https://staffportal.invalid/api/owner/studio/media'), env);
assert.equal(response.status, 403, 'Owner role does not bypass the explicit publication grant');

identity = owner;
response = await route(new Request('https://staffportal.invalid/api/owner/studio/media'), env);
assert.equal(response.status, 200);
const adminList = await response.json();
assert.equal(adminList.assets.length, 1);
assert.equal(adminList.assets[0].asset_key, 'global.test.image');
assert.ok(!('image_r2_key' in adminList.assets[0]) && !('image_sha256' in adminList.assets[0]), 'Owner Studio response must omit private storage pins');

response = await route(request({ expectedVersion: 2, qaStatus: 'approved', displayEnabled: true, reason: 'Restore after verified media review' }), env);
assert.equal(response.status, 409, 'stale publication revision must fail');
assert.equal(auditCount(), 0, 'stale write must not create an audit row');

objects.delete(key);
response = await route(request({ expectedVersion: 1, qaStatus: 'approved', displayEnabled: true, reason: 'Restore after verified media review' }), env);
assert.equal(response.status, 503, 'missing private object must block publication');
assert.equal(row().publication_version, 1);
assert.equal(auditCount(), 0);

objects.set(key, { bytes: Buffer.from('not-image'), mime: 'text/html' });
response = await route(request({ expectedVersion: 1, qaStatus: 'approved', displayEnabled: true, reason: 'Restore after verified media review' }), env);
assert.equal(response.status, 503, 'wrong MIME and bytes must block publication');
assert.equal(row().publication_version, 1);
assert.equal(auditCount(), 0);

objects.set(key, { bytes: image, mime: 'image/png' });
response = await route(request({ expectedVersion: 1, qaStatus: 'approved', displayEnabled: true, reason: 'Restore after verified media review', changedBy: 'forged' }), env);
assert.equal(response.status, 400, 'forged actor fields must be rejected');
response = await route(request({ expectedVersion: 1, qaStatus: 'approved', displayEnabled: true, reason: 'Restore after verified media review' }), env);
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { ok: true, assetKey: 'global.test.image', qaStatus: 'approved', displayEnabled: true, publicationVersion: 2 });
assert.equal(row().changed_by, 'emp-owner', 'audit actor must come from the authenticated session');
assert.equal(auditCount(), 1, 'publication update and audit trigger must commit together');

response = await route(request({ expectedVersion: 2, qaStatus: 'revoked', displayEnabled: false, reason: 'Revoke after owner requested removal' }), env);
assert.equal(response.status, 200);
assert.equal(row().qa_status, 'revoked');
assert.equal(row().display_enabled, 0);
assert.equal(row().publication_version, 3);
assert.equal(auditCount(), 2, 'revocation must be audited');

identity = owner;
revokeGrantDuringRead = true;
response = await route(request({ expectedVersion: 3, qaStatus: 'approved', displayEnabled: true, reason: 'Restore after second integrity review' }), env);
assert.equal(response.status, 403, 'permission revoked during private R2 read must win');
assert.equal(row().publication_version, 3, 'revoked session must not update publication');
assert.equal(auditCount(), 2, 'revoked session must not create an audit row');
identity = owner;

response = await route(new Request('https://staffportal.invalid/api/owner/studio/media/global.test.image', {
  method: 'PUT', headers: { origin: 'https://attacker.invalid', 'content-type': 'application/json' },
  body: JSON.stringify({ expectedVersion: 3, qaStatus: 'approved', displayEnabled: true, reason: 'Restore after review' }),
}), env);
assert.equal(response.status, 403, 'untrusted Origin must not mutate publication');
response = await route(new Request('https://staffportal.invalid/api/owner/studio/media/global.test.image', {
  method: 'PUT', headers: { origin: 'https://staffportal.invalid', 'content-type': 'text/plain' }, body: '{}',
}), env);
assert.equal(response.status, 415, 'simple content types must not mutate publication');

response = await route(new Request('https://staffportal.invalid/api/owner/studio/media/global.test.image?redirect=https://attacker.invalid', { method: 'PUT', body: '{}' }), env);
assert.equal(response.status, 404, 'query-based route variation must be rejected');
response = await route(new Request('https://staffportal.invalid/api/owner/studio/media/global.test.image', { method: 'GET' }), env);
assert.equal(response.status, 405, 'publication route must reject non-write methods');

console.log('V180 media Owner Studio publication admin: 33 assertions passed');
