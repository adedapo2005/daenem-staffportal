PRAGMA foreign_keys=ON;

-- Bakery inventory is debited by D1 when the matching stock movement is
-- recorded. Both writes are one atomic SQLite statement; no caller can
-- manufacture a transfer-out receipt without consuming available stock.
-- Historical stock movements and balances are left untouched.

CREATE TRIGGER IF NOT EXISTS bakery_stock_transfer_validate_before_insert
BEFORE INSERT ON stock_movements
WHEN NEW.reference_type='bakery_dispatch'
 AND (
  NEW.company_id='company-bakery'
  OR EXISTS(SELECT 1 FROM bakery_dispatches d
    WHERE d.id=NEW.reference_id AND d.company_id='company-bakery')
 )
BEGIN
 SELECT RAISE(ABORT,'Bakery stock transfer requires an open draft, approved product and valid origin')
 WHERE NEW.company_id IS NOT 'company-bakery'
   OR NEW.movement_type IS NOT 'transfer_out'
   OR NEW.from_location_id IS NULL
   OR NEW.to_location_id IS NOT NULL
   OR NEW.quantity IS NULL OR NEW.quantity<=0
   OR NEW.quantity<>CAST(NEW.quantity AS INTEGER)
   OR NOT EXISTS(
    SELECT 1 FROM bakery_dispatches d
    JOIN bakery_dispatch_items di ON di.dispatch_id=d.id
    JOIN bakery_products bp ON bp.id=di.product_id
      AND bp.company_id=d.company_id
    WHERE d.id=NEW.reference_id AND d.company_id=NEW.company_id
     AND d.status='draft' AND d.location_id=NEW.from_location_id
     AND bp.inventory_item_id=NEW.item_id AND di.quantity>0
   );

 SELECT RAISE(ABORT,'Bakery transfer would exceed approved dispatch quantity')
 WHERE NEW.quantity+COALESCE((
    SELECT SUM(sm.quantity) FROM stock_movements sm
    WHERE sm.company_id=NEW.company_id
      AND sm.reference_type='bakery_dispatch'
      AND sm.reference_id=NEW.reference_id
      AND sm.item_id=NEW.item_id
 ),0) > COALESCE((
    SELECT SUM(di.quantity)
    FROM bakery_dispatch_items di
    JOIN bakery_products bp ON bp.id=di.product_id
    WHERE di.dispatch_id=NEW.reference_id
      AND bp.company_id=NEW.company_id
      AND bp.inventory_item_id=NEW.item_id
 ),0);
END;

CREATE TRIGGER IF NOT EXISTS bakery_stock_transfer_atomic_debit
AFTER INSERT ON stock_movements
WHEN NEW.reference_type='bakery_dispatch' AND NEW.company_id='company-bakery'
BEGIN
 UPDATE stock_balances
 SET quantity=quantity-NEW.quantity,updated_at=CURRENT_TIMESTAMP
 WHERE company_id=NEW.company_id AND location_id=NEW.from_location_id
  AND item_id=NEW.item_id
  AND quantity-reserved_quantity>=NEW.quantity;
 SELECT RAISE(ABORT,'Bakery stock transfer failed: insufficient unreserved stock')
 WHERE changes()<>1;
END;

-- An inventory debit cannot be undone by editing or deleting its evidence.
-- This applies even while the dispatch is still a draft.
CREATE TRIGGER IF NOT EXISTS bakery_stock_transfer_no_update
BEFORE UPDATE ON stock_movements
WHEN (OLD.reference_type='bakery_dispatch' AND OLD.company_id='company-bakery')
 OR (NEW.reference_type='bakery_dispatch' AND NEW.company_id='company-bakery')
BEGIN
 SELECT RAISE(ABORT,'Bakery stock transfer evidence is immutable');
END;
CREATE TRIGGER IF NOT EXISTS bakery_stock_transfer_no_delete
BEFORE DELETE ON stock_movements
WHEN OLD.reference_type='bakery_dispatch' AND OLD.company_id='company-bakery'
BEGIN
 SELECT RAISE(ABORT,'Bakery stock transfer evidence cannot be deleted');
END;

-- A draft with a real stock debit cannot be deleted or skipped directly
-- into a reconciled/final state. Any reversal needs separate audited events.
CREATE TRIGGER IF NOT EXISTS bakery_dispatch_draft_no_delete_after_stock
BEFORE DELETE ON bakery_dispatches
WHEN OLD.company_id='company-bakery' AND OLD.status='draft'
 AND EXISTS(SELECT 1 FROM stock_movements sm
  WHERE sm.company_id=OLD.company_id
   AND sm.reference_type='bakery_dispatch' AND sm.reference_id=OLD.id)
BEGIN
 SELECT RAISE(ABORT,'Bakery draft with issued stock cannot be deleted');
END;
CREATE TRIGGER IF NOT EXISTS bakery_dispatch_draft_must_issue_first
BEFORE UPDATE OF status ON bakery_dispatches
WHEN OLD.company_id='company-bakery' AND OLD.status='draft'
 AND NEW.status NOT IN ('draft','in_transit','cancelled')
BEGIN
 SELECT RAISE(ABORT,'Bakery draft must be issued before reconciliation or closure');
END;
CREATE TRIGGER IF NOT EXISTS bakery_dispatch_draft_no_cancel_after_stock
BEFORE UPDATE OF status ON bakery_dispatches
WHEN OLD.company_id='company-bakery' AND OLD.status='draft'
 AND NEW.status='cancelled'
 AND EXISTS(SELECT 1 FROM stock_movements sm
   WHERE sm.company_id=OLD.company_id
    AND sm.reference_type='bakery_dispatch' AND sm.reference_id=OLD.id)
BEGIN
 SELECT RAISE(ABORT,'Bakery draft with debited stock requires governed reversal before cancellation');
END;
