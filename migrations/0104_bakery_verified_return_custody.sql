-- Bakery custody verification. Agent-declared returns are NOT warehouse receipts or saleable stock.
-- Physical confirmation is a separate immutable event and never silently increases stock.
CREATE TABLE IF NOT EXISTS bakery_dispatch_return_receipts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL DEFAULT 'company-bakery' REFERENCES companies(id) ON DELETE CASCADE,
  dispatch_id TEXT NOT NULL REFERENCES bakery_dispatches(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES bakery_products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  reference TEXT NOT NULL CHECK (length(trim(reference)) >= 4),
  disposition TEXT NOT NULL DEFAULT 'quarantined' CHECK (disposition = 'quarantined'),
  note TEXT NOT NULL CHECK (length(trim(note)) >= 8),
  received_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, dispatch_id, reference)
);
CREATE INDEX IF NOT EXISTS idx_bakery_verified_returns_dispatch
 ON bakery_dispatch_return_receipts(company_id, dispatch_id, product_id);

CREATE TRIGGER IF NOT EXISTS bakery_verified_return_check
BEFORE INSERT ON bakery_dispatch_return_receipts
BEGIN
  SELECT RAISE(ABORT, 'Return receipt requires open Bakery dispatch and valid product')
  WHERE NOT EXISTS (
    SELECT 1 FROM bakery_dispatches d JOIN bakery_dispatch_items di ON di.dispatch_id=d.id
    WHERE d.id=NEW.dispatch_id AND d.company_id=NEW.company_id AND di.product_id=NEW.product_id
      AND d.status NOT IN ('closed','cancelled')
  );
  SELECT RAISE(ABORT, 'Physical return exceeds agent-declared bread return')
  WHERE NEW.quantity + COALESCE((
    SELECT SUM(r.quantity) FROM bakery_dispatch_return_receipts r
    WHERE r.dispatch_id=NEW.dispatch_id AND r.product_id=NEW.product_id
  ),0) > COALESCE((
    SELECT SUM(bl.quantity) FROM bakery_bread_ledger bl
    WHERE bl.dispatch_id=NEW.dispatch_id AND bl.product_id=NEW.product_id AND bl.status='returned'
  ),0);
END;

CREATE TRIGGER IF NOT EXISTS bakery_verified_return_immutable_update
BEFORE UPDATE ON bakery_dispatch_return_receipts
BEGIN SELECT RAISE(ABORT, 'Verified physical return receipt is immutable'); END;
CREATE TRIGGER IF NOT EXISTS bakery_verified_return_immutable_delete
BEFORE DELETE ON bakery_dispatch_return_receipts
BEGIN SELECT RAISE(ABORT, 'Verified physical return receipt cannot be deleted'); END;
