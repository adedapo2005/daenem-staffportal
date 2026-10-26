PRAGMA foreign_keys=ON;

-- A Bakery dispatch is built in draft and its whole bread issue is committed
-- atomically when it enters in_transit. Issued item quantities and prices
-- cannot be rewritten, added or removed by an alternative SQL writer.
-- No historical dispatch or stock entries are backfilled or altered.

CREATE TRIGGER IF NOT EXISTS bakery_dispatch_item_insert_requires_draft
BEFORE INSERT ON bakery_dispatch_items
WHEN EXISTS (
 SELECT 1 FROM bakery_dispatches d
 WHERE d.id=NEW.dispatch_id AND d.company_id='company-bakery'
  AND d.status<>'draft'
)
BEGIN
 SELECT RAISE(ABORT,'Issued Bakery dispatch cannot add bread items');
END;

CREATE TRIGGER IF NOT EXISTS bakery_dispatch_item_update_requires_draft
BEFORE UPDATE ON bakery_dispatch_items
WHEN EXISTS(
 SELECT 1 FROM bakery_dispatches d
 WHERE d.id IN (OLD.dispatch_id,NEW.dispatch_id)
  AND d.company_id='company-bakery' AND d.status<>'draft'
)
BEGIN
 SELECT RAISE(ABORT,'Issued Bakery dispatch items and prices are immutable');
END;

CREATE TRIGGER IF NOT EXISTS bakery_dispatch_item_delete_requires_draft
BEFORE DELETE ON bakery_dispatch_items
WHEN EXISTS (
 SELECT 1 FROM bakery_dispatches d
 WHERE d.id=OLD.dispatch_id AND d.company_id='company-bakery'
  AND d.status<>'draft'
)
BEGIN
 SELECT RAISE(ABORT,'Issued Bakery dispatch items cannot be deleted');
END;

-- The final issue must contain precisely the bread that was transferred
-- into custody. A partial, empty or extra in-transit ledger cannot activate
-- a draft dispatch, even through raw SQL.
CREATE TRIGGER IF NOT EXISTS bakery_dispatch_issue_requires_bread_evidence
BEFORE UPDATE OF status ON bakery_dispatches
WHEN OLD.company_id='company-bakery'
 AND OLD.status='draft' AND NEW.status='in_transit'
BEGIN
 SELECT RAISE(ABORT,'Bakery dispatch issue requires bread items')
 WHERE NOT EXISTS (SELECT 1 FROM bakery_dispatch_items i
   WHERE i.dispatch_id=OLD.id);
 SELECT RAISE(ABORT,'Bakery dispatch issue bread custody evidence is incomplete')
 WHERE EXISTS (
   SELECT 1 FROM bakery_dispatch_items di WHERE di.dispatch_id=OLD.id
    AND ABS(di.quantity-COALESCE((
      SELECT SUM(bl.quantity) FROM bakery_bread_ledger bl
      WHERE bl.dispatch_id=OLD.id AND bl.company_id=OLD.company_id
        AND bl.product_id=di.product_id AND bl.status='in_transit'
    ),0))>=0.0001
 );
 SELECT RAISE(ABORT,'Bakery dispatch has unexpected in-transit bread')
 WHERE EXISTS (
   SELECT 1 FROM bakery_bread_ledger bl
   WHERE bl.dispatch_id=OLD.id AND bl.company_id=OLD.company_id
     AND bl.status='in_transit'
     AND NOT EXISTS (SELECT 1 FROM bakery_dispatch_items di
        WHERE di.dispatch_id=OLD.id AND di.product_id=bl.product_id)
 );
END;

CREATE TRIGGER IF NOT EXISTS bakery_dispatch_issued_identity_lock
BEFORE UPDATE OF id,company_id,dispatch_no,location_id,custodian_id,created_by,dispatched_at
ON bakery_dispatches
WHEN OLD.company_id='company-bakery'
 AND OLD.status IN ('in_transit','received','reconciling')
 AND (
   NEW.id IS NOT OLD.id OR NEW.company_id IS NOT OLD.company_id
   OR NEW.dispatch_no IS NOT OLD.dispatch_no
   OR NEW.location_id IS NOT OLD.location_id
   OR NEW.custodian_id IS NOT OLD.custodian_id
   OR NEW.created_by IS NOT OLD.created_by
   OR NEW.dispatched_at IS NOT OLD.dispatched_at
 )
BEGIN
 SELECT RAISE(ABORT,'Issued Bakery dispatch identity is immutable');
END;

CREATE TRIGGER IF NOT EXISTS bakery_dispatch_final_metadata_lock
BEFORE UPDATE ON bakery_dispatches
WHEN OLD.company_id='company-bakery'
 AND OLD.status IN ('closed','cancelled')
BEGIN
 SELECT RAISE(ABORT,'Final Bakery dispatch cannot be modified');
END;

CREATE TRIGGER IF NOT EXISTS bakery_dispatch_issued_no_delete
BEFORE DELETE ON bakery_dispatches
WHEN OLD.company_id='company-bakery'
 AND (
  OLD.status<>'draft'
  OR EXISTS(SELECT 1 FROM bakery_bread_ledger bl WHERE bl.dispatch_id=OLD.id)
  OR EXISTS(SELECT 1 FROM bakery_money_ledger ml WHERE ml.dispatch_id=OLD.id)
  OR EXISTS(SELECT 1 FROM bakery_dispatch_return_receipts rr WHERE rr.dispatch_id=OLD.id)
 )
BEGIN
 SELECT RAISE(ABORT,'Issued Bakery dispatch cannot be deleted');
END;
