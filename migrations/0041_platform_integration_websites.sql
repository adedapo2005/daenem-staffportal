PRAGMA foreign_keys = ON;

-- Connection metadata only. Secret values remain Cloudflare Worker secrets and
-- are never stored in D1 or returned to the browser.
CREATE TABLE IF NOT EXISTS integration_connections (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  connection_key TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('website','email','messaging','payment','weather','ai','storage','social','other')),
  provider TEXT,
  purpose TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'production' CHECK (environment IN ('development','staging','production')),
  auth_type TEXT NOT NULL DEFAULT 'worker_secret' CHECK (auth_type IN ('none','worker_secret','oauth','service_binding','webhook_signature')),
  secret_binding_name TEXT,
  endpoint_base_url TEXT,
  documentation_url TEXT,
  responsible_employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  key_expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'configured' CHECK (status IN ('planned','configured','connected','degraded','disabled')),
  webhook_status TEXT NOT NULL DEFAULT 'not_required' CHECK (webhook_status IN ('not_required','pending','verified','failing','disabled')),
  last_success_at TEXT,
  last_failure_at TEXT,
  last_failure_summary TEXT,
  average_response_ms INTEGER,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  updated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,connection_key)
);
CREATE INDEX IF NOT EXISTS idx_integration_connections_company
  ON integration_connections(company_id,active,category,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS integration_webhooks (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  connection_id TEXT REFERENCES integration_connections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  callback_path TEXT NOT NULL,
  signing_secret_binding_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','failing','disabled')),
  last_delivery_at TEXT,
  last_status_code INTEGER,
  last_error_summary TEXT,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_integration_webhooks_company
  ON integration_webhooks(company_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS integration_request_logs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  connection_id TEXT REFERENCES integration_connections(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound','internal')),
  operation TEXT NOT NULL,
  method TEXT,
  status_code INTEGER,
  outcome TEXT NOT NULL CHECK (outcome IN ('success','failed','blocked')),
  duration_ms INTEGER,
  request_id TEXT,
  error_summary TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_integration_request_logs_company
  ON integration_request_logs(company_id,occurred_at DESC,outcome);

CREATE TABLE IF NOT EXISTS website_sites (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  site_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  domain TEXT,
  preview_base_url TEXT,
  status TEXT NOT NULL DEFAULT 'setup_required' CHECK (status IN ('setup_required','draft','active','maintenance','disabled')),
  publishing_mode TEXT NOT NULL DEFAULT 'managed_feed' CHECK (publishing_mode IN ('managed_feed','external_connector')),
  provider_connection_id TEXT REFERENCES integration_connections(id) ON DELETE SET NULL,
  public_feed_enabled INTEGER NOT NULL DEFAULT 0 CHECK (public_feed_enabled IN (0,1)),
  theme_key TEXT NOT NULL DEFAULT 'brand_default',
  last_published_at TEXT,
  last_published_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS website_pages (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES website_sites(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  menu_label TEXT,
  summary TEXT,
  seo_title TEXT,
  seo_description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','published','archived')),
  draft_content_json TEXT NOT NULL DEFAULT '{}',
  published_content_json TEXT,
  current_version_no INTEGER NOT NULL DEFAULT 0,
  published_version_no INTEGER,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  updated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(site_id,slug)
);
CREATE INDEX IF NOT EXISTS idx_website_pages_site
  ON website_pages(site_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS website_page_revisions (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL REFERENCES website_pages(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  change_summary TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(page_id,version_no)
);

CREATE TABLE IF NOT EXISTS website_media_assets (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL REFERENCES website_sites(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  alt_text TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_website_media_site
  ON website_media_assets(site_id,active,created_at DESC);

CREATE TABLE IF NOT EXISTS website_publish_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  site_id TEXT NOT NULL REFERENCES website_sites(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL REFERENCES website_pages(id) ON DELETE CASCADE,
  revision_id TEXT NOT NULL REFERENCES website_page_revisions(id) ON DELETE RESTRICT,
  change_summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','published','failed','cancelled')),
  requested_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  review_note TEXT,
  published_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  published_at TEXT,
  failure_summary TEXT
);
CREATE INDEX IF NOT EXISTS idx_website_publish_requests_company
  ON website_publish_requests(company_id,status,requested_at DESC);

INSERT OR IGNORE INTO website_sites(id,company_id,site_code,name,domain,status)
SELECT 'website-site-' || lower(code),id,lower(code),name || ' Website',
  CASE code WHEN 'PRINT' THEN 'printing.daenem.com' ELSE NULL END,
  'setup_required'
FROM companies WHERE code IN ('PRINT','BAKERY','AUTOS','LOGISTICS','PROPERTIES');

INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
 ('perm-integrations-access','integrations.access','integrations','view','Open the company API & Integrations Centre and view connection health, API documentation and masked configuration metadata',1),
 ('perm-integrations-manage','integrations.manage','integrations','manage','Create, edit, disable and assign company integration metadata without viewing or storing secret values',1),
 ('perm-integrations-logs','integrations.logs','integrations','view','View bounded company API, webhook and integration request history',1),
 ('perm-website-access','website.access','website','view','Open Website Administration for the selected business and view site, page and publication status',1),
 ('perm-website-content','website.content','website','edit','Create and edit website pages, plain-language content, SEO fields and media for the selected business',1),
 ('perm-website-publish','website.publish','website','approve','Review, approve and publish an approved website revision to the managed public content feed',1);

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-owner-platform-' || p.id,'role-owner',p.id,'manage'
FROM permissions p
WHERE p.id IN ('perm-integrations-access','perm-integrations-manage','perm-integrations-logs','perm-website-access','perm-website-content','perm-website-publish')
  AND EXISTS(SELECT 1 FROM roles WHERE id='role-owner');

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-group-admin-platform-' || p.id,'role-group-admin',p.id,'manage'
FROM permissions p
WHERE p.id IN ('perm-integrations-access','perm-integrations-manage','perm-integrations-logs','perm-website-access','perm-website-content','perm-website-publish')
  AND EXISTS(SELECT 1 FROM roles WHERE id='role-group-admin');

INSERT OR IGNORE INTO app_settings(setting_key,setting_value,value_type) VALUES
 ('integrations.request_log_limit','100','number'),
 ('integrations.store_secret_values','false','boolean'),
 ('website.media_max_bytes','5242880','number'),
 ('website.publish_requires_approval','true','boolean'),
 ('website.public_feed_cache_seconds','300','number');
