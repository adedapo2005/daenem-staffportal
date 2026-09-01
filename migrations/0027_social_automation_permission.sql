PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
 ('perm-social-automation','social.automation','social','automation','Configure Social Engine automation guardrails and bot behavior',1);

INSERT OR REPLACE INTO role_permissions(id,role_id,permission_id,access_level)
VALUES
 ('social-owner-automation','role-owner','perm-social-automation','manage'),
 ('social-group-admin-automation','role-group-admin','perm-social-automation','manage');
