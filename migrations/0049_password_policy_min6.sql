PRAGMA foreign_keys = ON;

-- Keep every permanent Staff Portal password path on one simple policy:
-- minimum 6 characters, maximum 128 characters. Application validation still
-- rejects the small deny-list of known/common passwords. Character-class
-- composition is guidance only and is not a hard requirement.
INSERT INTO app_settings(setting_key, setting_value, value_type, updated_at)
VALUES('security.password_min_length', '6', 'number', CURRENT_TIMESTAMP)
ON CONFLICT(setting_key) DO UPDATE SET
  setting_value='6',
  value_type='number',
  updated_at=CURRENT_TIMESTAMP;

INSERT INTO app_settings(setting_key, setting_value, value_type, updated_at)
VALUES('security.password_policy_version', 'min6-common-block-v1', 'string', CURRENT_TIMESTAMP)
ON CONFLICT(setting_key) DO UPDATE SET
  setting_value='min6-common-block-v1',
  value_type='string',
  updated_at=CURRENT_TIMESTAMP;
