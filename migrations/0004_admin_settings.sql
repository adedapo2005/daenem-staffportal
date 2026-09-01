PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO app_settings (setting_key, setting_value, value_type) VALUES
  ('ui.forced_theme', '', 'string'),
  ('ui.default_theme', 'executive', 'string'),
  ('security.require_owner_location_for_login', 'false', 'boolean'),
  ('notifications.incomplete_attendance_reminder', 'true', 'boolean'),
  ('notifications.role_data_reminders', 'true', 'boolean'),
  ('notifications.escalate_overdue_to_manager', 'true', 'boolean'),
  ('ai.smart_exception_detection', 'true', 'boolean');
