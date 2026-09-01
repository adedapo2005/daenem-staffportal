PRAGMA foreign_keys = ON;

ALTER TABLE workforce_broadcasts ADD COLUMN expires_at TEXT;

CREATE INDEX IF NOT EXISTS idx_workforce_broadcasts_delivery_window
  ON workforce_broadcasts(status, scheduled_for, expires_at, created_at DESC);

INSERT OR IGNORE INTO app_settings (setting_key, setting_value, value_type) VALUES
  ('broadcast.offline_notice_cache_enabled', 'true', 'boolean'),
  ('broadcast.scheduled_delivery_enabled', 'true', 'boolean'),
  ('broadcast.default_expiry_days', '30', 'number'),
  ('broadcast.emergency_force_push', 'true', 'boolean'),
  ('broadcast.emergency_force_acknowledgement', 'true', 'boolean'),
  ('ai.guide_permission_catalog_enabled', 'true', 'boolean');
