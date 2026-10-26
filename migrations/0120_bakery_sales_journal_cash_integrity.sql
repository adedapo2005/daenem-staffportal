PRAGMA foreign_keys=ON;

-- All automatic Bakery sales journals must retain honest accrual accounting:
-- Dr A/R, Cr Sales Revenue; Dr Cost of Sales, Cr Inventory when cost exists.
-- Neither a cashier's claim nor a fabricated SQL line is bank settlement.
-- Do not alter historical journals. Future independently verified settlement
-- must be booked via a separately governed and audited Finance pathway.

CREATE TRIGGER IF NOT EXISTS bakery_sales_journal_requires_real_sale
BEFORE INSERT ON journal_entries
WHEN NEW.company_id='company-bakery' AND NEW.source_module='sales'
BEGIN
 SELECT RAISE(ABORT,'Bakery automatic sales journal requires a completed company sale')
 WHERE NEW.source_type IS NOT 'sales_order'
   OR NEW.source_id IS NULL OR NEW.status IS NOT 'posted'
   OR NOT EXISTS(
     SELECT 1 FROM sales_orders so
     WHERE so.id=NEW.source_id AND so.company_id=NEW.company_id
       AND so.status='completed' AND so.payment_status<>'refunded'
       AND so.total_kobo>0
   );
END;

CREATE TRIGGER IF NOT EXISTS bakery_sales_journal_no_update
BEFORE UPDATE ON journal_entries
WHEN (OLD.company_id='company-bakery' AND OLD.source_module='sales')
 OR (NEW.company_id='company-bakery' AND NEW.source_module='sales')
BEGIN
 SELECT RAISE(ABORT,'Bakery automatic sales journal is immutable; use a governed reversal');
END;

CREATE TRIGGER IF NOT EXISTS bakery_sales_journal_no_delete
BEFORE DELETE ON journal_entries
WHEN OLD.company_id='company-bakery' AND OLD.source_module='sales'
BEGIN
 SELECT RAISE(ABORT,'Bakery automatic sales journal cannot be deleted');
END;

-- Limit Bakery auto-posting to the four exact approved account roles and
-- their correct debit/credit sides. No Cash & Bank (1000), unrelated asset,
-- or cross-company account may occur in a Bakery sales-origin journal.
CREATE TRIGGER IF NOT EXISTS bakery_sales_journal_line_account_guard
BEFORE INSERT ON journal_lines
WHEN EXISTS(
 SELECT 1 FROM journal_entries je WHERE je.id=NEW.journal_entry_id
 AND je.company_id='company-bakery' AND je.source_module='sales'
)
BEGIN
 SELECT RAISE(ABORT,'Bakery automatic sales journal cannot post cash or unapproved accounts')
 WHERE NOT EXISTS(
   SELECT 1 FROM journal_entries je
   JOIN finance_accounts fa ON fa.id=NEW.account_id
   WHERE je.id=NEW.journal_entry_id
     AND je.company_id='company-bakery' AND je.source_module='sales'
     AND fa.company_id=je.company_id
     AND (
      (fa.code='1100' AND fa.account_type='asset'
       AND NEW.debit_kobo>0 AND NEW.credit_kobo=0)
      OR (fa.code='4000' AND fa.account_type='revenue'
       AND NEW.debit_kobo=0 AND NEW.credit_kobo>0)
      OR (fa.code='5000' AND fa.account_type='cost_of_sales'
       AND NEW.debit_kobo>0 AND NEW.credit_kobo=0)
      OR (fa.code='1200' AND fa.account_type='asset'
       AND NEW.debit_kobo=0 AND NEW.credit_kobo>0)
     )
 );
END;

CREATE TRIGGER IF NOT EXISTS bakery_sales_journal_line_no_update
BEFORE UPDATE ON journal_lines
WHEN EXISTS(
 SELECT 1 FROM journal_entries je WHERE je.id IN
 (OLD.journal_entry_id,NEW.journal_entry_id)
 AND je.company_id='company-bakery' AND je.source_module='sales'
)
BEGIN
 SELECT RAISE(ABORT,'Bakery automatic sales journal lines are immutable');
END;

CREATE TRIGGER IF NOT EXISTS bakery_sales_journal_line_no_delete
BEFORE DELETE ON journal_lines
WHEN EXISTS(
 SELECT 1 FROM journal_entries je WHERE je.id=OLD.journal_entry_id
 AND je.company_id='company-bakery' AND je.source_module='sales'
)
BEGIN
 SELECT RAISE(ABORT,'Bakery automatic sales journal lines cannot be deleted');
END;

-- Once referenced by a Bakery sales journal, an account's classification
-- cannot be relabeled to make a formerly legitimate AR entry look like Cash.
CREATE TRIGGER IF NOT EXISTS bakery_sales_journal_account_classification_lock
BEFORE UPDATE OF code,account_type,company_id ON finance_accounts
WHEN (NEW.code IS NOT OLD.code
 OR NEW.account_type IS NOT OLD.account_type
 OR NEW.company_id IS NOT OLD.company_id)
 AND EXISTS(
  SELECT 1 FROM journal_lines jl
  JOIN journal_entries je ON je.id=jl.journal_entry_id
  WHERE jl.account_id=OLD.id
    AND je.company_id='company-bakery' AND je.source_module='sales'
 )
BEGIN
 SELECT RAISE(ABORT,'Bakery sales journal account classification is immutable');
END;
