PRAGMA foreign_keys=ON;

-- Future Bakery posted GL cash increases require separately governed bank or
-- provider settlement. No such authority exists yet. This is deliberately
-- fail-closed for new cash debits, regardless of manual/source labels.
-- Existing financial history is preserved without silent rewriting.

-- Cash debit must not be smuggled into an already posted Bakery journal.
CREATE TRIGGER IF NOT EXISTS bakery_unverified_cash_line_insert
BEFORE INSERT ON journal_lines
WHEN NEW.debit_kobo>0 AND EXISTS(
 SELECT 1 FROM journal_entries je JOIN finance_accounts fa
 ON fa.id=NEW.account_id WHERE je.id=NEW.journal_entry_id
 AND je.company_id='company-bakery' AND je.status='posted'
 AND fa.company_id=je.company_id AND fa.code='1000'
 AND fa.account_type='asset'
)
BEGIN
 SELECT RAISE(ABORT,'Bakery GL cash increase requires independently verified settlement');
END;

-- No updating an existing line into cash or moving it to a posted journal.
CREATE TRIGGER IF NOT EXISTS bakery_unverified_cash_line_update
BEFORE UPDATE ON journal_lines
WHEN NEW.debit_kobo>0 AND EXISTS(
 SELECT 1 FROM journal_entries je JOIN finance_accounts fa
 ON fa.id=NEW.account_id WHERE je.id=NEW.journal_entry_id
 AND je.company_id='company-bakery' AND je.status='posted'
 AND fa.company_id=je.company_id AND fa.code='1000'
 AND fa.account_type='asset'
)
BEGIN
 SELECT RAISE(ABORT,'Bakery GL cash increase requires independently verified settlement');
END;

-- Draft journals may be reviewed, but cannot be posted if they contain a
-- manually supplied cash increase, even when their debits equal credits.
CREATE TRIGGER IF NOT EXISTS bakery_unverified_cash_post_guard
BEFORE UPDATE OF status,company_id ON journal_entries
WHEN NEW.company_id='company-bakery' AND NEW.status='posted'
 AND (NEW.status IS NOT OLD.status OR NEW.company_id IS NOT OLD.company_id)
 AND EXISTS(
 SELECT 1 FROM journal_lines jl JOIN finance_accounts fa
 ON fa.id=jl.account_id WHERE jl.journal_entry_id=OLD.id
 AND fa.company_id='company-bakery' AND fa.code='1000'
 AND fa.account_type='asset' AND jl.debit_kobo>0
)
BEGIN
 SELECT RAISE(ABORT,'Bakery GL cash increase requires independently verified settlement');
END;

-- Prevent laundering new cash debits through a different company's account.
CREATE TRIGGER IF NOT EXISTS bakery_gl_company_account_insert
BEFORE INSERT ON journal_lines
WHEN EXISTS(SELECT 1 FROM journal_entries je WHERE je.id=NEW.journal_entry_id
 AND je.company_id='company-bakery')
 AND NOT EXISTS(SELECT 1 FROM finance_accounts fa WHERE fa.id=NEW.account_id
 AND fa.company_id='company-bakery')
BEGIN
 SELECT RAISE(ABORT,'Bakery journal cannot use a different company account');
END;
CREATE TRIGGER IF NOT EXISTS bakery_gl_company_account_update
BEFORE UPDATE OF journal_entry_id,account_id ON journal_lines
WHEN EXISTS(SELECT 1 FROM journal_entries je WHERE je.id=NEW.journal_entry_id
 AND je.company_id='company-bakery')
 AND NOT EXISTS(SELECT 1 FROM finance_accounts fa WHERE fa.id=NEW.account_id
 AND fa.company_id='company-bakery')
BEGIN
 SELECT RAISE(ABORT,'Bakery journal cannot use a different company account');
END;
CREATE TRIGGER IF NOT EXISTS bakery_gl_company_reclassification_guard
BEFORE UPDATE OF company_id ON journal_entries
WHEN NEW.company_id IS NOT OLD.company_id
 AND (NEW.company_id='company-bakery' OR OLD.company_id='company-bakery')
 AND EXISTS(SELECT 1 FROM journal_lines jl WHERE jl.journal_entry_id=OLD.id)
