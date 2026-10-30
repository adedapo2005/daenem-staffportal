-- 0102: staging-only V180 public media approvals and immutable publication audit.
-- Additive; do not apply in production. Seed only after verified private R2 import/readback.
-- Owner Studio updates must use an explicitly assigned, current publication grant.
-- Register a sensitive explicit permission. No role receives an automatic grant.
INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive)
VALUES('perm-staffportal-media-publish','staffportal.media.publish','owner_studio','publish',
 'Manage Owner-approved public StaffPortal Sign-In images and audited revocation',1);
-- Rollback: revoke/disable publication rows; retain audit history and private media.
CREATE TABLE IF NOT EXISTS staffportal_v180_media_publication (
  asset_key TEXT PRIMARY KEY NOT NULL,
  id TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('global','widget')),
  purpose TEXT NOT NULL,
  qa_status TEXT NOT NULL CHECK(qa_status IN
    ('approved','approved_v179','pending_review','draft_review','revoked')),
  display_enabled INTEGER NOT NULL CHECK(display_enabled IN (0,1)),
  has_default_image INTEGER NOT NULL CHECK(has_default_image IN (0,1)),
  sort_order INTEGER NOT NULL CHECK(sort_order BETWEEN 0 AND 10000),
  zoom REAL, focal_x REAL, focal_y REAL,
  master_width INTEGER, master_height INTEGER,
  image_r2_key TEXT NOT NULL,
  image_sha256 TEXT NOT NULL CHECK(length(image_sha256)=64),
  image_bytes INTEGER NOT NULL CHECK(image_bytes BETWEEN 1 AND 12000000),
  image_mime TEXT NOT NULL CHECK(image_mime IN ('image/webp','image/png','image/jpeg')),
  publication_version INTEGER NOT NULL DEFAULT 1 CHECK(publication_version>=1),
  changed_by TEXT NOT NULL,
  change_reason TEXT NOT NULL DEFAULT 'initial-approved-snapshot'
    CHECK(length(trim(change_reason)) BETWEEN 12 AND 600),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_staffportal_v180_publication_status
  ON staffportal_v180_media_publication(qa_status,display_enabled,sort_order);
CREATE TABLE IF NOT EXISTS staffportal_v180_media_publication_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_key TEXT NOT NULL,
  old_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  old_enabled INTEGER NOT NULL,
  new_enabled INTEGER NOT NULL,
  publication_version INTEGER NOT NULL,
  changed_by TEXT NOT NULL,
  change_reason TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER IF NOT EXISTS trg_staffportal_v180_publication_update_audit
AFTER UPDATE ON staffportal_v180_media_publication
BEGIN
  INSERT INTO staffportal_v180_media_publication_audit(
    asset_key,old_status,new_status,old_enabled,new_enabled,publication_version,changed_by,change_reason
  ) VALUES(
    OLD.asset_key,OLD.qa_status,NEW.qa_status,
    OLD.display_enabled,NEW.display_enabled,NEW.publication_version,NEW.changed_by,NEW.change_reason
  );
END;
CREATE TRIGGER IF NOT EXISTS trg_staffportal_v180_publication_revision
BEFORE UPDATE ON staffportal_v180_media_publication
WHEN NEW.publication_version <= OLD.publication_version
  OR NEW.changed_by IS NULL OR length(trim(NEW.changed_by))=0
  OR NEW.change_reason IS NULL OR length(trim(NEW.change_reason))<12
BEGIN
  SELECT RAISE(ABORT,'Publication update requires server-authorized revision and actor');
END;
CREATE TRIGGER IF NOT EXISTS trg_staffportal_v180_publication_no_delete
BEFORE DELETE ON staffportal_v180_media_publication
BEGIN
  SELECT RAISE(ABORT,'Archive or revoke publication instead of deleting');
END;
