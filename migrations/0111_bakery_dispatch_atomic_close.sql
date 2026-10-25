PRAGMA foreign_keys=ON;

-- Every Bakery dispatch must be reconciled at the very moment it closes.
-- Handler pre-checks can become stale between D1 reads and the final write.
-- These triggers run in the same SQLite transaction as the closing UPDATE.
-- No historical ledger or accounting amounts are modified.

CREATE TRIGGER IF NOT EXISTS bakery_dispatch_close_final_balance
BEFORE UPDATE OF status ON bakery_dispatches
WHEN OLD.company_id='company-bakery' AND NEW.status='closed' AND OLD.status<>'closed'
BEGIN
 SELECT RAISE(ABORT,'Cannot close Bakery dispatch without issued bread')
 WHERE NOT EXISTS(SELECT 1 FROM bakery_dispatch_items di WHERE di.dispatch_id=OLD.id);

 SELECT RAISE(ABORT,'Bakery dispatch bread quantity changed before closure')
 WHERE ABS(
   COALESCE((SELECT SUM(di.quantity) FROM bakery_dispatch_items di
     WHERE di.dispatch_id=OLD.id),0)
   - COALESCE((SELECT SUM(bl.quantity) FROM bakery_bread_ledger bl
     WHERE bl.company_id=OLD.company_id AND bl.dispatch_id=OLD.id
       AND bl.status IN ('sold','returned','damaged','promotional','staff_consumption','in_store')),0)
 )>=0.0001;

 SELECT RAISE(ABORT,'Unclassified Bakery agent sales cannot close')
 WHERE EXISTS(SELECT 1 FROM bakery_bread_ledger bl
   WHERE bl.company_id=OLD.company_id AND bl.dispatch_id=OLD.id
     AND bl.status='sold'
     AND (bl.buyer_type IS NULL OR bl.unit_price_kobo IS NULL OR bl.unit_price_kobo<=0));

 SELECT RAISE(ABORT,'Bakery dispatch physical returns are not reconciled')
 WHERE EXISTS(
   SELECT 1 FROM (
     SELECT bl.product_id FROM bakery_bread_ledger bl
       WHERE bl.company_id=OLD.company_id AND bl.dispatch_id=OLD.id AND bl.status='returned'
     UNION
     SELECT rr.product_id FROM bakery_dispatch_return_receipts rr
       WHERE rr.company_id=OLD.company_id AND rr.dispatch_id=OLD.id
   ) products
   WHERE COALESCE((SELECT SUM(bl.quantity) FROM bakery_bread_ledger bl
       WHERE bl.company_id=OLD.company_id AND bl.dispatch_id=OLD.id
         AND bl.status='returned' AND bl.product_id=products.product_id),0)
     <> COALESCE((SELECT SUM(rr.quantity) FROM bakery_dispatch_return_receipts rr
       WHERE rr.company_id=OLD.company_id AND rr.dispatch_id=OLD.id
         AND rr.product_id=products.product_id),0)
 );

 SELECT RAISE(ABORT,'Bakery dispatch money changed before closure')
 WHERE COALESCE((SELECT SUM(bl.quantity*COALESCE(bl.unit_price_kobo,di.unit_price_kobo))
   FROM bakery_bread_ledger bl
   JOIN bakery_dispatch_items di ON di.dispatch_id=OLD.id AND di.product_id=bl.product_id
   WHERE bl.company_id=OLD.company_id AND bl.dispatch_id=OLD.id AND bl.status='sold'),0)
  <> COALESCE((SELECT SUM(CASE
     WHEN ml.status IN ('cash_received','pos_received','transfer_received') AND ml.direction='in'
       THEN ml.amount_kobo
     WHEN ml.status='refunded' AND ml.direction='out' THEN -ml.amount_kobo
     ELSE 0 END)
   FROM bakery_money_ledger ml
   WHERE ml.company_id=OLD.company_id AND ml.dispatch_id=OLD.id),0);

 SELECT RAISE(ABORT,'Duplicate Bakery dispatch cash references require investigation')
 WHERE EXISTS(SELECT 1 FROM bakery_money_ledger ml
   WHERE ml.company_id=OLD.company_id AND ml.dispatch_id=OLD.id
     AND ml.status IN ('cash_received','pos_received','transfer_received')
     AND length(trim(COALESCE(ml.reference,'')))>=4
   GROUP BY ml.status,lower(trim(ml.reference)) HAVING COUNT(*)>1);
END;

-- Direct writers, not only the web handler, must not post new accountability
-- events after a final closure or cancellation. The original initial custody
-- entry (in_transit) remains permitted while its dispatch is open.
CREATE TRIGGER IF NOT EXISTS bakery_dispatch_no_bread_after_close
BEFORE INSERT ON bakery_bread_ledger
WHEN NEW.company_id='company-bakery' AND NEW.dispatch_id IS NOT NULL
BEGIN
 SELECT RAISE(ABORT,'Closed Bakery dispatch cannot accept bread events')
 WHERE NOT EXISTS(SELECT 1 FROM bakery_dispatches d
   WHERE d.id=NEW.dispatch_id AND d.company_id=NEW.company_id
     AND d.status NOT IN ('closed','cancelled'));
END;

CREATE TRIGGER IF NOT EXISTS bakery_dispatch_no_money_after_close
BEFORE INSERT ON bakery_money_ledger
WHEN NEW.company_id='company-bakery' AND NEW.dispatch_id IS NOT NULL
BEGIN
 SELECT RAISE(ABORT,'Closed Bakery dispatch cannot accept money events')
 WHERE NOT EXISTS(SELECT 1 FROM bakery_dispatches d
   WHERE d.id=NEW.dispatch_id AND d.company_id=NEW.company_id
     AND d.status NOT IN ('closed','cancelled'));
END;

-- Reopening a financially final dispatch must be a separately authorised and
-- audited process; an ordinary status update cannot silently reopen the book.
CREATE TRIGGER IF NOT EXISTS bakery_dispatch_no_unreviewed_reopen
BEFORE UPDATE OF status ON bakery_dispatches
WHEN OLD.company_id='company-bakery' AND OLD.status='closed' AND NEW.status<>'closed'
BEGIN
 SELECT RAISE(ABORT,'Bakery closed dispatch requires governed reopen');
END;
