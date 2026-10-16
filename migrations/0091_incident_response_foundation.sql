PRAGMA foreign_keys = ON;
INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
 ('perm-incidents-access','incidents.access','incidents','access','Create and view authorized safety incidents',1),
 ('perm-incidents-location','incidents.location','incidents','manage','Share and view incident-scoped location',1);
