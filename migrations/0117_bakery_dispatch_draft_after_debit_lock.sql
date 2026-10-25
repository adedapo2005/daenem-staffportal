PRAGMA foreign_keys=ON;

-- Issuance is staged as a draft while D1 inserts all approved item lines,
-- then starts transferring stock. Once the first transfer debits inventory,
-- no direct SQL writer may rewrite the draft's item/pricing identity.
-- Existing historical records are unchanged; no money is moved by migration.

CREATE TRIGGER IF NOT EXISTS bakery_debited_draft_no_item_insert
BEFORE INSERT ON bakery_dispatch_items
WHEN EXISTS(
 SELECT 1 FROM bakery_dispatches d
 JOIN stock_movements sm ON sm.company_id=d.company_id
   AND sm.reference_type='bakery_dispatch' AND sm.reference_id=d.id
 WHERE d.id=NEW.dispatch_id AND d.company_id='company-bakery'
)
BEGIN
 SELECT RAISE(ABORT,'Bakery draft with debited stock cannot add dispatch items');
END;

CREATE TRIGGER IF NOT EXISTS bakery_debited_draft_no_item_update
BEFORE UPDATE ON bakery_dispatch_items
WHEN EXISTS(
 SELECT 1 FROM bakery_dispatches d
 JOIN stock_movements sm ON sm.company_id=d.company_id
   AND sm.reference_type='bakery_dispatch' AND sm.reference_id=d.id
 WHERE d.id IN (OLD.dispatch_id,NEW.dispatch_id)
   AND d.company_id='company-bakery'
)
BEGIN
 SELECT RAISE(ABORT,'Bakery draft with debited stock cannot alter issued quantities or prices');
END;

CREATE TRIGGER IF NOT EXISTS bakery_debited_draft_no_item_delete
BEFORE DELETE ON bakery_dispatch_items
WHEN EXISTS(
 SELECT 1 FROM bakery_dispatches d
 JOIN stock_movements sm ON sm.company_id=d.company_id
   AND sm.reference_type='bakery_dispatch' AND sm.reference_id=d.id
 WHERE d.id=OLD.dispatch_id AND d.company_id='company-bakery'
)
BEGIN
 SELECT RAISE(ABORT,'Bakery draft with debited stock cannot delete dispatch items');
END;

-- Draft identity may be edited only BEFORE any stock has been debited. A
-- successful draft -> in_transit transition may still set issued_by/time.
CREATE TRIGGER IF NOT EXISTS bakery_debited_draft_identity_lock
BEFORE UPDATE OF id,company_id,dispatch_no,location_id,custodian_id,created_by,note
ON bakery_dispatches
WHEN OLD.company_id='company-bakery' AND OLD.status='draft'
 AND EXISTS(
  SELECT 1 FROM stock_movements sm WHERE sm.company_id=OLD.company_id
    AND sm.reference_type='bakery_dispatch' AND sm.reference_id=OLD.id
 )
 AND (
  NEW.id IS NOT OLD.id OR NEW.company_id IS NOT OLD.company_id
  OR NEW.dispatch_no IS NOT OLD.dispatch_no
  OR NEW.location_id IS NOT OLD.location_id
  OR NEW.custodian_id IS NOT OLD.custodian_id
  OR NEW.created_by IS NOT OLD.created_by OR NEW.note IS NOT OLD.note
 )
BEGIN
 SELECT RAISE(ABORT,'Bakery draft with debited stock has immutable custody identity');
END;

-- A Bakery product already represented by an inventory-debit movement
-- cannot have its inventory item or company reassigned retrospectively.
-- Description, approved selling prices for FUTURE sales, active state, etc.
-- retain their existing independent governance.
CREATE TRIGGER IF NOT EXISTS bakery_debited_product_inventory_identity_lock
BEFORE UPDATE OF inventory_item_id,company_id ON bakery_products
WHEN OLD.company_id='company-bakery'
 AND (NEW.inventory_item_id IS NOT OLD.inventory_item_id
   OR NEW.company_id IS NOT OLD.company_id)
 AND EXISTS(
  SELECT 1 FROM bakery_dispatch_items di
  JOIN bakery_dispatches d ON d.id=di.dispatch_id
    AND d.company_id=OLD.company_id
  JOIN stock_movements sm ON sm.company_id=d.company_id
    AND sm.reference_type='bakery_dispatch'
    AND sm.reference_id=d.id AND sm.item_id=OLD.inventory_item_id
  WHERE di.product_id=OLD.id
 )
BEGIN
 SELECT RAISE(ABORT,'Bakery product inventory identity is locked by issued stock evidence');
END;
