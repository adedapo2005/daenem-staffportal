PRAGMA foreign_keys = ON;

-- Provider-backed analytics/community/ads synchronization for Daenem Social Engine.
-- Tokens remain encrypted in social_platform_connections; this migration stores only derived metrics/status.

CREATE TABLE IF NOT EXISTS social_provider_connection_state (
  connection_id TEXT PRIMARY KEY REFERENCES social_platform_connections(id) ON DELETE CASCADE,
  brand_id TEXT NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram','tiktok','x','whatsapp')),
  profile_capability TEXT NOT NULL DEFAULT 'unknown' CHECK (profile_capability IN ('unknown','ready','missing_scope','unsupported','error')),
  analytics_capability TEXT NOT NULL DEFAULT 'unknown' CHECK (analytics_capability IN ('unknown','ready','missing_scope','unsupported','error')),
  community_capability TEXT NOT NULL DEFAULT 'unknown' CHECK (community_capability IN ('unknown','ready','missing_scope','webhook','unsupported','error')),
  ads_capability TEXT NOT NULL DEFAULT 'unknown' CHECK (ads_capability IN ('unknown','ready','missing_scope','account_required','unsupported','error')),
  granted_scopes_json TEXT,
  missing_scopes_json TEXT,
  last_profile_sync_at TEXT,
  last_analytics_sync_at TEXT,
  last_community_event_at TEXT,
  last_ads_sync_at TEXT,
  next_sync_at TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_social_provider_state_due ON social_provider_connection_state(next_sync_at,platform,analytics_capability);
CREATE INDEX IF NOT EXISTS idx_social_provider_state_brand ON social_provider_connection_state(brand_id,platform);

CREATE TABLE IF NOT EXISTS social_provider_sync_runs (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
  connection_id TEXT REFERENCES social_platform_connections(id) ON DELETE SET NULL,
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram','tiktok','x','whatsapp','first_party')),
  sync_kind TEXT NOT NULL CHECK (sync_kind IN ('profile','analytics','community','ads','full')),
  trigger_source TEXT NOT NULL DEFAULT 'scheduled' CHECK (trigger_source IN ('scheduled','manual','webhook','system')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','partial','skipped','failed')),
  records_read INTEGER NOT NULL DEFAULT 0,
  records_written INTEGER NOT NULL DEFAULT 0,
  warnings_json TEXT,
  error_text TEXT,
  started_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_social_provider_runs_brand ON social_provider_sync_runs(brand_id,started_at DESC,platform,sync_kind);

CREATE TABLE IF NOT EXISTS social_post_metrics_daily (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
  connection_id TEXT REFERENCES social_platform_connections(id) ON DELETE SET NULL,
  content_variant_id TEXT REFERENCES social_content_variants(id) ON DELETE SET NULL,
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram','tiktok','x')),
  external_post_id TEXT NOT NULL,
  metric_date TEXT NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  reach INTEGER NOT NULL DEFAULT 0,
  video_views INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  saves INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  engagements INTEGER NOT NULL DEFAULT 0,
  source_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(platform,external_post_id,metric_date)
);
CREATE INDEX IF NOT EXISTS idx_social_post_metrics_brand ON social_post_metrics_daily(brand_id,metric_date DESC,platform);

CREATE TABLE IF NOT EXISTS social_ad_provider_state (
  social_ad_campaign_id TEXT PRIMARY KEY REFERENCES social_ad_campaigns(id) ON DELETE CASCADE,
  brand_id TEXT NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram','tiktok','x')),
  external_campaign_id TEXT,
  external_adset_id TEXT,
  external_creative_id TEXT,
  external_ad_id TEXT,
  provider_status TEXT,
  provider_effective_status TEXT,
  spend_kobo INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  reach INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  launch_guard_state TEXT NOT NULL DEFAULT 'blocked' CHECK (launch_guard_state IN ('blocked','campaign_shell_paused','ready_for_final_approval','live','closed')),
  last_provider_sync_at TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_social_ad_provider_brand ON social_ad_provider_state(brand_id,platform,provider_effective_status);

CREATE TABLE IF NOT EXISTS social_marketing_briefs (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  ai_analysis TEXT,
  generated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_social_marketing_briefs_brand ON social_marketing_briefs(brand_id,generated_at DESC);
