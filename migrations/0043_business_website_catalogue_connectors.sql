PRAGMA foreign_keys = ON;

-- Daenem Logistics did not yet have an operational service catalogue. This
-- table is the single source for service names and pricing used by Logistics
-- operations and, when deliberately linked, its public website.
CREATE TABLE IF NOT EXISTS logistics_services (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-logistics' REFERENCES companies(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'delivery' CHECK (category IN ('delivery','haulage','moving','distribution','courier','specialized','other')),
  description TEXT NOT NULL,
  pricing_unit TEXT NOT NULL DEFAULT 'job' CHECK (pricing_unit IN ('job','trip','kilometre','kilogram','tonne','hour','day','vehicle')),
  base_price_kobo INTEGER NOT NULL DEFAULT 0 CHECK (base_price_kobo >= 0),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,code)
);
CREATE INDEX IF NOT EXISTS idx_logistics_services_active
  ON logistics_services(company_id,active,category,name);

-- Guard the polymorphic website link at the database boundary. A record can
-- be linked only to the website belonging to the same business and source
-- type. This prevents cross-business records even if a future client is buggy.
CREATE TRIGGER IF NOT EXISTS website_catalog_link_source_guard_insert
BEFORE INSERT ON website_catalog_links
BEGIN
  SELECT CASE WHEN
    (NEW.entity_type='printing_service' AND NOT EXISTS(
      SELECT 1 FROM printing_services x JOIN website_sites s ON s.company_id=x.company_id
      WHERE x.id=NEW.entity_id AND s.id=NEW.site_id
    )) OR
    (NEW.entity_type='bakery_product' AND NOT EXISTS(
      SELECT 1 FROM bakery_products x JOIN website_sites s ON s.company_id=x.company_id
      WHERE x.id=NEW.entity_id AND s.id=NEW.site_id
    )) OR
    (NEW.entity_type='vehicle' AND NOT EXISTS(
      SELECT 1 FROM auto_vehicles x JOIN website_sites s ON s.company_id=x.company_id
      WHERE x.id=NEW.entity_id AND s.id=NEW.site_id
    )) OR
    (NEW.entity_type='property' AND NOT EXISTS(
      SELECT 1 FROM property_listings x JOIN website_sites s ON s.company_id=x.company_id
      WHERE x.id=NEW.entity_id AND s.id=NEW.site_id
    )) OR
    (NEW.entity_type='logistics_service' AND NOT EXISTS(
      SELECT 1 FROM logistics_services x JOIN website_sites s ON s.company_id=x.company_id
      WHERE x.id=NEW.entity_id AND s.id=NEW.site_id
    ))
  THEN RAISE(ABORT,'invalid website catalogue source') END;
END;

CREATE TRIGGER IF NOT EXISTS website_catalog_link_source_guard_update
BEFORE UPDATE OF site_id,entity_type,entity_id ON website_catalog_links
BEGIN
  SELECT CASE WHEN
    (NEW.entity_type='printing_service' AND NOT EXISTS(
      SELECT 1 FROM printing_services x JOIN website_sites s ON s.company_id=x.company_id
      WHERE x.id=NEW.entity_id AND s.id=NEW.site_id
    )) OR
    (NEW.entity_type='bakery_product' AND NOT EXISTS(
      SELECT 1 FROM bakery_products x JOIN website_sites s ON s.company_id=x.company_id
      WHERE x.id=NEW.entity_id AND s.id=NEW.site_id
    )) OR
    (NEW.entity_type='vehicle' AND NOT EXISTS(
      SELECT 1 FROM auto_vehicles x JOIN website_sites s ON s.company_id=x.company_id
      WHERE x.id=NEW.entity_id AND s.id=NEW.site_id
    )) OR
    (NEW.entity_type='property' AND NOT EXISTS(
      SELECT 1 FROM property_listings x JOIN website_sites s ON s.company_id=x.company_id
      WHERE x.id=NEW.entity_id AND s.id=NEW.site_id
    )) OR
    (NEW.entity_type='logistics_service' AND NOT EXISTS(
      SELECT 1 FROM logistics_services x JOIN website_sites s ON s.company_id=x.company_id
      WHERE x.id=NEW.entity_id AND s.id=NEW.site_id
    ))
  THEN RAISE(ABORT,'invalid website catalogue source') END;
END;

INSERT OR IGNORE INTO permissions(id,code,module,action,description,sensitive) VALUES
 ('perm-logistics-services','logistics.services','logistics','edit','Create and maintain the real Daenem Logistics service catalogue, including service descriptions, pricing units and public-website eligibility',0);

INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-owner-logistics-services','role-owner','perm-logistics-services','manage'
WHERE EXISTS(SELECT 1 FROM roles WHERE id='role-owner');
INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-group-admin-logistics-services','role-group-admin','perm-logistics-services','manage'
WHERE EXISTS(SELECT 1 FROM roles WHERE id='role-group-admin');
INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-logistics-fleet-services','role-logistics-fleet','perm-logistics-services','manage'
WHERE EXISTS(SELECT 1 FROM roles WHERE id='role-logistics-fleet');
INSERT OR IGNORE INTO role_permissions(id,role_id,permission_id,access_level)
SELECT 'rp-logistics-dispatch-services','role-logistics-dispatcher','perm-logistics-services','view'
WHERE EXISTS(SELECT 1 FROM roles WHERE id='role-logistics-dispatcher');

INSERT OR IGNORE INTO app_settings(setting_key,setting_value,value_type) VALUES
 ('website.catalogue_source_limit','250','number');

-- Printing is the only business website the owner has confirmed as built.
-- Its managed feed remains deliberately off until separately approved. Every
-- other business keeps the default setup_required state for its future site.
UPDATE website_sites
SET status='active',updated_at=CURRENT_TIMESTAMP
WHERE company_id='company-printing' AND domain='printing.daenem.com';
