-- Prevent concurrent requests from creating duplicate active lifecycle work.
-- Historical completed or cancelled processes remain valid.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_lifecycle_active_process
  ON hr_lifecycle_processes(employee_id, company_id, process_type)
  WHERE status IN ('planned', 'in_progress', 'blocked');
