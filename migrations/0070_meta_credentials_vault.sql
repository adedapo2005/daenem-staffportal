PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta_credentials_vault (
  credential_key TEXT PRIMARY KEY,
  ciphertext TEXT NOT NULL,
  updated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_meta_credentials_vault_updated
  ON meta_credentials_vault(updated_at);
