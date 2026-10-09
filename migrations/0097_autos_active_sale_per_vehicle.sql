-- Keep one non-cancelled sale per vehicle, including under concurrent writers.
-- Existing duplicates cause this migration to fail closed for review; no rows
-- are deleted, merged, or rewritten here.
CREATE UNIQUE INDEX IF NOT EXISTS uq_auto_sales_active_vehicle
  ON auto_sales(company_id, vehicle_id)
  WHERE sale_status <> 'cancelled';
