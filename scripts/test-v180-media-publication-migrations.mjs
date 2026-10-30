import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE permissions (id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, module TEXT NOT NULL, action TEXT NOT NULL, description TEXT, sensitive INTEGER NOT NULL); CREATE TABLE role_permissions (id TEXT PRIMARY KEY, role_id TEXT NOT NULL, permission_id TEXT NOT NULL, access_level TEXT NOT NULL);`);
db.exec(fs.readFileSync('migrations/0102_staffportal_v180_media_publication.sql', 'utf8'));
db.exec(fs.readFileSync('migrations/0103_staffportal_v180_media_approved_seed.sql', 'utf8'));
const rows = db.prepare(`SELECT asset_key,category,qa_status,display_enabled,image_r2_key,image_sha256,image_bytes,image_mime
  FROM staffportal_v180_media_publication ORDER BY sort_order,asset_key`).all();
assert.equal(rows.length, 50, 'seed must contain exactly the current approved Cloudflare public set');
assert.equal(rows.filter(row => row.category === 'global').length, 10);
assert.equal(rows.filter(row => row.category === 'widget').length, 40);
assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM permissions WHERE code='staffportal.media.publish' AND sensitive=1`).get().n, 1,
  'publication permission must be registered as sensitive');
assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE p.code='staffportal.media.publish'`).get().n, 0,
  'permission registration must not grant any role automatically');
assert.ok(rows.every(row => ['approved', 'approved_v179'].includes(row.qa_status) && row.display_enabled === 1));
assert.equal(new Set(rows.map(row => row.asset_key)).size, 50);
assert.ok(rows.every(row => /^[a-f0-9]{64}$/.test(row.image_sha256) &&
  row.image_r2_key === `staffportal/approved-v180/sha256/${row.image_sha256.slice(0, 2)}/${row.image_sha256}.${row.image_mime === 'image/webp' ? 'webp' : row.image_mime === 'image/png' ? 'png' : 'jpg'}`));
assert.ok(rows.every(row => Number.isInteger(row.image_bytes) && row.image_bytes > 0 && row.image_bytes <= 12_000_000));
assert.equal(db.prepare('SELECT COUNT(*) AS n FROM staffportal_v180_media_publication_audit').get().n, 0,
  'bootstrap snapshot must not fabricate user publication actions');
assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM staffportal_v180_media_publication
  WHERE qa_status NOT IN ('approved','approved_v179') OR display_enabled<>1`).get().n, 0,
  'pending, draft, revoked, and disabled content must not enter the public seed');

console.log('V180 media publication migrations: 12 assertions passed; 50 approved rows loaded in SQLite');
