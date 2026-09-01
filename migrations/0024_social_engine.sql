PRAGMA foreign_keys = ON;

-- Daenem Social Engine: centralized multi-brand social media, marketing, commerce and analytics.
-- Platform passwords are intentionally never stored. OAuth/business onboarding tokens are encrypted
-- by the Worker before persistence and are represented here only as ciphertext fields.

CREATE TABLE IF NOT EXISTS social_brands (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  short_name TEXT,
  primary_market TEXT NOT NULL DEFAULT 'Nigeria',
  timezone TEXT NOT NULL DEFAULT 'Africa/Lagos',
  locale TEXT NOT NULL DEFAULT 'en-NG',
  tone_profile_json TEXT,
  default_cta TEXT,
  default_whatsapp_phone TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_social_brands_company ON social_brands(company_id, active);

CREATE TABLE IF NOT EXISTS social_platform_connections (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram','tiktok','x','whatsapp')),
  account_type TEXT NOT NULL DEFAULT 'business',
  platform_account_id TEXT,
  platform_business_id TEXT,
  platform_ad_account_id TEXT,
  platform_catalog_id TEXT,
  handle TEXT,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'not_connected' CHECK (status IN ('not_connected','onboarding','connected','reauthorization_required','suspended','error')),
  onboarding_mode TEXT NOT NULL DEFAULT 'oauth' CHECK (onboarding_mode IN ('oauth','embedded_signup','guided_external')),
  scopes_json TEXT,
  access_token_ciphertext TEXT,
  refresh_token_ciphertext TEXT,
  token_expires_at TEXT,
  webhook_verified_at TEXT,
  last_sync_at TEXT,
  last_error TEXT,
  metadata_json TEXT,
  connected_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(brand_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_social_connections_status ON social_platform_connections(platform, status);

CREATE TABLE IF NOT EXISTS social_onboarding_requests (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram','tiktok','x','whatsapp')),
  business_email TEXT,
  business_phone TEXT,
  business_name TEXT NOT NULL,
  website_url TEXT,
  verification_details_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','owner_action_required','provider_review','ready_to_connect','connected','blocked','cancelled')),
  next_step_code TEXT,
  next_step_text TEXT,
  provider_reference TEXT,
  requested_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_social_onboarding_brand ON social_onboarding_requests(brand_id, platform, status, created_at DESC);

CREATE TABLE IF NOT EXISTS social_campaigns (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  objective TEXT NOT NULL DEFAULT 'engagement',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','planned','active','paused','completed','cancelled')),
  start_date TEXT,
  end_date TEXT,
  budget_kobo INTEGER NOT NULL DEFAULT 0,
  target_locations_json TEXT,
  target_audience_json TEXT,
  utm_campaign TEXT,
  notes TEXT,
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_social_campaigns_brand ON social_campaigns(brand_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS social_content_items (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
  campaign_id TEXT REFERENCES social_campaigns(id) ON DELETE SET NULL,
  title TEXT,
  content_type TEXT NOT NULL DEFAULT 'post' CHECK (content_type IN ('post','image','carousel','video','reel','story','offer','product','announcement')),
  source_mode TEXT NOT NULL DEFAULT 'manual' CHECK (source_mode IN ('manual','ai','ai_assisted','repurposed')),
  master_caption TEXT NOT NULL DEFAULT '',
  creative_brief TEXT,
  target_url TEXT,
  product_id TEXT,
  tone TEXT NOT NULL DEFAULT 'natural_nigerian',
  ai_model TEXT,
  ai_generated INTEGER NOT NULL DEFAULT 0 CHECK (ai_generated IN (0,1)),
  disclosure_required INTEGER NOT NULL DEFAULT 0 CHECK (disclosure_required IN (0,1)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ai_draft','pending_approval','approved','scheduled','publishing','published','partially_published','failed','rejected','cancelled')),
  scheduled_for TEXT,
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_at TEXT,
  rejected_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_social_content_brand_status ON social_content_items(brand_id, status, scheduled_for);

CREATE TABLE IF NOT EXISTS social_media_assets (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
  content_item_id TEXT REFERENCES social_content_items(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image','video','document','audio')),
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  duration_seconds REAL,
  alt_text TEXT,
  source TEXT NOT NULL DEFAULT 'upload' CHECK (source IN ('upload','ai_generated','brand_library','imported')),
  metadata_json TEXT,
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_social_assets_content ON social_media_assets(content_item_id, created_at);

CREATE TABLE IF NOT EXISTS social_content_variants (
  id TEXT PRIMARY KEY,
  content_item_id TEXT NOT NULL REFERENCES social_content_items(id) ON DELETE CASCADE,
  connection_id TEXT REFERENCES social_platform_connections(id) ON DELETE SET NULL,
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram','tiktok','x','whatsapp')),
  caption TEXT NOT NULL DEFAULT '',
  hashtags_json TEXT,
  media_json TEXT,
  platform_options_json TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','queued','publishing','published','failed','skipped')),
  scheduled_for TEXT,
  external_post_id TEXT,
  external_permalink TEXT,
  published_at TEXT,
  last_error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(content_item_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_social_variants_schedule ON social_content_variants(status, scheduled_for);

CREATE TABLE IF NOT EXISTS social_ai_suggestions (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
  suggestion_type TEXT NOT NULL CHECK (suggestion_type IN ('post_idea','caption','hashtag','trend','audience','ad_budget','boost','pause_ad','reply','content_score')),
  title TEXT,
  suggestion_json TEXT NOT NULL,
  confidence REAL,
  rationale TEXT,
  source_model TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','accepted','dismissed','expired','executed')),
  created_for_date TEXT,
  reviewed_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_social_ai_brand ON social_ai_suggestions(brand_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS social_products (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
  internal_source_type TEXT,
  internal_source_id TEXT,
  sku TEXT,
  name TEXT NOT NULL,
  description TEXT,
  unit_label TEXT,
  price_kobo INTEGER NOT NULL DEFAULT 0,
  compare_at_price_kobo INTEGER,
  currency TEXT NOT NULL DEFAULT 'NGN',
  whatsapp_order_enabled INTEGER NOT NULL DEFAULT 1 CHECK (whatsapp_order_enabled IN (0,1)),
  image_r2_key TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','out_of_stock','hidden','discontinued')),
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(brand_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_social_products_brand ON social_products(brand_id, status, name);

CREATE TABLE IF NOT EXISTS social_customers (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
  name TEXT,
  phone TEXT,
  whatsapp_id TEXT,
  email TEXT,
  city TEXT,
  state TEXT,
  country_code TEXT,
  first_source TEXT,
  consent_marketing INTEGER NOT NULL DEFAULT 0 CHECK (consent_marketing IN (0,1)),
  consent_recorded_at TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_social_customers_brand_phone ON social_customers(brand_id, phone);

CREATE TABLE IF NOT EXISTS social_orders (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES social_customers(id) ON DELETE SET NULL,
  source_platform TEXT NOT NULL DEFAULT 'whatsapp' CHECK (source_platform IN ('facebook','instagram','tiktok','x','whatsapp','website','manual')),
  source_conversation_id TEXT,
  order_no TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','confirmed','assigned','processing','ready','out_for_delivery','completed','cancelled','refunded')),
  currency TEXT NOT NULL DEFAULT 'NGN',
  subtotal_kobo INTEGER NOT NULL DEFAULT 0,
  delivery_kobo INTEGER NOT NULL DEFAULT 0,
  discount_kobo INTEGER NOT NULL DEFAULT 0,
  total_kobo INTEGER NOT NULL DEFAULT 0,
  delivery_address TEXT,
  delivery_city TEXT,
  delivery_state TEXT,
  assigned_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','part_paid','paid','refunded')),
  customer_notes TEXT,
  internal_notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_social_orders_brand_status ON social_orders(brand_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS social_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES social_orders(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES social_products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price_kobo INTEGER NOT NULL DEFAULT 0,
  line_total_kobo INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS social_conversations (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
  connection_id TEXT REFERENCES social_platform_connections(id) ON DELETE SET NULL,
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram','tiktok','x','whatsapp')),
  external_thread_id TEXT,
  customer_id TEXT REFERENCES social_customers(id) ON DELETE SET NULL,
  customer_display_name TEXT,
  customer_handle TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','waiting_customer','resolved','archived','spam')),
  assigned_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  ai_reply_mode TEXT NOT NULL DEFAULT 'suggest' CHECK (ai_reply_mode IN ('off','suggest','auto_low_risk')),
  last_message_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(platform, external_thread_id)
);

CREATE INDEX IF NOT EXISTS idx_social_conversations_brand ON social_conversations(brand_id, status, last_message_at DESC);

CREATE TABLE IF NOT EXISTS social_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES social_conversations(id) ON DELETE CASCADE,
  external_message_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer','employee','ai','system')),
  sender_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  message_type TEXT NOT NULL DEFAULT 'text',
  text_body TEXT,
  media_json TEXT,
  ai_generated INTEGER NOT NULL DEFAULT 0 CHECK (ai_generated IN (0,1)),
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','draft','queued','sent','delivered','read','failed')),
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT,
  UNIQUE(external_message_id)
);

CREATE INDEX IF NOT EXISTS idx_social_messages_thread ON social_messages(conversation_id, occurred_at);

CREATE TABLE IF NOT EXISTS social_analytics_daily (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
  connection_id TEXT REFERENCES social_platform_connections(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram','tiktok','x','whatsapp','first_party')),
  metric_date TEXT NOT NULL,
  followers INTEGER NOT NULL DEFAULT 0,
  follower_change INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  reach INTEGER NOT NULL DEFAULT 0,
  profile_views INTEGER NOT NULL DEFAULT 0,
  engagements INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  messages_started INTEGER NOT NULL DEFAULT 0,
  orders INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  revenue_kobo INTEGER NOT NULL DEFAULT 0,
  spend_kobo INTEGER NOT NULL DEFAULT 0,
  audience_json TEXT,
  source_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(brand_id, platform, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_social_analytics_brand_date ON social_analytics_daily(brand_id, metric_date DESC, platform);

-- First-party events are limited to Daenem-owned surfaces and explicit/appropriate consent.
-- Raw IP addresses and browser fingerprints are intentionally not stored here.
CREATE TABLE IF NOT EXISTS social_first_party_events (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  event_type TEXT NOT NULL CHECK (event_type IN ('page_view','cta_click','whatsapp_click','product_view','add_to_cart','lead','order_started','purchase','form_submit','heatmap_click')),
  visitor_hash TEXT,
  session_hash TEXT,
  consent_state TEXT NOT NULL DEFAULT 'unknown' CHECK (consent_state IN ('unknown','essential','analytics','marketing')),
  page_path TEXT,
  element_key TEXT,
  x_percent REAL,
  y_percent REAL,
  referrer_host TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  device_type TEXT,
  country_code TEXT,
  region TEXT,
  city TEXT,
  order_id TEXT REFERENCES social_orders(id) ON DELETE SET NULL,
  value_kobo INTEGER,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_social_events_brand_time ON social_first_party_events(brand_id, occurred_at DESC, event_type);
CREATE INDEX IF NOT EXISTS idx_social_events_campaign ON social_first_party_events(brand_id, utm_campaign, occurred_at DESC);

CREATE TABLE IF NOT EXISTS social_ad_campaigns (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram','tiktok','x')),
  connection_id TEXT REFERENCES social_platform_connections(id) ON DELETE SET NULL,
  campaign_id TEXT REFERENCES social_campaigns(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  objective TEXT NOT NULL,
  target_locations_json TEXT,
  target_audience_json TEXT,
  daily_budget_kobo INTEGER NOT NULL DEFAULT 0,
  lifetime_budget_kobo INTEGER NOT NULL DEFAULT 0,
  ai_optimization_enabled INTEGER NOT NULL DEFAULT 0 CHECK (ai_optimization_enabled IN (0,1)),
  max_daily_change_percent REAL NOT NULL DEFAULT 20,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','active','paused','completed','failed')),
  external_campaign_id TEXT,
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  approved_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_social_ads_brand ON social_ad_campaigns(brand_id, status, platform, created_at DESC);

CREATE TABLE IF NOT EXISTS social_ad_performance_daily (
  id TEXT PRIMARY KEY,
  social_ad_campaign_id TEXT NOT NULL REFERENCES social_ad_campaigns(id) ON DELETE CASCADE,
  metric_date TEXT NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  reach INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  spend_kobo INTEGER NOT NULL DEFAULT 0,
  revenue_kobo INTEGER NOT NULL DEFAULT 0,
  raw_metrics_json TEXT,
  UNIQUE(social_ad_campaign_id, metric_date)
);

CREATE TABLE IF NOT EXISTS social_dispatch_jobs (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES social_brands(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('publish_content','sync_analytics','sync_messages','send_message','ad_action','catalog_sync')),
  entity_id TEXT,
  platform TEXT,
  payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','retry','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  completed_at TEXT,
  last_error TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_social_dispatch_ready ON social_dispatch_jobs(status, available_at, created_at);

CREATE TABLE IF NOT EXISTS social_webhook_events (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  connection_id TEXT REFERENCES social_platform_connections(id) ON DELETE SET NULL,
  external_event_id TEXT,
  event_type TEXT,
  signature_verified INTEGER NOT NULL DEFAULT 0 CHECK (signature_verified IN (0,1)),
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','processed','ignored','failed')),
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT,
  last_error TEXT,
  UNIQUE(platform, external_event_id)
);

-- Six Daenem brands. Farms participates in Social Engine only and remains outside Workforce ERP company data.
INSERT OR IGNORE INTO social_brands(id,company_id,code,name,short_name,primary_market,tone_profile_json,default_cta) VALUES
 ('social-brand-farms',NULL,'farms','Daenem Farms','Farms','Nigeria','{"voice":"warm, trustworthy, practical Nigerian English","avoid":["robotic wording","excessive emojis","overpromising"],"themes":["fresh food","farm operations","wholesale supply","community"]}','Send us a message to place your order.'),
 ('social-brand-printing','company-printing','printing','Daenem Printing & Technology','Printing','Nigeria','{"voice":"confident, creative, professional Nigerian English","avoid":["robotic wording","generic AI phrases"],"themes":["print quality","fast turnaround","branding","business growth"]}','Send your design or request a quote today.'),
 ('social-brand-bakery','company-bakery','bakery','Daenem Bakery','Bakery','Nigeria','{"voice":"fresh, friendly, appetizing Nigerian English","avoid":["robotic wording","overclaiming freshness"],"themes":["bread","snacks","daily production","retail and wholesale"]}','Fresh stock available — send us a message to order.'),
 ('social-brand-autos','company-autos','autos','Daenem Autos','Autos','Nigeria','{"voice":"straightforward, credible, sales-focused Nigerian English","avoid":["fake urgency","unverified vehicle claims"],"themes":["vehicle stock","inspections","deals","ownership"]}','Message us for price, inspection and availability.'),
 ('social-brand-properties','company-properties','properties','Daenem Homes & Properties','Properties','Nigeria','{"voice":"professional, reassuring, location-aware Nigerian English","avoid":["guaranteed returns","unverified claims"],"themes":["property listings","inspections","land","rentals"]}','Book an inspection or send us an enquiry.'),
 ('social-brand-logistics','company-logistics','logistics','Daenem Logistics','Logistics','Nigeria','{"voice":"reliable, clear, service-focused Nigerian English","avoid":["unrealistic delivery promises"],"themes":["dispatch","haulage","delivery","fleet reliability"]}','Send pickup and delivery details for a quote.');

-- Granular Social Engine permissions. Access is still constrained by brand/company membership in the API.
INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
 ('perm-social-access','social.access','social','access','Open Daenem Social Engine for authorized brands',0),
 ('perm-social-content','social.content','social','content','Create and edit social content drafts',0),
 ('perm-social-approve','social.approve','social','approve','Approve or reject social content before publishing',1),
 ('perm-social-publish','social.publish','social','publish','Schedule and publish approved social content',1),
 ('perm-social-ai','social.ai','social','ai','Use AI content, trend and reply assistance',0),
 ('perm-social-community','social.community','social','community','Manage comments, direct messages and social conversations',1),
 ('perm-social-analytics','social.analytics','social','analytics','View social growth, audience and conversion analytics',1),
 ('perm-social-commerce','social.commerce','social','commerce','Manage social product catalogs and commerce settings',1),
 ('perm-social-orders','social.orders','social','orders','View, assign and update social/WhatsApp orders',1),
 ('perm-social-ads','social.ads','social','ads','Create, approve and optimize paid social campaigns',1),
 ('perm-social-connections','social.connections','social','connections','Connect and authorize brand social accounts',1),
 ('perm-social-logs','social.logs','social','logs','View social automation, webhook and publishing logs',1);

INSERT OR REPLACE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'social-owner-' || p.id,'role-owner',p.id,'manage'
FROM permissions p WHERE p.module='social';

INSERT OR REPLACE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'social-group-admin-' || p.id,'role-group-admin',p.id,'manage'
FROM permissions p WHERE p.module='social';

-- Sensible brand-role defaults; Owner can override every permission per employee.
INSERT OR REPLACE INTO role_permissions(id,role_id,permission_id,access_level) VALUES
 ('social-print-manager-access','role-print-manager','perm-social-access','view'),
 ('social-print-manager-content','role-print-manager','perm-social-content','manage'),
 ('social-print-manager-approve','role-print-manager','perm-social-approve','approve'),
 ('social-print-manager-publish','role-print-manager','perm-social-publish','manage'),
 ('social-print-manager-ai','role-print-manager','perm-social-ai','manage'),
 ('social-print-manager-community','role-print-manager','perm-social-community','manage'),
 ('social-print-manager-analytics','role-print-manager','perm-social-analytics','view'),
 ('social-print-manager-commerce','role-print-manager','perm-social-commerce','manage'),
 ('social-print-manager-orders','role-print-manager','perm-social-orders','manage'),
 ('social-print-manager-ads','role-print-manager','perm-social-ads','approve'),
 ('social-print-marketer-access','role-print-marketer','perm-social-access','view'),
 ('social-print-marketer-content','role-print-marketer','perm-social-content','edit'),
 ('social-print-marketer-publish','role-print-marketer','perm-social-publish','create'),
 ('social-print-marketer-ai','role-print-marketer','perm-social-ai','create'),
 ('social-print-marketer-community','role-print-marketer','perm-social-community','edit'),
 ('social-print-marketer-analytics','role-print-marketer','perm-social-analytics','view'),
 ('social-print-marketer-commerce','role-print-marketer','perm-social-commerce','view'),
 ('social-print-marketer-orders','role-print-marketer','perm-social-orders','edit'),
 ('social-bakery-manager-access','role-bakery-manager','perm-social-access','view'),
 ('social-bakery-manager-content','role-bakery-manager','perm-social-content','manage'),
 ('social-bakery-manager-approve','role-bakery-manager','perm-social-approve','approve'),
 ('social-bakery-manager-publish','role-bakery-manager','perm-social-publish','manage'),
 ('social-bakery-manager-ai','role-bakery-manager','perm-social-ai','manage'),
 ('social-bakery-manager-community','role-bakery-manager','perm-social-community','manage'),
 ('social-bakery-manager-analytics','role-bakery-manager','perm-social-analytics','view'),
 ('social-bakery-manager-commerce','role-bakery-manager','perm-social-commerce','manage'),
 ('social-bakery-manager-orders','role-bakery-manager','perm-social-orders','manage'),
 ('social-autos-manager-access','role-autos-manager','perm-social-access','view'),
 ('social-autos-manager-content','role-autos-manager','perm-social-content','manage'),
 ('social-autos-manager-approve','role-autos-manager','perm-social-approve','approve'),
 ('social-autos-manager-publish','role-autos-manager','perm-social-publish','manage'),
 ('social-autos-manager-ai','role-autos-manager','perm-social-ai','manage'),
 ('social-autos-manager-community','role-autos-manager','perm-social-community','manage'),
 ('social-autos-manager-analytics','role-autos-manager','perm-social-analytics','view'),
 ('social-autos-manager-orders','role-autos-manager','perm-social-orders','manage'),
 ('social-autos-manager-ads','role-autos-manager','perm-social-ads','approve'),
 ('social-logistics-fleet-access','role-logistics-fleet','perm-social-access','view'),
 ('social-logistics-fleet-content','role-logistics-fleet','perm-social-content','edit'),
 ('social-logistics-fleet-ai','role-logistics-fleet','perm-social-ai','create'),
 ('social-logistics-fleet-community','role-logistics-fleet','perm-social-community','edit'),
 ('social-logistics-fleet-analytics','role-logistics-fleet','perm-social-analytics','view'),
 ('social-properties-agent-access','role-properties-agent','perm-social-access','view'),
 ('social-properties-agent-content','role-properties-agent','perm-social-content','create'),
 ('social-properties-agent-ai','role-properties-agent','perm-social-ai','create'),
 ('social-properties-agent-community','role-properties-agent','perm-social-community','edit'),
 ('social-properties-agent-analytics','role-properties-agent','perm-social-analytics','view');
