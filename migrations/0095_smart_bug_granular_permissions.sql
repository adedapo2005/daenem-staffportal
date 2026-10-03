PRAGMA foreign_keys = ON;

-- Split Smart Bug Management read, diagnostics, integrity and detector authority.
-- No detector or remediation is enabled by these grants.
INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
  ('perm-smart-bug-incidents','smart_bug.incidents','smart_bug','view','View authorized Smart Bug incidents',1),
  ('perm-smart-bug-diagnostics','smart_bug.diagnostics','smart_bug','view','View authorized Smart Bug diagnostic evidence',1),
  ('perm-smart-bug-integrity','smart_bug.integrity','smart_bug','view','View authorized Smart Bug integrity findings',1),
  ('perm-smart-bug-detectors','smart_bug.detectors','smart_bug','edit','Run approved read-only Smart Bug detectors',1),
  ('perm-smart-bug-cross-company','smart_bug.cross_company','smart_bug','view','View Smart Bug data across companies',1);

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-owner-smart-bug-incidents','role-owner','perm-smart-bug-incidents','manage'
WHERE EXISTS(SELECT 1 FROM roles WHERE id='role-owner');
INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-owner-smart-bug-diagnostics','role-owner','perm-smart-bug-diagnostics','manage'
WHERE EXISTS(SELECT 1 FROM roles WHERE id='role-owner');
INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-owner-smart-bug-integrity','role-owner','perm-smart-bug-integrity','manage'
WHERE EXISTS(SELECT 1 FROM roles WHERE id='role-owner');
INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-owner-smart-bug-detectors','role-owner','perm-smart-bug-detectors','manage'
WHERE EXISTS(SELECT 1 FROM roles WHERE id='role-owner');
INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-owner-smart-bug-cross-company','role-owner','perm-smart-bug-cross-company','manage'
WHERE EXISTS(SELECT 1 FROM roles WHERE id='role-owner');
