-- Bakery-only controls. No data deletion or automatic postings.
-- Fail migration rather than silently tolerate duplicated prior production receipts.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bakery_finished_batch_receipt
  ON stock_movements(company_id, reference_id, item_id)
  WHERE reference_type = 'bakery_batch' AND movement_type = 'adjustment_in';

-- Protect all stock movements for Bakery, including concurrent POS/dispatch/ingredient issues.
-- Reserved stock must never be consumed or physical stock become negative.
CREATE TRIGGER IF NOT EXISTS bakery_prevent_negative_stock
BEFORE UPDATE OF quantity ON stock_balances
WHEN OLD.company_id = 'company-bakery'
  AND (NEW.quantity < 0 OR NEW.quantity < NEW.reserved_quantity)
BEGIN
  SELECT RAISE(ABORT, 'Bakery stock cannot fall below reserved or zero quantity');
END;
