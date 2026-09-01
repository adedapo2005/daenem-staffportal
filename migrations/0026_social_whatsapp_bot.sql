PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS social_brand_automation_settings (
  brand_id TEXT PRIMARY KEY REFERENCES social_brands(id) ON DELETE CASCADE,
  whatsapp_order_bot_enabled INTEGER NOT NULL DEFAULT 1 CHECK (whatsapp_order_bot_enabled IN (0,1)),
  whatsapp_handoff_keywords_json TEXT NOT NULL DEFAULT '["human","agent","staff","manager","help"]',
  auto_reply_low_risk_enabled INTEGER NOT NULL DEFAULT 0 CHECK (auto_reply_low_risk_enabled IN (0,1)),
  ai_content_autopublish_enabled INTEGER NOT NULL DEFAULT 0 CHECK (ai_content_autopublish_enabled IN (0,1)),
  ai_content_min_score REAL NOT NULL DEFAULT 0.85,
  ai_ad_optimization_enabled INTEGER NOT NULL DEFAULT 0 CHECK (ai_ad_optimization_enabled IN (0,1)),
  max_daily_ad_change_percent REAL NOT NULL DEFAULT 20,
  quiet_hours_start_local TEXT,
  quiet_hours_end_local TEXT,
  updated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO social_brand_automation_settings(brand_id)
SELECT id FROM social_brands;

CREATE TABLE IF NOT EXISTS social_order_intake_sessions (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES social_conversations(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES social_customers(id) ON DELETE SET NULL,
  state TEXT NOT NULL DEFAULT 'collect_name' CHECK (state IN ('collect_name','collect_location','collect_product','collect_quantity','confirm','complete','cancelled','handoff')),
  customer_name TEXT,
  location_text TEXT,
  product_id TEXT REFERENCES social_products(id) ON DELETE SET NULL,
  product_text TEXT,
  quantity REAL,
  quoted_unit_price_kobo INTEGER,
  order_id TEXT REFERENCES social_orders(id) ON DELETE SET NULL,
  last_inbound_message_id TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_social_order_intake_brand_state ON social_order_intake_sessions(brand_id,state,updated_at DESC);

CREATE TABLE IF NOT EXISTS social_automation_actions (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
  automation_type TEXT NOT NULL CHECK (automation_type IN ('whatsapp_order_bot','ai_reply','ai_publish','ad_optimize','trend_scan','analytics_sync')),
  entity_type TEXT,
  entity_id TEXT,
  decision TEXT NOT NULL,
  confidence REAL,
  input_summary TEXT,
  output_summary TEXT,
  status TEXT NOT NULL DEFAULT 'executed' CHECK (status IN ('suggested','approved','executed','blocked','failed','rolled_back')),
  guardrail_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_social_automation_actions_brand ON social_automation_actions(brand_id,automation_type,created_at DESC);
