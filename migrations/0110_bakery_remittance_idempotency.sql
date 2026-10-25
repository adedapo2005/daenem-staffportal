PRAGMA foreign_keys=ON;

-- A retryable remittance must carry one stable event identity.
-- The claim is written in the same D1 batch as money and audit evidence.
-- Do not backfill or rewrite legacy money, and never synthesize settlement.
CREATE TABLE IF NOT EXISTS bakery_remittance_requests (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  dispatch_id TEXT NOT NULL REFERENCES bakery_dispatches(id) ON DELETE RESTRICT,
  request_key TEXT NOT NULL,
  payload_fingerprint TEXT NOT NULL,
  money_ledger_id TEXT NOT NULL,
  recorded_by TEXT REFERENCES employees(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, dispatch_id, request_key)
);
CREATE INDEX IF NOT EXISTS idx_bakery_remittance_request_ledger
  ON bakery_remittance_requests(company_id, money_ledger_id);

-- Historical repeated references are NOT deleted or mutated by this migration.
-- New reference-bearing dispatch money entries must not use an existing
-- normalized reference for the same status and same dispatch, irrespective
-- of which application path attempts to write it.
CREATE TRIGGER IF NOT EXISTS bakery_dispatch_money_unique_reference
BEFORE INSERT ON bakery_money_ledger
WHEN NEW.company_id='company-bakery'
 AND NEW.dispatch_id IS NOT NULL
 AND length(trim(COALESCE(NEW.reference,'')))>=4
 AND EXISTS(
   SELECT 1 FROM bakery_money_ledger prior
   WHERE prior.company_id=NEW.company_id
     AND prior.dispatch_id=NEW.dispatch_id
     AND prior.status=NEW.status
     AND length(trim(COALESCE(prior.reference,'')))>=4
     AND lower(trim(prior.reference))=lower(trim(NEW.reference))
 )
BEGIN
 SELECT RAISE(ABORT,'Duplicate Bakery dispatch remittance reference');
END;
