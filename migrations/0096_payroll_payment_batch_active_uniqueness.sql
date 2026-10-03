-- Prevent concurrent retries from creating more than one active draft for a
-- payroll run and funding bank. Cancelled/failed drafts remain retryable.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_payment_batches_active_run_bank
  ON payroll_payment_batches(payroll_run_id, funding_bank_key)
  WHERE status NOT IN ('cancelled', 'failed');
