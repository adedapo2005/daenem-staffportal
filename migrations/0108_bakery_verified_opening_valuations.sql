PRAGMA foreign_keys=ON;

-- A financial opening is a VERIFIED SNAPSHOT of physical stock already in Inventory.
-- It adds no stock. It is not an Inventory receipt, expense or payment posting.
-- One kobo=1,000,000 microkobo; one base inventory unit=1,000,000 microunits.
CREATE TABLE IF NOT EXISTS bakery_material_opening_valuations(
 id TEXT PRIMARY KEY NOT NULL,
 company_id TEXT NOT NULL DEFAULT 'company-bakery' REFERENCES companies(id) ON DELETE RESTRICT,
 location_id TEXT NOT NULL REFERENCES company_locations(id) ON DELETE RESTRICT,
 inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
 base_unit TEXT NOT NULL,
 counted_quantity_micro INTEGER NOT NULL CHECK(counted_quantity_micro>0),
 opening_value_microkobo INTEGER NOT NULL CHECK(opening_value_microkobo>0),
 stock_movement_marker INTEGER NOT NULL DEFAULT 0 CHECK(stock_movement_marker>=0),
 status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','rejected')),
 reason TEXT NOT NULL CHECK(length(trim(reason))>=8),
 evidence_reference TEXT NOT NULL CHECK(length(trim(evidence_reference))>=8),
 proposed_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
 reviewed_by TEXT REFERENCES employees(id) ON DELETE RESTRICT,
 review_note TEXT,
 reviewed_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(reviewed_by IS NULL OR reviewed_by<>proposed_by),
 CHECK(status='proposed' OR (reviewed_by IS NOT NULL AND length(trim(review_note))>=8 AND reviewed_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bakery_opening_one_approved
 ON bakery_material_opening_valuations(company_id,location_id,inventory_item_id)
 WHERE status='approved';
CREATE UNIQUE INDEX IF NOT EXISTS idx_bakery_opening_one_pending
 ON bakery_material_opening_valuations(company_id,location_id,inventory_item_id)
 WHERE status='proposed';
CREATE INDEX IF NOT EXISTS idx_bakery_opening_recent
 ON bakery_material_opening_valuations(company_id,created_at DESC);

CREATE TRIGGER IF NOT EXISTS bakery_opening_item_location_guard
BEFORE INSERT ON bakery_material_opening_valuations
BEGIN
 SELECT CASE WHEN NEW.company_id<>'company-bakery' OR NOT EXISTS(
  SELECT 1 FROM inventory_items i
  JOIN company_locations l ON l.id=NEW.location_id AND l.company_id=i.company_id AND l.active=1
  WHERE i.id=NEW.inventory_item_id AND i.company_id=NEW.company_id AND i.active=1
    AND lower(trim(i.unit))=lower(trim(NEW.base_unit))
    AND NOT EXISTS(SELECT 1 FROM bakery_products bp WHERE bp.inventory_item_id=i.id AND bp.company_id=i.company_id)
 ) THEN RAISE(ABORT,'Bakery opening valuation requires an active raw-material item and location with matching units') END;
END;

CREATE TRIGGER IF NOT EXISTS bakery_opening_immutable
BEFORE UPDATE ON bakery_material_opening_valuations
WHEN OLD.status<>'proposed'
 OR NEW.id<>OLD.id OR NEW.company_id<>OLD.company_id
 OR NEW.location_id<>OLD.location_id OR NEW.inventory_item_id<>OLD.inventory_item_id
 OR NEW.base_unit<>OLD.base_unit OR NEW.counted_quantity_micro<>OLD.counted_quantity_micro
 OR NEW.opening_value_microkobo<>OLD.opening_value_microkobo OR NEW.stock_movement_marker<>OLD.stock_movement_marker OR NEW.reason<>OLD.reason
 OR NEW.evidence_reference<>OLD.evidence_reference OR NEW.proposed_by<>OLD.proposed_by
 OR NEW.created_at<>OLD.created_at
 OR NEW.status NOT IN('approved','rejected')
 OR NEW.reviewed_by IS NULL OR NEW.reviewed_by=OLD.proposed_by
 OR NEW.reviewed_at IS NULL OR NEW.review_note IS NULL OR length(trim(NEW.review_note))<8
BEGIN SELECT RAISE(ABORT,'Opening valuation snapshots are immutable after independent review');END;

CREATE TRIGGER IF NOT EXISTS bakery_opening_no_delete
BEFORE DELETE ON bakery_material_opening_valuations
BEGIN SELECT RAISE(ABORT,'Opening valuation and review evidence cannot be deleted');END;
