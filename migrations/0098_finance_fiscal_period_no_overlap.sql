-- Enforce the same-company fiscal-period range invariant at the database
-- boundary so concurrent requests cannot bypass the application preflight.
CREATE TRIGGER IF NOT EXISTS fiscal_periods_no_overlap_insert
BEFORE INSERT ON fiscal_periods
WHEN EXISTS (
  SELECT 1 FROM fiscal_periods existing
  WHERE existing.company_id = NEW.company_id
    AND NOT (existing.end_date < NEW.start_date OR existing.start_date > NEW.end_date)
)
BEGIN
  SELECT RAISE(ABORT, 'fiscal period overlaps an existing period');
END;

CREATE TRIGGER IF NOT EXISTS fiscal_periods_no_overlap_update
BEFORE UPDATE OF company_id, start_date, end_date ON fiscal_periods
WHEN EXISTS (
  SELECT 1 FROM fiscal_periods existing
  WHERE existing.id <> OLD.id
    AND existing.company_id = NEW.company_id
    AND NOT (existing.end_date < NEW.start_date OR existing.start_date > NEW.end_date)
)
BEGIN
  SELECT RAISE(ABORT, 'fiscal period overlaps an existing period');
END;
