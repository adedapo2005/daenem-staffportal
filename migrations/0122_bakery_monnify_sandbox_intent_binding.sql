PRAGMA foreign_keys=ON;

-- Sandbox-only provider initiation evidence; never a payment, settlement or
-- Finance posting authority. Live requires separately approved integration.
CREATE TABLE IF NOT EXISTS bakery_monnify_sandbox_intents (
 id TEXT PRIMARY KEY,
 company_id TEXT NOT NULL DEFAULT 'company-bakery' CHECK(company_id='company-bakery'),
 receivable_id TEXT NOT NULL UNIQUE REFERENCES finance_receivables(id) ON DELETE RESTRICT,
 payment_reference TEXT NOT NULL UNIQUE CHECK(length(payment_reference) BETWEEN 12 AND 128),
 provider_transaction_reference TEXT UNIQUE,
 expected_amount_kobo INTEGER NOT NULL CHECK(typeof(expected_amount_kobo)='integer' AND expected_amount_kobo>0),
 currency TEXT NOT NULL DEFAULT 'NGN' CHECK(currency='NGN'),
 provider_environment TEXT NOT NULL DEFAULT 'sandbox' CHECK(provider_environment='sandbox'),
 status TEXT NOT NULL DEFAULT 'reserved'
   CHECK(status IN ('reserved','initialized','review_required')),
 checkout_url TEXT,
 created_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 initialized_at TEXT,
 CHECK(status!='initialized' OR (provider_transaction_reference IS NOT NULL
  AND length(provider_transaction_reference)>0 AND checkout_url IS NOT NULL
  AND initialized_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_bakery_monnify_intent_company_status
 ON bakery_monnify_sandbox_intents(company_id,status,created_at);

-- One immutable provider reference, bound to the actual Bakery sale and A/R.
CREATE TRIGGER IF NOT EXISTS bakery_monnify_intent_requires_real_receivable
BEFORE INSERT ON bakery_monnify_sandbox_intents
BEGIN
 SELECT RAISE(ABORT,'Bakery Monnify intent requires an unpaid completed Bakery sale')
 WHERE NEW.status!='reserved' OR NEW.provider_transaction_reference IS NOT NULL
  OR NEW.checkout_url IS NOT NULL OR NEW.initialized_at IS NOT NULL
  OR NOT EXISTS (
   SELECT 1 FROM finance_receivables fr
   JOIN sales_orders so ON so.id=fr.source_id AND so.company_id=fr.company_id
   WHERE fr.id=NEW.receivable_id AND fr.company_id='company-bakery'
    AND fr.source_module='sales' AND fr.status IN ('open','overdue')
    AND fr.amount_kobo=NEW.expected_amount_kobo
    AND fr.balance_kobo=fr.amount_kobo AND fr.paid_kobo=0
    AND so.status='completed' AND so.payment_status='unpaid'
    AND so.amount_paid_kobo=0 AND so.total_kobo=fr.amount_kobo
  );
END;

CREATE TRIGGER IF NOT EXISTS bakery_monnify_intent_immutable
BEFORE UPDATE ON bakery_monnify_sandbox_intents
WHEN NEW.id IS NOT OLD.id OR NEW.company_id IS NOT OLD.company_id
 OR NEW.receivable_id IS NOT OLD.receivable_id
 OR NEW.payment_reference IS NOT OLD.payment_reference
 OR NEW.expected_amount_kobo IS NOT OLD.expected_amount_kobo
 OR NEW.currency IS NOT OLD.currency
 OR NEW.provider_environment IS NOT OLD.provider_environment
 OR NEW.created_by IS NOT OLD.created_by
 OR NEW.created_at IS NOT OLD.created_at
 OR OLD.status!='reserved'
 OR NEW.status NOT IN ('initialized','review_required')
 OR (NEW.status='review_required' AND (
  NEW.provider_transaction_reference IS NOT OLD.provider_transaction_reference
  OR NEW.checkout_url IS NOT OLD.checkout_url
  OR NEW.initialized_at IS NOT OLD.initialized_at))
BEGIN
 SELECT RAISE(ABORT,'Bakery Monnify intent identity and history are immutable');
END;
-- An outstanding sandbox intent takes exclusive custody of payment initiation.
-- Prevent cash receipts, refunds or sale repricing racing the provider checkout.
-- An uncertain failed intent must be reviewed before any alternative payment.
CREATE TRIGGER IF NOT EXISTS bakery_monnify_intent_sale_money_lock
BEFORE UPDATE OF company_id,status,payment_status,amount_paid_kobo,total_kobo ON sales_orders
WHEN OLD.company_id='company-bakery'
 AND (NEW.company_id IS NOT OLD.company_id OR NEW.status IS NOT OLD.status
  OR NEW.payment_status IS NOT OLD.payment_status
  OR NEW.amount_paid_kobo IS NOT OLD.amount_paid_kobo
  OR NEW.total_kobo IS NOT OLD.total_kobo)
 AND EXISTS(
  SELECT 1 FROM bakery_monnify_sandbox_intents i
  JOIN finance_receivables fr ON fr.id=i.receivable_id
  WHERE i.company_id='company-bakery' AND i.status IN ('reserved','initialized','review_required')
   AND fr.company_id='company-bakery' AND fr.source_module='sales'
   AND fr.source_id=OLD.id
 )
BEGIN
 SELECT RAISE(ABORT,'Bakery payment intent must be reconciled before changing sale money');
END;

-- A review-required intent may already have reached Monnify. No alternate
-- receipt may be recorded against that source until independently resolved.
CREATE TRIGGER IF NOT EXISTS bakery_monnify_source_payment_lock
BEFORE INSERT ON payments
WHEN NEW.company_id='company-bakery' AND EXISTS(
 SELECT 1 FROM bakery_monnify_sandbox_intents i
 JOIN finance_receivables fr ON fr.id=i.receivable_id
 WHERE fr.company_id='company-bakery' AND fr.source_module='sales'
 AND fr.source_id=NEW.sales_order_id
)
BEGIN
 SELECT RAISE(ABORT,'Bakery Monnify payment intent needs reconciliation before another receipt');
END;
CREATE TRIGGER IF NOT EXISTS bakery_monnify_source_payment_update_lock
BEFORE UPDATE OF company_id,sales_order_id,amount_kobo,status ON payments
WHEN EXISTS(
 SELECT 1 FROM bakery_monnify_sandbox_intents i
 JOIN finance_receivables fr ON fr.id=i.receivable_id
 WHERE fr.company_id='company-bakery' AND fr.source_module='sales'
 AND fr.source_id IN (OLD.sales_order_id,NEW.sales_order_id)
)
BEGIN
 SELECT RAISE(ABORT,'Bakery Monnify intent prevents payment mutation');
END;

CREATE TRIGGER IF NOT EXISTS bakery_monnify_intent_no_delete
BEFORE DELETE ON bakery_monnify_sandbox_intents
BEGIN
 SELECT RAISE(ABORT,'Bakery Monnify intent cannot be deleted');
END;

-- Append-only collection facts. The bank and receivable fields are HARD ZERO,
-- irrespective of Monnify PAID or caller claims. Never an authority to clear AR.
CREATE TABLE IF NOT EXISTS bakery_monnify_collection_inquiries (
 id TEXT PRIMARY KEY,
 intent_id TEXT NOT NULL REFERENCES bakery_monnify_sandbox_intents(id) ON DELETE RESTRICT,
 company_id TEXT NOT NULL DEFAULT 'company-bakery' CHECK(company_id='company-bakery'),
 collection_state TEXT NOT NULL CHECK(collection_state IN (
 'not_configured','invalid_binding','provider_unavailable',
 'reference_mismatch_review','amount_mismatch_review',
 'provider_paid_not_settled','partial_payment_review',
 'reversed_or_refunded_review','not_paid','provider_status_review')),
 provider_status TEXT,
 amount_paid_kobo INTEGER CHECK(amount_paid_kobo IS NULL OR
  (typeof(amount_paid_kobo)='integer' AND amount_paid_kobo>=0)),
 provider_transaction_reference TEXT,
 bank_settlement_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(bank_settlement_confirmed=0),
 finance_receivable_updated INTEGER NOT NULL DEFAULT 0 CHECK(finance_receivable_updated=0),
 checked_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
 checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bakery_monnify_inquiry_intent
 ON bakery_monnify_collection_inquiries(intent_id,checked_at DESC);
CREATE TRIGGER IF NOT EXISTS bakery_monnify_inquiry_correct_company
BEFORE INSERT ON bakery_monnify_collection_inquiries
WHEN NOT EXISTS(SELECT 1 FROM bakery_monnify_sandbox_intents i
 WHERE i.id=NEW.intent_id AND i.company_id=NEW.company_id)
BEGIN
 SELECT RAISE(ABORT,'Bakery Monnify inquiry must match its source intent');
END;
CREATE TRIGGER IF NOT EXISTS bakery_monnify_inquiry_no_update
BEFORE UPDATE ON bakery_monnify_collection_inquiries
BEGIN
 SELECT RAISE(ABORT,'Bakery Monnify inquiry evidence is append-only');
END;
CREATE TRIGGER IF NOT EXISTS bakery_monnify_inquiry_no_delete
BEFORE DELETE ON bakery_monnify_collection_inquiries
BEGIN
 SELECT RAISE(ABORT,'Bakery Monnify inquiry evidence cannot be deleted');
END;
