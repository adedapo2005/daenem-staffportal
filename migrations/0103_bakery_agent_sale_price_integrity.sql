-- DAENEM Bakery: classify agent sales at the actual buyer price and protect remittance truth.
-- Records already in the ledger remain intact; legacy rows have NULL classification.
ALTER TABLE bakery_bread_ledger ADD COLUMN buyer_type TEXT CHECK (buyer_type IS NULL OR buyer_type IN ('individual','reseller'));
ALTER TABLE bakery_bread_ledger ADD COLUMN unit_price_kobo INTEGER CHECK (unit_price_kobo IS NULL OR unit_price_kobo >= 0);
ALTER TABLE bakery_bread_ledger ADD COLUMN customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bakery_agent_sales_buyer_type
  ON bakery_bread_ledger(company_id,dispatch_id,status,buyer_type);

-- Every recorded agent sale must be classified and retain its approved selling price.
CREATE TRIGGER IF NOT EXISTS bakery_agent_sales_require_price
BEFORE INSERT ON bakery_bread_ledger
WHEN NEW.dispatch_id IS NOT NULL AND NEW.status = 'sold'
BEGIN
  SELECT RAISE(ABORT,'Agent sale requires buyer type and positive approved price')
  WHERE NEW.buyer_type IS NULL OR NEW.unit_price_kobo IS NULL OR NEW.unit_price_kobo <= 0;
END;

-- Enforce every-loaf accountability inside the same D1 transaction, even with concurrent requests.
CREATE TRIGGER IF NOT EXISTS bakery_dispatch_prevent_overaccount
BEFORE INSERT ON bakery_bread_ledger
WHEN NEW.dispatch_id IS NOT NULL
 AND NEW.status IN ('sold','returned','damaged','promotional','staff_consumption','in_store')
BEGIN
  SELECT RAISE(ABORT,'Bread account would exceed dispatched quantity or reference unknown product')
  WHERE NOT EXISTS (
    SELECT 1 FROM bakery_dispatch_items i
    WHERE i.dispatch_id=NEW.dispatch_id AND i.product_id=NEW.product_id
      AND (SELECT COALESCE(SUM(bl.quantity),0)
           FROM bakery_bread_ledger bl
           WHERE bl.dispatch_id=NEW.dispatch_id AND bl.product_id=NEW.product_id
             AND bl.status IN ('sold','returned','damaged','promotional','staff_consumption','in_store'))
        + NEW.quantity <= i.quantity
  );
END;

-- The same receipt/reference must not be accepted twice for the same dispatch and channel.
CREATE UNIQUE INDEX IF NOT EXISTS uq_bakery_dispatch_money_reference
 ON bakery_money_ledger(company_id,dispatch_id,status,reference)
 WHERE dispatch_id IS NOT NULL AND reference IS NOT NULL AND TRIM(reference)<>''
   AND status IN ('cash_received','pos_received','transfer_received');
