-- 0104: Cloudflare-owned, audited StaffPortal Spotlight/Inspiration publication.
-- Staging review only. Content is not seeded because no authorized approved
-- checkpoint is available in this migration; Owner Studio must create it.
-- The sensitive grant is explicit and receives no automatic role assignment.
INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive)
VALUES('perm-staffportal-content-publish','staffportal.content.publish','owner_studio','publish',
 'Author, publish and revoke StaffPortal Spotlight and Inspiration content',1);

CREATE TABLE IF NOT EXISTS staffportal_staff_content_publication (
  slot TEXT PRIMARY KEY NOT NULL CHECK(slot='current'),
  status TEXT NOT NULL CHECK(status IN ('draft','approved','revoked')),
  publication_version INTEGER NOT NULL CHECK(publication_version>=1),
  spotlight_id TEXT NOT NULL CHECK(length(trim(spotlight_id)) BETWEEN 1 AND 128),
  spotlight_title TEXT NOT NULL CHECK(length(trim(spotlight_title)) BETWEEN 1 AND 300),
  spotlight_body TEXT NOT NULL CHECK(length(trim(spotlight_body)) BETWEEN 1 AND 8000),
  spotlight_category TEXT NOT NULL CHECK(length(trim(spotlight_category)) BETWEEN 1 AND 120),
  inspiration_id TEXT NOT NULL CHECK(length(trim(inspiration_id)) BETWEEN 1 AND 128),
  inspiration_message TEXT NOT NULL CHECK(length(trim(inspiration_message)) BETWEEN 1 AND 4000),
  inspiration_attribution TEXT NOT NULL CHECK(length(trim(inspiration_attribution)) BETWEEN 1 AND 300),
  inspiration_category TEXT NOT NULL CHECK(length(trim(inspiration_category)) BETWEEN 1 AND 120),
  provider TEXT NOT NULL CHECK(provider='owner-authored'),
  provider_connected INTEGER NOT NULL DEFAULT 0 CHECK(provider_connected=0),
  interval_started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  change_reason TEXT NOT NULL CHECK(length(trim(change_reason)) BETWEEN 12 AND 400),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(datetime(interval_started_at) IS NOT NULL AND datetime(expires_at) IS NOT NULL AND datetime(expires_at)>datetime(interval_started_at))
);

CREATE TABLE IF NOT EXISTS staffportal_staff_content_publication_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slot TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  publication_version INTEGER NOT NULL,
  actor_employee_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER IF NOT EXISTS trg_staffportal_staff_content_insert_audit
AFTER INSERT ON staffportal_staff_content_publication
BEGIN
  INSERT INTO staffportal_staff_content_publication_audit(slot,new_status,publication_version,actor_employee_id,reason)
  VALUES(NEW.slot,NEW.status,NEW.publication_version,NEW.changed_by,NEW.change_reason);
END;
CREATE TRIGGER IF NOT EXISTS trg_staffportal_staff_content_update_audit
AFTER UPDATE ON staffportal_staff_content_publication
BEGIN
  INSERT INTO staffportal_staff_content_publication_audit(slot,old_status,new_status,publication_version,actor_employee_id,reason)
  VALUES(OLD.slot,OLD.status,NEW.status,NEW.publication_version,NEW.changed_by,NEW.change_reason);
END;
CREATE TRIGGER IF NOT EXISTS trg_staffportal_staff_content_revision
BEFORE UPDATE ON staffportal_staff_content_publication
WHEN NEW.publication_version<=OLD.publication_version OR NEW.changed_by IS NULL OR length(trim(NEW.changed_by))=0
  OR NEW.change_reason IS NULL OR length(trim(NEW.change_reason))<12
BEGIN
  SELECT RAISE(ABORT,'Staff content update requires authorized revision and actor');
END;
CREATE TRIGGER IF NOT EXISTS trg_staffportal_staff_content_no_delete
BEFORE DELETE ON staffportal_staff_content_publication
BEGIN
  SELECT RAISE(ABORT,'Revoke staff content instead of deleting');
END;
CREATE TRIGGER IF NOT EXISTS trg_staffportal_staff_content_audit_no_update
BEFORE UPDATE ON staffportal_staff_content_publication_audit
BEGIN
  SELECT RAISE(ABORT,'Staff content audit is immutable');
END;
CREATE TRIGGER IF NOT EXISTS trg_staffportal_staff_content_audit_no_delete
BEFORE DELETE ON staffportal_staff_content_publication_audit
BEGIN
  SELECT RAISE(ABORT,'Staff content audit is immutable');
END;
