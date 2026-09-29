PRAGMA foreign_keys = ON;

-- Microsoft OAuth app configuration is encrypted and remains disconnected
-- until a separate authorization flow is explicitly enabled.
CREATE TABLE IF NOT EXISTS storage_mirror_oauth_config (
  id TEXT PRIMARY KEY CHECK (id = 'microsoft_onedrive'),
  tenant_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_secret_ciphertext TEXT NOT NULL,
  updated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