BEGIN
 SELECT RAISE(ABORT,'Journal with financial lines cannot move into or out of Bakery');
END;

-- A historical posted cash entry, even if suspect, must remain inspectable;
-- reversal/correction will require a separately controlled workflow.
CREATE TRIGGER IF NOT EXISTS bakery_posted_cash_journal_immutable
BEFORE UPDATE OF status,company_id ON journal_entries
WHEN OLD.company_id='company-bakery' AND OLD.status='posted'
 AND (NEW.status IS NOT OLD.status OR NEW.company_id IS NOT OLD.company_id)
 AND EXISTS(SELECT 1 FROM journal_lines jl JOIN finance_accounts fa
 ON fa.id=jl.account_id WHERE jl.journal_entry_id=OLD.id
 AND fa.company_id='company-bakery' AND fa.code='1000'
 AND fa.account_type='asset' AND jl.debit_kobo>0)
BEGIN
 SELECT RAISE(ABORT,'Bakery historical posted cash journal requires governed reversal');
END;
CREATE TRIGGER IF NOT EXISTS bakery_posted_cash_journal_no_delete
BEFORE DELETE ON journal_entries
WHEN OLD.company_id='company-bakery' AND OLD.status='posted'
 AND EXISTS(SELECT 1 FROM journal_lines jl JOIN finance_accounts fa
 ON fa.id=jl.account_id WHERE jl.journal_entry_id=OLD.id
 AND fa.company_id='company-bakery' AND fa.code='1000'
 AND fa.account_type='asset' AND jl.debit_kobo>0)
BEGIN
 SELECT RAISE(ABORT,'Bakery historical posted cash journal cannot be deleted');
END;
CREATE TRIGGER IF NOT EXISTS bakery_posted_cash_line_no_update
BEFORE UPDATE ON journal_lines
WHEN EXISTS(SELECT 1 FROM journal_entries je JOIN finance_accounts fa
 ON fa.id=OLD.account_id WHERE je.id=OLD.journal_entry_id
 AND je.company_id='company-bakery' AND je.status='posted'
 AND fa.company_id='company-bakery' AND fa.code='1000'
 AND fa.account_type='asset' AND OLD.debit_kobo>0)
BEGIN
 SELECT RAISE(ABORT,'Bakery historical posted cash evidence is immutable');
END;
CREATE TRIGGER IF NOT EXISTS bakery_posted_cash_line_no_delete
BEFORE DELETE ON journal_lines
WHEN EXISTS(SELECT 1 FROM journal_entries je JOIN finance_accounts fa
 ON fa.id=OLD.account_id WHERE je.id=OLD.journal_entry_id
 AND je.company_id='company-bakery' AND je.status='posted'
 AND fa.company_id='company-bakery' AND fa.code='1000'
 AND fa.account_type='asset' AND OLD.debit_kobo>0)
BEGIN
 SELECT RAISE(ABORT,'Bakery historical posted cash evidence cannot be deleted');
END;

-- Do not relabel accounts used in historical Bakery cash-debit entries to
-- hide the entry, or promote a different asset account into Cash & Bank.
CREATE TRIGGER IF NOT EXISTS bakery_cash_account_classification_lock
BEFORE UPDATE OF company_id,code,account_type ON finance_accounts
WHEN (NEW.company_id IS NOT OLD.company_id OR NEW.code IS NOT OLD.code
 OR NEW.account_type IS NOT OLD.account_type)
 AND EXISTS(SELECT 1 FROM journal_lines jl JOIN journal_entries je
 ON je.id=jl.journal_entry_id WHERE jl.account_id=OLD.id
 AND je.company_id='company-bakery' AND je.status='posted'
 AND jl.debit_kobo>0)
 AND (
  (OLD.company_id='company-bakery' AND OLD.code='1000' AND OLD.account_type='asset')
  OR (NEW.company_id='company-bakery' AND NEW.code='1000' AND NEW.account_type='asset')
 )
BEGIN
 SELECT RAISE(ABORT,'Bakery posted cash account classification is immutable');
END;
