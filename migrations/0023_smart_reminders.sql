PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS smart_reminder_log (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  reminder_key TEXT NOT NULL,
  reminder_type TEXT NOT NULL,
  source_type TEXT,
  source_id TEXT,
  stage INTEGER NOT NULL DEFAULT 1,
  reminder_date TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT,
  UNIQUE(employee_id,reminder_key,reminder_date,stage)
);
CREATE INDEX IF NOT EXISTS idx_smart_reminders_employee ON smart_reminder_log(employee_id,reminder_date DESC);

INSERT OR IGNORE INTO app_settings(setting_key,setting_value,value_type) VALUES
 ('notifications.smart_reminders_enabled','true','boolean'),
 ('notifications.clockout_reminder_minutes_after_shift','15','number'),
 ('notifications.overdue_forms_enabled','true','boolean'),
 ('notifications.role_data_reminders_enabled','true','boolean');
