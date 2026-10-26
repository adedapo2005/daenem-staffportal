PRAGMA foreign_keys=ON;
-- Prevent issued Bakery custody without corresponding inventory transfer-out.
-- Existing historical records are preserved. New transitions are guarded.
CREATE TRIGGER IF NOT EXISTS bakery_issue_requires_stock_transfer
BEFORE UPDATE OF status ON bakery_dispatches
WHEN OLD.company_id='company-bakery' AND OLD.status='draft' AND NEW.status='in_transit'
BEGIN
 SELECT RAISE(ABORT,'Bakery issue requires matching inventory stock movements')
 WHERE EXISTS(
  SELECT 1 FROM bakery_dispatch_items di
  JOIN bakery_products bp ON bp.id=di.product_id AND bp.company_id=OLD.company_id
  WHERE di.dispatch_id=OLD.id AND (
   bp.inventory_item_id IS NULL
   OR ABS(di.quantity-COALESCE((
    SELECT SUM(sm.quantity) FROM stock_movements sm
    WHERE sm.company_id=OLD.company_id
     AND sm.reference_type='bakery_dispatch' AND sm.reference_id=OLD.id
     AND sm.movement_type='transfer_out'
     AND sm.from_location_id=OLD.location_id
     AND sm.item_id=bp.inventory_item_id
   ),0))>=0.0001
  )
 );
 SELECT RAISE(ABORT,'Bakery issue has unexpected stock movements')
 WHERE EXISTS(
  SELECT 1 FROM stock_movements sm
  WHERE sm.company_id=OLD.company_id
   AND sm.reference_type='bakery_dispatch' AND sm.reference_id=OLD.id
   AND (
    sm.movement_type<>'transfer_out' OR sm.from_location_id IS NOT OLD.location_id
    OR NOT EXISTS(
     SELECT 1 FROM bakery_dispatch_items di JOIN bakery_products bp
       ON bp.id=di.product_id AND bp.company_id=OLD.company_id
     WHERE di.dispatch_id=OLD.id AND bp.inventory_item_id=sm.item_id
    )
   )
 );
END;

CREATE TRIGGER IF NOT EXISTS bakery_issued_stock_movement_no_update
BEFORE UPDATE ON stock_movements
WHEN OLD.reference_type='bakery_dispatch'
 AND EXISTS(SELECT 1 FROM bakery_dispatches d WHERE d.id=OLD.reference_id
  AND d.company_id='company-bakery' AND d.status<>'draft')
BEGIN
 SELECT RAISE(ABORT,'Issued Bakery stock transfer evidence is immutable');
END;
CREATE TRIGGER IF NOT EXISTS bakery_issued_stock_movement_no_delete
BEFORE DELETE ON stock_movements
WHEN OLD.reference_type='bakery_dispatch'
 AND EXISTS(SELECT 1 FROM bakery_dispatches d WHERE d.id=OLD.reference_id
  AND d.company_id='company-bakery' AND d.status<>'draft')
BEGIN
 SELECT RAISE(ABORT,'Issued Bakery stock transfer evidence cannot be deleted');
END;
CREATE TRIGGER IF NOT EXISTS bakery_issued_stock_movement_no_append
BEFORE INSERT ON stock_movements
WHEN NEW.reference_type='bakery_dispatch'
 AND EXISTS(SELECT 1 FROM bakery_dispatches d WHERE d.id=NEW.reference_id
  AND d.company_id='company-bakery' AND d.status<>'draft')
BEGIN
 SELECT RAISE(ABORT,'Issued Bakery stock transfer evidence cannot be appended');
END;
