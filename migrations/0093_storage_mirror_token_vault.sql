PRAGMA foreign_keys = ON;

-- OAuth tokens are stored separately from public Admin read models and remain
-- unusable until the official Microsoft authorization flow is owner-enabled.
CREATE TABLE IF NOT EXISTS storage_mirror_oauth_tokens (
  id TEXT PRIMARY KEY CHECK (id = 'microsoft_onedrive'),
  access_token_ciphertext TEXT NOT NULL,
  refresh_token_ciphertext TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
