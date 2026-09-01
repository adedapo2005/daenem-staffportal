PRAGMA foreign_keys = ON;

-- One physical room can belong to only one active hostel allocation record.
-- The unique index is enforced by D1 even when two allocation requests arrive together.
CREATE UNIQUE INDEX IF NOT EXISTS uq_property_hostel_allocations_unit
  ON property_hostel_allocations(unit_id);
