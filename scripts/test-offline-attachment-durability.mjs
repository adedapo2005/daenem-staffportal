import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const migration = readFileSync('migrations/0105_offline_attachment_cleanup_queue.sql', 'utf8');
const source = readFileSync('worker/offline.ts', 'utf8');
const runtime = readFileSync('worker/runtime.ts', 'utf8');

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE offline_attachments (
      id TEXT PRIMARY KEY,
      employee_id TEXT NOT NULL,
      company_id TEXT,
      operation_id TEXT NOT NULL,
      r2_key TEXT NOT NULL UNIQUE,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'uploaded',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reconciled_at TEXT
    );
  `);
  db.exec(migration);
  return db;
}

test('cleanup reservation is unique for each attachment identity', () => {
  const db = database();
  const insert = db.prepare(`
    INSERT INTO offline_attachment_cleanup_jobs(
      id,attachment_id,employee_id,company_id,operation_id,r2_key,sha256
    ) VALUES(?,?,?,?,?,?,?)
  `);
  insert.run('job-a', 'attachment-a', 'employee-a', 'company-a', 'operation-a', 'offline/a', 'a'.repeat(64));
  assert.throws(
    () => insert.run('job-b', 'attachment-a', 'employee-a', 'company-a', 'operation-a', 'offline/b', 'b'.repeat(64)),
    /UNIQUE constraint failed/,
  );
  assert.throws(
    () => insert.run('job-c', 'attachment-c', 'employee-a', 'company-a', 'operation-a', 'offline/a', 'c'.repeat(64)),
    /UNIQUE constraint failed/,
  );
  db.close();
});

test('committed attachment content identity is immutable while lifecycle status remains mutable', () => {
  const db = database();
  db.prepare(`
    INSERT INTO offline_attachments(
      id,employee_id,company_id,operation_id,r2_key,original_name,mime_type,size_bytes,sha256
    ) VALUES(?,?,?,?,?,?,?,?,?)
  `).run('attachment-a', 'employee-a', 'company-a', 'operation-a', 'offline/a', 'proof.pdf', 'application/pdf', 12, 'a'.repeat(64));
  db.prepare("UPDATE offline_attachments SET status='reconciled' WHERE id=?").run('attachment-a');
  assert.equal(db.prepare('SELECT status FROM offline_attachments WHERE id=?').get('attachment-a').status, 'reconciled');
  assert.throws(
    () => db.prepare('UPDATE offline_attachments SET sha256=? WHERE id=?').run('b'.repeat(64), 'attachment-a'),
    /offline_attachment_identity_conflict/,
  );
  db.close();
});

test('an audit failure rolls back metadata but preserves the pre-upload cleanup reservation', () => {
  const db = database();
  db.exec(`
    CREATE TABLE storage_mirror_jobs (id TEXT PRIMARY KEY, source_id TEXT NOT NULL);
    CREATE TABLE audit_logs (id TEXT PRIMARY KEY, action TEXT NOT NULL);
    CREATE TRIGGER reject_attachment_audit
    BEFORE INSERT ON audit_logs
    WHEN NEW.action='attachment_accepted'
    BEGIN
      SELECT RAISE(ABORT, 'qa_attachment_audit_failure');
    END;
  `);
  db.prepare(`
    INSERT INTO offline_attachment_cleanup_jobs(
      id,attachment_id,employee_id,company_id,operation_id,r2_key,sha256
    ) VALUES(?,?,?,?,?,?,?)
  `).run('job-a', 'attachment-a', 'employee-a', 'company-a', 'operation-a', 'offline/a', 'a'.repeat(64));

  assert.throws(() => {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`
        INSERT INTO offline_attachments(
          id,employee_id,company_id,operation_id,r2_key,original_name,mime_type,size_bytes,sha256
        ) VALUES(?,?,?,?,?,?,?,?,?)
      `).run('attachment-a', 'employee-a', 'company-a', 'operation-a', 'offline/a', 'proof.pdf', 'application/pdf', 12, 'a'.repeat(64));
      db.prepare('INSERT INTO storage_mirror_jobs(id,source_id) VALUES(?,?)').run('mirror-a', 'attachment-a');
      db.prepare('INSERT INTO audit_logs(id,action) VALUES(?,?)').run('audit-a', 'attachment_accepted');
      db.prepare('DELETE FROM offline_attachment_cleanup_jobs WHERE id=?').run('job-a');
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }, /qa_attachment_audit_failure/);

  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM offline_attachments').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM storage_mirror_jobs').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM offline_attachment_cleanup_jobs WHERE id=?').get('job-a').count, 1);
  db.close();
});

test('Worker implementation revalidates authorization and receipt around R2 then commits audit atomically', () => {
  const upload = source.slice(source.indexOf('async function uploadAttachment'), source.indexOf('\nexport async function routeOffline'));
  assert.ok(upload.includes("operation_kind='forms.submit'") || source.includes("operation_kind='forms.submit'"));
  assert.ok(source.includes("AND state='completed'"), 'completed parent receipt is required');
  assert.ok((upload.match(/attachmentAuthorization\(/g) || []).length >= 2, 'authorization must be checked before and after R2');
  const reservationAt = upload.indexOf('reserveAttachmentCleanup(');
  const putAt = upload.indexOf('await env.FILES.put(');
  const finalAuthorizationAt = upload.lastIndexOf('attachmentAuthorization(');
  const batchAt = upload.indexOf('await env.DB.batch([');
  assert.ok(reservationAt >= 0 && reservationAt < putAt, 'durable reservation must precede R2');
  assert.ok(putAt < finalAuthorizationAt && finalAuthorizationAt < batchAt, 'fresh commit authorization must follow R2');
  const batch = upload.slice(batchAt, upload.indexOf(']);', batchAt) + 3);
  assert.ok(batch.includes('auditStatement('), 'attachment audit must share the metadata D1 batch');
  assert.ok(batch.includes('DELETE FROM offline_attachment_cleanup_jobs') && batch.includes('lease_token=?'), 'successful D1 batch must clear only its fenced reservation');
  assert.ok(source.includes("reservation.id === candidateId && reservation.leaseToken === candidateToken"), 'only the reservation owner may upload concurrently');
  assert.ok(upload.includes("recoverAttachmentObject(env, reservation, 'metadata_commit_failed')"));
});

test('existing scheduler drains a bounded, leased, fenced cleanup queue without changing cron configuration', () => {
  assert.match(source, /requestedLimit = 25/);
  assert.match(source, /Math\.min\(50/);
  assert.match(source, /lease_token=\?/);
  assert.match(source, /WHERE id=\? AND lease_token=\? AND status='leased'/);
  assert.ok(source.includes("terminal ? 'quarantined' : 'retry'"));
  assert.ok(runtime.includes('processOfflineAttachmentCleanup(env)'));
  assert.ok(runtime.includes('offlineAttachmentCleanup'));
});
