PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS social_oauth_states (
  id TEXT PRIMARY KEY,
  state_hash TEXT NOT NULL UNIQUE,
  brand_id TEXT NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram','tiktok','x','whatsapp')),
  onboarding_request_id TEXT REFERENCES social_onboarding_requests(id) ON DELETE SET NULL,
  redirect_uri TEXT NOT NULL,
  code_verifier_ciphertext TEXT,
  requested_scopes_json TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_social_oauth_states_expiry ON social_oauth_states(platform,expires_at,used_at);

CREATE TABLE IF NOT EXISTS social_oauth_candidates (
  id TEXT PRIMARY KEY,
  oauth_state_id TEXT NOT NULL REFERENCES social_oauth_states(id) ON DELETE CASCADE,
  brand_id TEXT NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram','whatsapp')),
  platform_account_id TEXT NOT NULL,
  platform_business_id TEXT,
  display_name TEXT,
  handle TEXT,
  token_ciphertext TEXT,
  metadata_json TEXT,
  selected_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(oauth_state_id,platform,platform_account_id)
);
CREATE INDEX IF NOT EXISTS idx_social_oauth_candidates_brand ON social_oauth_candidates(brand_id,platform,selected_at,created_at DESC);
