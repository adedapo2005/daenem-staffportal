PRAGMA foreign_keys = ON;

-- Bakery material conversions extend the existing Inventory base unit; they do not create another stock ledger.
-- A conversion is an independently approved, per-item, versioned assertion: 1 input_unit = factor inventory_unit.
-- Old approved versions and recipe snapshots stay intact when managers approve a replacement.
CREATE TABLE IF NOT EXISTS bakery_material_unit_rules (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL DEFAULT 'company-bakery' REFERENCES companies(id) ON DELETE CASCADE,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  input_unit TEXT NOT NULL COLLATE NOCASE,
  inventory_unit TEXT NOT NULL,
  base_quantity_per_input REAL NOT NULL CHECK (base_quantity_per_input > 0 AND base_quantity_per_input <= 100000000),
  version_no INTEGER NOT NULL CHECK (version_no > 0),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected')),
  reason TEXT NOT NULL,
  proposed_by TEXT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  reviewed_by TEXT REFERENCES employees(id) ON DELETE RESTRICT,
  reviewed_at TEXT,
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id,inventory_item_id,input_unit,version_no),
  CHECK (lower(trim(input_unit)) <> lower(trim(inventory_unit))),
  CHECK (reviewed_by IS NULL OR reviewed_by <> proposed_by)
);
CREATE INDEX IF NOT EXISTS idx_bakery_material_units_active ON bakery_material_unit_rules(company_id,inventory_item_id,input_unit,status,version_no DESC);

CREATE TRIGGER IF NOT EXISTS bakery_unit_rule_company_guard
BEFORE INSERT ON bakery_material_unit_rules
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM inventory_items i
    WHERE i.id=NEW.inventory_item_id AND i.company_id=NEW.company_id AND i.active=1
      AND lower(trim(i.unit))=lower(trim(NEW.inventory_unit))
  ) THEN RAISE(ABORT,'Bakery unit rule requires an active company-owned item with matching base unit') END;
END;

CREATE TRIGGER IF NOT EXISTS bakery_unit_rule_immutable
BEFORE UPDATE ON bakery_material_unit_rules
WHEN OLD.status <> 'proposed'
 OR NEW.id <> OLD.id
 OR NEW.company_id <> OLD.company_id
 OR NEW.inventory_item_id <> OLD.inventory_item_id
 OR NEW.input_unit <> OLD.input_unit
 OR NEW.inventory_unit <> OLD.inventory_unit
 OR NEW.base_quantity_per_input <> OLD.base_quantity_per_input
 OR NEW.version_no <> OLD.version_no
 OR NEW.reason <> OLD.reason
 OR NEW.proposed_by <> OLD.proposed_by
 OR NEW.created_at <> OLD.created_at
 OR NEW.status NOT IN ('approved','rejected')
 OR NEW.reviewed_by IS NULL
 OR NEW.reviewed_by = OLD.proposed_by
 OR NEW.reviewed_at IS NULL
BEGIN
  SELECT RAISE(ABORT,'Approved Bakery unit rules are immutable and require independent review');
END;

CREATE TRIGGER IF NOT EXISTS bakery_unit_rule_no_delete
BEFORE DELETE ON bakery_material_unit_rules
BEGIN
  SELECT RAISE(ABORT,'Bakery material conversion history cannot be deleted');
END;

-- Quantity is normalized into inventory base units in the original recipe column.
-- The original entered unit, factor and approved version are immutable historical cost evidence.
ALTER TABLE bakery_recipe_ingredients ADD COLUMN input_quantity REAL;
ALTER TABLE bakery_recipe_ingredients ADD COLUMN input_unit TEXT;
ALTER TABLE bakery_recipe_ingredients ADD COLUMN input_to_base_factor REAL;
ALTER TABLE bakery_recipe_ingredients ADD COLUMN unit_rule_id TEXT REFERENCES bakery_material_unit_rules(id) ON DELETE RESTRICT;
ALTER TABLE bakery_recipe_ingredients ADD COLUMN unit_cost_snapshot_kobo INTEGER;
