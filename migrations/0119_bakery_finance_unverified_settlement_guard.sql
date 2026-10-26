PRAGMA foreign_keys=ON;

-- Bakery sale receivables cannot be marked paid from cashier confirmation,
-- an unverified provider reference, or a direct D1 writer. A separate,
-- explicitly approved bank/provider-verified settlement workflow must
-- supersede these guards BEFORE AR or GL cash can change.
--
-- Deliberately scope to source_module='sales' AND company-bakery. Manual
-- Finance A/R and every other company retain their own controls.
-- This migration never rewrites historical records or payments.

CREATE TRIGGER IF NOT EXISTS bakery_sales_ar_initial_unsettled
BEFORE INSERT ON finance_receivables
WHEN NEW.company_id='company-bakery' AND NEW.source_module='sales'
BEGIN
 SELECT RAISE(ABORT,'Bakery sale receivable must begin fully open, without unverified settlement')
 WHERE NEW.amount_kobo IS NULL OR typeof(NEW.amount_kobo)<>'integer'
  OR NEW.amount_kobo<=0 OR NEW.paid_kobo IS NOT 0
  OR NEW.balance_kobo IS NOT NEW.amount_kobo
  OR NEW.status NOT IN ('open','overdue')
  OR NULLIF(trim(COALESCE(NEW.source_id,'')),'') IS NULL;
END;

-- Finance's HTTP payment action denies unverified A/R settlement. Ensure an
-- alternative SQL writer cannot bypass the same rule by inserting evidence.
CREATE TRIGGER IF NOT EXISTS bakery_sales_ar_payment_requires_verified_authority
BEFORE INSERT ON finance_receivable_payments
WHEN EXISTS(
 SELECT 1 FROM finance_receivables fr
 WHERE fr.id=NEW.receivable_id AND fr.company_id='company-bakery'
  AND fr.source_module='sales'
)
BEGIN
 SELECT RAISE(ABORT,'Bakery sale receivable payment requires independent verified settlement');
END;

-- Prior records, if any, stay available as immutable historical exceptions.
-- Neither editing a record nor moving its receivable_id may launder evidence.
CREATE TRIGGER IF NOT EXISTS bakery_sales_ar_payment_no_update
BEFORE UPDATE ON finance_receivable_payments
WHEN EXISTS(
 SELECT 1 FROM finance_receivables fr
 WHERE fr.id IN (OLD.receivable_id,NEW.receivable_id)
  AND fr.company_id='company-bakery' AND fr.source_module='sales'
)
BEGIN
 SELECT RAISE(ABORT,'Bakery historical receivable payment evidence is immutable');
END;

CREATE TRIGGER IF NOT EXISTS bakery_sales_ar_payment_no_delete
BEFORE DELETE ON finance_receivable_payments
WHEN EXISTS(
 SELECT 1 FROM finance_receivables fr
 WHERE fr.id=OLD.receivable_id AND fr.company_id='company-bakery'
  AND fr.source_module='sales'
)
BEGIN
 SELECT RAISE(ABORT,'Bakery historical receivable payment evidence cannot be deleted');
END;

-- A direct UPDATE may not close or reduce a receivable, write it off, move it
-- to a different company/source, or change original source-sale money.
-- Age-only open <-> overdue status transitions are not cash settlement.
CREATE TRIGGER IF NOT EXISTS bakery_sales_ar_financial_fields_immutable
BEFORE UPDATE ON finance_receivables
WHEN OLD.company_id='company-bakery' AND OLD.source_module='sales'
 AND (
   NEW.company_id IS NOT OLD.company_id
   OR NEW.source_module IS NOT OLD.source_module
   OR NEW.source_id IS NOT OLD.source_id
   OR NEW.amount_kobo IS NOT OLD.amount_kobo
   OR NEW.paid_kobo IS NOT OLD.paid_kobo
   OR NEW.balance_kobo IS NOT OLD.balance_kobo
   OR (NEW.status IS NOT OLD.status AND NOT(
     OLD.status IN ('open','overdue') AND NEW.status IN ('open','overdue')
   ))
 )
BEGIN
 SELECT RAISE(ABORT,'Bakery sale receivable cannot be altered without verified Finance settlement');
END;

-- Reclassifying a manual receivable into a Bakery sale is not a supported
-- workaround for the original invariant.
CREATE TRIGGER IF NOT EXISTS bakery_sales_ar_no_source_reclassification
BEFORE UPDATE OF company_id,source_module ON finance_receivables
WHEN NEW.company_id='company-bakery' AND NEW.source_module='sales'
 AND (OLD.company_id IS NOT NEW.company_id
   OR OLD.source_module IS NOT NEW.source_module)
BEGIN
 SELECT RAISE(ABORT,'Bakery sale receivable source and company cannot be reassigned');
END;

CREATE TRIGGER IF NOT EXISTS bakery_sales_ar_no_delete
BEFORE DELETE ON finance_receivables
WHEN OLD.company_id='company-bakery' AND OLD.source_module='sales'
BEGIN
 SELECT RAISE(ABORT,'Bakery sale receivable cannot be deleted without governed reversal');
END;
