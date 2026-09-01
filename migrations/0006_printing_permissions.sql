PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO role_permissions (id, role_id, permission_id, access_level) VALUES
  ('print-manager-dashboard', 'role-print-manager', 'perm-dashboard', 'view'),
  ('print-manager-users', 'role-print-manager', 'perm-users', 'view'),
  ('print-manager-inventory', 'role-print-manager', 'perm-inventory', 'manage'),
  ('print-manager-procurement', 'role-print-manager', 'perm-procurement', 'approve'),
  ('print-manager-sales', 'role-print-manager', 'perm-sales', 'manage'),
  ('print-manager-forms', 'role-print-manager', 'perm-forms', 'approve'),
  ('print-manager-facilities', 'role-print-manager', 'perm-facilities', 'edit'),
  ('print-manager-broadcasts', 'role-print-manager', 'perm-broadcasts', 'create'),

  ('print-accountant-dashboard', 'role-print-accountant', 'perm-dashboard', 'view'),
  ('print-accountant-finance', 'role-print-accountant', 'perm-finance', 'manage'),
  ('print-accountant-sales', 'role-print-accountant', 'perm-sales', 'manage'),
  ('print-accountant-inventory', 'role-print-accountant', 'perm-inventory', 'view'),
  ('print-accountant-procurement', 'role-print-accountant', 'perm-procurement', 'view'),
  ('print-accountant-payroll', 'role-print-accountant', 'perm-payroll', 'view'),

  ('print-operator-inventory', 'role-print-large-format', 'perm-inventory', 'view'),
  ('print-operator-forms', 'role-print-large-format', 'perm-forms', 'create'),

  ('print-designer-forms', 'role-print-designer', 'perm-forms', 'create'),
  ('print-designer-sales', 'role-print-designer', 'perm-sales', 'view'),

  ('print-marketer-dashboard', 'role-print-marketer', 'perm-dashboard', 'view'),
  ('print-marketer-sales', 'role-print-marketer', 'perm-sales', 'create'),
  ('print-marketer-inventory', 'role-print-marketer', 'perm-inventory', 'view'),
  ('print-marketer-forms', 'role-print-marketer', 'perm-forms', 'create');
